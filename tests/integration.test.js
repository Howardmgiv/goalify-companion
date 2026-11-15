'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

test('account consent, preview, offline retry, opt-in and deletion are enforced by main', async () => {
  const base = path.join(__dirname, `.synthetic-${process.pid}`), root = path.join(base, 'WoW'), game = path.join(root, '_forever_');
  const saved = path.join(game, 'WTF', 'Account', 'SyntheticOnly', 'SavedVariables');
  const file = path.join(saved, 'Goalify.lua');
  const lua = enabled => `GoalifyDB = { Settings = { CommunitySharing = ${enabled} }, Characters = { SECRET_CHARACTER = { Gold = 500 } }, SourceObservations = { Version=1, Interface=16001, Vendors={ [10]={Name="Vendor",Locations={ [1]={MapID=1,Zone="Zone"} }, Items={ ["20:1"]={ItemID=20,Name="Item",PackSize=1,PackCopper=5,ExtendedCost=false,Available=-1,LastSeen=100,Build="70888"} } } } } }`;
  await fs.mkdir(saved, { recursive: true }); await fs.writeFile(file, lua('true'));
  const handlers = new Map(), requests = [], app = new EventEmitter(); let win, show;
  const shown = new Promise(resolve => { show = resolve; });
  app.getPath = () => path.join(base, 'userdata'); app.whenReady = async () => {}; app.quit = () => {}; app.isPackaged = true;
  class BrowserWindow { constructor() { win = this; this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, send() {} }; } async loadFile() {} show() { show(); } }
  let batches = 0;
  const json = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fake = {
    app, BrowserWindow,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [root] }), showErrorBox: () => { throw Error('Startup failed'); } },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: () => Buffer.from('encrypted'), decryptString: () => 'synthetic-secret' },
    shell: { openExternal: async () => {} },
    net: { fetch: async (url, opts) => {
      requests.push({ url, opts });
      if (url.endsWith('/status')) return json({ api: 1, uploads_enabled: true, max_records_per_batch: 5000 });
      if (url.endsWith('/installs') && opts.method === 'POST') return json({ install_id: '00000000-0000-4000-8000-000000000001', token: 'synthetic-secret' }, 201);
      if (url.endsWith('/batches')) { if (++batches === 1) throw Error('offline'); return json({ status: 'duplicate' }); }
      if (url.endsWith('/installs/me') && opts.method === 'DELETE') return json(null, 204);
      throw Error('Unexpected request');
    } }
  };
  const original = Module._load;
  try {
    Module._load = function(request, ...args) { return request === 'electron' ? fake : original.call(this, request, ...args); };
    require('../main'); Module._load = original;
    await shown;
    const invoke = (name, arg) => handlers.get(name)({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, arg);
    const listed = await invoke('choose'); assert.equal(listed.accounts.length, 1);
    const id = listed.accounts[0].id;
    const p = await invoke('preview', id); assert.doesNotMatch(p.json, /SECRET_CHARACTER|Gold|SyntheticOnly/);
    await assert.rejects(invoke('send', id), /consent/); assert.equal(requests.length, 0);
    await invoke('consent', { id, value: true }); assert.equal(requests.length, 0);
    await assert.rejects(invoke('send', id), /connection/);
    let state = await invoke('list'); assert.equal(state.accounts[0].pending, true); assert.equal(state.accounts[0].lastSync, null);
    assert.doesNotMatch(await fs.readFile(path.join(base, 'userdata', 'config.json'), 'utf8'), /synthetic-secret/);
    const retry = await invoke('preview', id); assert.equal(retry.json, p.json);
    await fs.writeFile(file, lua('false')); await assert.rejects(invoke('send', id), /in-game/); assert.equal(batches, 1);
    await fs.writeFile(file, lua('true')); const result = await invoke('send', id); assert.equal(result.status, 'duplicate');
    const batchRequests = requests.filter(r => r.url.endsWith('/batches')); assert.equal(batchRequests[0].opts.body, batchRequests[1].opts.body);
    state = await invoke('list'); assert.equal(state.accounts[0].pending, false); assert.equal(state.accounts[0].count, 0); assert.ok(state.accounts[0].lastSync);
    await invoke('delete'); state = await invoke('list'); assert.equal(state.registered, false); assert.equal(state.accounts[0].consent, false);
    await assert.rejects(invoke('external', 'https://services.griffify.com/test'), /not allowed/);
  } finally {
    Module._load = original; app.emit('window-all-closed'); await fs.rm(base, { recursive: true, force: true });
  }
});
