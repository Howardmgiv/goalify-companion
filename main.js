'use strict';
const { app, BrowserWindow, dialog, ipcMain, safeStorage, net, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { parse, MAX_FILE } = require('./lib/luaParser');
const { extract, batch, text } = require('./lib/extractor');
const { ApiClient } = require('./lib/apiClient');

let window, config, api, previews = new Map(), serial = Promise.resolve();
const emptyConfig = () => ({ root: null, install_id: null, encrypted_token: null, stopped: false, accounts: {} });
const configPath = () => path.join(app.getPath('userData'), 'config.json');
async function save() {
  const file = configPath(), temp = file + '.new';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(config), { mode: 0o600 });
  await fs.rename(temp, file);
}
async function load() {
  try { const raw = await fs.readFile(configPath(), 'utf8'); if (Buffer.byteLength(raw) > 16 * 1024 * 1024) throw new Error('Configuration is too large'); const data = JSON.parse(raw); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid configuration'); delete data.auto; return { ...emptyConfig(), ...data, accounts: data.accounts && typeof data.accounts === 'object' && !Array.isArray(data.accounts) ? data.accounts : {} }; }
  catch (e) { if (e.code === 'ENOENT') return emptyConfig(); throw e; }
}
function accountState(id) { return config.accounts[id] ||= { consent: false, approved: false, watermark: 0, partialTime: null, partialHashes: [], lastSync: null, pending: null }; }
function idFor(root, account) { return crypto.createHash('sha256').update(root).update('\0').update(account).digest('hex'); }
function inside(parent, child) { const rel = path.relative(parent, child); return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); }
async function noLinkDirectory(p) { const stat = await fs.lstat(p); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Folder is not a regular directory'); return fs.realpath(p); }
async function resolveGameRoot(chosen) {
  const root = await fs.realpath(chosen);
  const game = path.basename(root).toLowerCase() === '_forever_' ? root : path.join(root, '_forever_');
  const real = await noLinkDirectory(game);
  await noLinkDirectory(path.join(real, 'WTF'));
  return real;
}
async function defaultRoot() {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment\\World of Warcraft', '/v', 'InstallPath'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const match = output.match(/^\s*InstallPath\s+REG_\w+\s+(.+)$/im);
      if (match) { try { return await resolveGameRoot(match[1].trim()); } catch {} }
    } catch {}
    try { return await resolveGameRoot('C:\\Program Files (x86)\\World of Warcraft'); } catch { return null; }
  }
  if (process.platform === 'darwin') { try { return await resolveGameRoot('/Applications/World of Warcraft/_forever_'); } catch { return null; } }
  return null;
}
async function accountList() {
  if (!config.root) return [];
  const game = await resolveGameRoot(config.root), wtf = await noLinkDirectory(path.join(game, 'WTF'));
  if (!inside(game, wtf)) throw new Error('Invalid WoW folder');
  const accountDir = await noLinkDirectory(path.join(wtf, 'Account'));
  if (!inside(wtf, accountDir)) throw new Error('Invalid account folder');
  const entries = await fs.readdir(accountDir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const folder = await noLinkDirectory(path.join(accountDir, entry.name));
      if (!inside(accountDir, folder)) continue;
      const saved = await noLinkDirectory(path.join(folder, 'SavedVariables'));
      if (!inside(folder, saved)) continue;
      const file = path.join(saved, 'Goalify.lua');
      const st = await fs.lstat(file); if (!st.isFile() || st.isSymbolicLink()) continue;
      const actual = await fs.realpath(file); if (!inside(saved, actual) || path.basename(actual).toLowerCase() !== 'goalify.lua') continue;
      out.push({ id: idFor(game, entry.name), label: `${entry.name.slice(0, 2)}${'*'.repeat(Math.max(3, Math.min(8, entry.name.length - 2)))}`, file: actual, game, saved });
    } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') continue; }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
async function accountFor(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid account');
  const account = (await accountList()).find(a => a.id === id); if (!account) throw new Error('Account is no longer available'); return account;
}
async function readAccount(account) {
  const resolved = await fs.realpath(account.file);
  if (resolved !== account.file || !inside(account.saved, resolved) || path.basename(resolved).toLowerCase() !== 'goalify.lua') throw new Error('Unsafe SavedVariables path');
  const handle = await fs.open(resolved, 'r');
  try {
    const stat = await handle.stat(); if (!stat.isFile() || stat.size > MAX_FILE) throw new Error('Goalify.lua exceeds the 32 MB limit');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_FILE + 1)); let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    if (offset > MAX_FILE || offset > stat.size) throw new Error('Goalify.lua changed while reading; try again');
    return parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset))).GoalifyDB;
  } finally { await handle.close(); }
}
async function localeFor(game) {
  try { const file = path.join(game, 'WTF', 'Config.wtf'); const st = await fs.lstat(file); if (!st.isFile() || st.isSymbolicLink() || st.size > 1024 * 1024) return 'unknown'; const content = await fs.readFile(file, 'utf8'); return content.match(/^\s*SET\s+textLocale\s+"([a-z]{2}[A-Z]{2})"/im)?.[1] || 'unknown'; } catch { return 'unknown'; }
}
const inGame = db => db && typeof db === 'object' && db.Settings && db.Settings.CommunitySharing === true;
async function inspect(account) {
  const db = await readAccount(account), state = accountState(account.id), locale = await localeFor(account.game);
  const extracted = extract(db, { ...state, locale });
  const count = extracted.vendors.length + extracted.loot.length + extracted.trainers.length;
  return { db, extracted, count, enabled: !!inGame(db), state };
}
function token() {
  if (!config.encrypted_token) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure token storage is unavailable on this system');
  try { return safeStorage.decryptString(Buffer.from(config.encrypted_token, 'base64')); } catch { throw new Error('The saved token cannot be unlocked'); }
}
async function ensureToken() {
  let t = token(); if (t) return t;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure token storage is unavailable; sharing is disabled');
  const registration = await api.register();
  config.install_id = registration.install_id;
  config.encrypted_token = safeStorage.encryptString(registration.token).toString('base64');
  await save(); return registration.token;
}
async function list() {
  const accounts = await accountList(); const result = [];
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i], s = accountState(a.id);
    try { const info = await inspect(a); result.push({ id: a.id, label: `Account ${i + 1} (${a.label})`, enabled: info.enabled, count: info.count, consent: s.consent === true, lastSync: s.lastSync, pending: !!s.pending }); }
    catch (e) { result.push({ id: a.id, label: `Account ${i + 1} (${a.label})`, enabled: false, count: 0, consent: s.consent === true, lastSync: s.lastSync, pending: !!s.pending, error: 'Unable to read or parse this Goalify.lua.' }); }
  }
  return { accounts: result, stopped: config.stopped === true, installId: typeof config.install_id === 'string' ? config.install_id : null, hasRoot: !!config.root, registered: !!config.encrypted_token };
}
async function preview(id) {
  const a = await accountFor(id), info = await inspect(a);
  if (!info.enabled) throw new Error('Enable Community Sharing in Goalify in-game first, then log out or /reload.');
  const proposal = info.state.pending || batch(info.extracted, info.state, info.state.batchLimit || 5000);
  if (!proposal.count) throw new Error('No new valid observations to send.');
  previews.set(id, proposal);
  return { json: JSON.stringify(proposal.payload, null, 2), count: proposal.count, remaining: proposal.remaining, retry: !!info.state.pending };
}
// Every upload is a batch the user previewed in this session; there is no automatic sync, so changed data is always reviewed.
async function send(id) {
  const a = await accountFor(id), info = await inspect(a), state = info.state;
  if (config.stopped || !state.consent || !info.enabled) throw new Error('Sharing is stopped or consent / in-game opt-in is missing.');
  const proposal = state.pending || previews.get(id);
  if (!proposal || !proposal.count) throw new Error('Preview this account before sending.');
  if (previews.get(id) !== proposal) throw new Error('Preview the pending batch before retrying.');
  state.approved = true;
  state.pending = proposal;
  await save();
  const status = await api.status();
  if (!status.uploads_enabled) throw new Error('Sharing is temporarily paused. The displayed batch is retained for retry.');
  if (proposal.count > status.max_records_per_batch) {
    if (!proposal.attempted) { state.batchLimit = Math.min(status.max_records_per_batch, 5000); state.pending = null; previews.delete(id); await save(); throw new Error('The server batch limit is smaller. Please preview again before sending.'); }
    throw new Error('The server limit is now smaller than the pending retry. Revoke account consent to discard it, then preview again.');
  }
  const t = await ensureToken();
  proposal.attempted = true; await save();
  const result = await api.send(proposal.payload, t);
  Object.assign(state, proposal.next, { lastSync: new Date().toISOString(), pending: null });
  previews.delete(id); await save();
  return { status: result.status, accepted: result.accepted, rejected: result.rejected, remaining: proposal.remaining };
}
function validateBoolean(v) { if (typeof v !== 'boolean') throw new Error('Expected true or false'); return v; }
function validateUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid link');
  const u = new URL(value); if (u.protocol !== 'https:' || u.hostname !== 'goalify.griffify.com' || u.username || u.password || u.port) throw new Error('Link is not allowed'); return u.href;
}
function registerIpc() {
  function handle(name, fn) { ipcMain.handle(name, (event, arg) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Unauthorized request');
    const task = serial.then(() => fn(arg)); serial = task.catch(() => {}); return task;
  }); }
  const noArg = fn => value => { if (value !== undefined) throw new Error('Unexpected argument'); return fn(); };
  handle('list', noArg(list));
  handle('choose', noArg(async () => { const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Choose your World of Warcraft or _forever_ folder' }); if (!result.canceled && result.filePaths.length === 1) { config.root = await resolveGameRoot(result.filePaths[0]); previews.clear(); await save(); } return list(); }));
  handle('preview', id => preview(id));
  handle('send', id => send(id));
  handle('consent', async arg => { if (!arg || typeof arg !== 'object' || Object.keys(arg).sort().join(',') !== 'id,value') throw new Error('Invalid consent'); await accountFor(arg.id); const s = accountState(arg.id); s.consent = validateBoolean(arg.value); if (!s.consent) { s.approved = false; s.pending = null; previews.delete(arg.id); } await save(); return list(); });
  handle('stop', async v => { config.stopped = validateBoolean(v); if (config.stopped) previews.clear(); await save(); return list(); });
  handle('credit', async name => { if (name !== null && !text(name, 32)) throw new Error('Display name must be 1–32 printable characters'); if (config.stopped) throw new Error('Sharing is stopped'); await api.credit(name, await ensureToken()); return true; });
  handle('delete', noArg(async () => { const t = token(); if (t) await api.delete(t); config.install_id = null; config.encrypted_token = null; config.accounts = {}; previews.clear(); await save(); return list(); }));
  handle('external', async url => { await shell.openExternal(validateUrl(url)); });
}
app.whenReady().then(async () => {
  config = await load(); if (!config.root) { config.root = await defaultRoot(); if (config.root) await save(); }
  api = new ApiClient((...args) => net.fetch(...args), process.env.GOALIFY_API_BASE);
  window = new BrowserWindow({ width: 1000, height: 800, minWidth: 700, minHeight: 600, show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  registerIpc(); await window.loadFile(path.join(__dirname, 'renderer', 'index.html')); window.show();
}).catch(() => { dialog.showErrorBox('Goalify Companion', 'Unable to start. Check the configuration and secure storage, then try again.'); app.quit(); });
app.on('window-all-closed', () => app.quit());
