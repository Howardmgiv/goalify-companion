'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const crypto = require('node:crypto');
const vm = require('node:vm');

test('account consent, preview, offline retry, opt-in and deletion are enforced by main', async () => {
  const base = path.join(__dirname, `.synthetic-${process.pid}`), root = path.join(base, 'WoW'), game = path.join(root, '_forever_');
  const saved = path.join(game, 'WTF', 'Account', 'SyntheticOnly', 'SavedVariables');
  const file = path.join(saved, 'Goalify.lua');
  const extra = more => more ? `, ["21:1"]={ItemID=21,Name="Second",PackSize=1,PackCopper=7,ExtendedCost=false,Available=-1,LastSeen=200,Build="70888"}` : '';
  const lua = (enabled, more = false) => `GoalifyDB = { Settings = { CommunitySharing = ${enabled} }, Characters = { SECRET_CHARACTER = { Gold = 500 } }, SourceObservations = { Version=1, Interface=16001, Vendors={ [10]={Name="Vendor",Locations={ [1]={MapID=1,Zone="Zone"} }, Items={ ["20:1"]={ItemID=20,Name="Item",PackSize=1,PackCopper=5,ExtendedCost=false,Available=-1,LastSeen=100,Build="70888"}${extra(more)} } } } } }`;
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
    assert.equal(listed.version, require('../package.json').version);
    assert.equal(listed.accounts[0].totals.vendors, 1);
    assert.ok(Date.parse(listed.accounts[0].savedAt));
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
    await fs.writeFile(file, lua('true', true));
    assert.equal((await invoke('list')).sendMode, 'auto', 'automatic sending is the default');
    await invoke('mode', 'manual'); assert.equal((await invoke('auto')).ran, false, 'manual mode never sends on its own');
    await assert.rejects(invoke('mode', 'sometimes'), /send mode/);
    await invoke('mode', 'auto'); await invoke('consent', { id, value: false });
    assert.deepEqual(await invoke('auto'), { ran: true, batches: 0, records: 0 }, 'no consent, nothing sent');
    const before = batches;
    await invoke('consent', { id, value: true });
    assert.deepEqual(await invoke('auto'), { ran: true, batches: 1, records: 1 });
    assert.equal(batches, before + 1);
    assert.match(requests.filter(r => r.url.endsWith('/batches')).at(-1).opts.body, /"item_id":21/);
    assert.equal((await invoke('auto')).ran, false, 'automatic sends are throttled');
    await fs.writeFile(file, 'invalid SavedVariables');
    await invoke('mode', 'auto');
    assert.match((await invoke('auto')).error, /read or parse/, 'automatic read failures are visible and do not look like a successful empty sync');
    await fs.writeFile(file, lua('true', true));
    state = await invoke('list'); assert.equal(state.accounts[0].count, 0);
    await invoke('external', 'https://buymeacoffee.com/griffifystudios');
    await assert.rejects(invoke('external', 'https://buymeacoffee.com/someoneelse'), /not allowed/);
    await invoke('delete'); state = await invoke('list'); assert.equal(state.registered, false); assert.equal(state.accounts[0].consent, false);
    await assert.rejects(invoke('external', 'https://services.griffify.com/test'), /not allowed/);
  } finally {
    Module._load = original; app.emit('window-all-closed'); await fs.rm(base, { recursive: true, force: true });
  }
});

test('configs saved before automatic sending existed stay in manual mode', async () => {
  const base = path.join(__dirname, `.legacy-${process.pid}`), userdata = path.join(base, 'userdata');
  await fs.mkdir(userdata, { recursive: true });
  await fs.writeFile(path.join(userdata, 'config.json'), JSON.stringify({ root: null, install_id: null, encrypted_token: null, stopped: false, accounts: { a: { consent: true } } }));
  const handlers = new Map(), app = new EventEmitter(); let win, show;
  const shown = new Promise(resolve => { show = resolve; });
  app.getPath = () => userdata; app.whenReady = async () => {}; app.quit = () => {}; app.isPackaged = true;
  class BrowserWindow { constructor() { win = this; this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, send() {} }; } async loadFile() {} show() { show(); } }
  const fake = { app, BrowserWindow, dialog: { showErrorBox: () => { throw Error('Startup failed'); } }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    safeStorage: { isEncryptionAvailable: () => true }, shell: {}, net: { fetch: async () => { throw Error('Unexpected request'); } } };
  const original = Module._load;
  try {
    delete require.cache[require.resolve('../main')];
    Module._load = function(request, ...args) { return request === 'electron' ? fake : original.call(this, request, ...args); };
    require('../main'); Module._load = original;
    await shown;
    const invoke = (name, arg) => handlers.get(name)({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, arg);
    assert.equal((await invoke('list')).sendMode, 'manual');
    assert.equal((await invoke('auto')).ran, false);
  } finally {
    Module._load = original; app.emit('window-all-closed'); await fs.rm(base, { recursive: true, force: true });
  }
});

test('legacy pending retry is acknowledged before historical source backfill and schema rejection keeps cursor', async () => {
  const base = path.join(__dirname, `.backfill-${process.pid}`), game = path.join(base, 'WoW', '_forever_');
  const saved = path.join(game, 'WTF', 'Account', 'SyntheticOnly', 'SavedVariables'), userdata = path.join(base, 'userdata');
  await fs.mkdir(saved, { recursive: true }); await fs.mkdir(userdata, { recursive: true });
  await fs.writeFile(path.join(saved, 'Goalify.lua'), `GoalifyDB={Settings={CommunitySharing=true},GuardDirectory={Services={[20]={Name="Banker",Roles={Banker=true},Labels={},Locations={[1]={MapID=1,Zone="Town"}},LastSeen=100,Build="70888"}}}}`);
  const account = crypto.createHash('sha256').update(game).update('\0').update('SyntheticOnly').digest('hex');
  const payload = { schema: 1, batch_id: '00000000-0000-4000-8000-000000000001', addon_version: '1', companion_version: '1', interface: 16001, locale: 'unknown', vendors: [{ npc_id: 1 }], loot: [], trainers: [] };
  await fs.writeFile(path.join(userdata, 'config.json'), JSON.stringify({ root: game, sendMode: 'manual', encrypted_token: 'ZW5j', accounts: { [account]: { consent: true, watermark: 900, pending: { payload, count: 1, next: { watermark: 1000 }, remaining: 0, attempted: true } } } }));
  const handlers = new Map(), app = new EventEmitter(), requests = []; let win, show, ready = false, calls = 0;
  const shown = new Promise(resolve => { show = resolve; });
  app.getPath = () => userdata; app.whenReady = async () => {}; app.quit = () => {}; app.isPackaged = true;
  class BrowserWindow { constructor() { win = this; this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} }; } async loadFile() {} show() { show(); } }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fake = { app, BrowserWindow, dialog: { showErrorBox: () => { throw Error('Startup failed'); } }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    safeStorage: { isEncryptionAvailable: () => true, decryptString: () => 'synthetic-token' }, shell: {},
    net: { fetch: async (url, opts) => {
      if (url.endsWith('/status')) return json({ api: 1, uploads_enabled: true, max_records_per_batch: 5000, source_schema: ready ? 1 : 0 });
      if (url.endsWith('/batches')) { requests.push(opts.body); if (++calls === 1) throw Error('offline'); return json({ status: 'duplicate' }); }
      throw Error('Unexpected request');
    } } };
  const original = Module._load;
  try {
    delete require.cache[require.resolve('../main')];
    Module._load = function(request, ...args) { return request === 'electron' ? fake : original.call(this, request, ...args); };
    require('../main'); Module._load = original; await shown;
    const invoke = (name, arg) => handlers.get(name)({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, arg);
    const first = await invoke('preview', account); assert.equal(JSON.parse(first.json).batch_id, payload.batch_id);
    await assert.rejects(invoke('send', account), /connection/);
    assert.equal((await invoke('preview', account)).json, first.json);
    await invoke('send', account);
    assert.equal(requests[0], requests[1]);
    const backfill = await invoke('preview', account); assert.equal(JSON.parse(backfill.json).services[0].last_seen, 100);
    await assert.rejects(invoke('send', account), /upgrade/);
    assert.equal(requests.length, 2);
    assert.equal((await invoke('preview', account)).json, backfill.json);
    ready = true; await invoke('send', account);
    assert.equal(requests[2], JSON.stringify(JSON.parse(backfill.json)));
    assert.equal((await invoke('list')).accounts[0].count, 0);
    const state = JSON.parse(await fs.readFile(path.join(userdata, 'config.json'), 'utf8')).accounts[account];
    assert.equal(state.sourceVersion, 2); assert.equal(state.watermark, 100);
  } finally { Module._load = original; app.emit('window-all-closed'); await fs.rm(base, { recursive: true, force: true }); }
});

test('About and fixed Store update links work without game-file access or resetting saved settings', async () => {
  const base = path.join(__dirname, `.about-${process.pid}`), userdata = path.join(base, 'userdata');
  const file = path.join(userdata, 'config.json');
  const retained = JSON.stringify({
    root: path.join(base, 'Unavailable WoW'), sendMode: 'auto', stopped: true,
    install_id: 'synthetic-install', encrypted_token: 'ZW5j',
    accounts: { a: { consent: true, watermark: 900, sourceVersion: 2, pending: { payload: { batch_id: 'synthetic-batch' } } } },
  });
  await fs.mkdir(userdata, { recursive: true }); await fs.writeFile(file, retained);
  const handlers = new Map(), app = new EventEmitter(), opened = []; let win, show, failStore = false;
  const shown = new Promise(resolve => { show = resolve; });
  app.getPath = name => { assert.equal(name, 'userData'); return userdata; };
  app.whenReady = async () => {}; app.quit = () => {}; app.isPackaged = true;
  class BrowserWindow {
    constructor() { win = this; this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} }; }
    async loadFile() {} show() { show(); }
  }
  const fake = {
    app, BrowserWindow, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showErrorBox: () => { throw Error('Startup failed'); } },
    safeStorage: {}, net: { fetch: async () => { throw Error('Unexpected request'); } },
    shell: { openExternal: async url => { if (failStore) throw Error('Store unavailable'); opened.push(url); } },
  };
  const original = Module._load, storeDescriptor = Object.getOwnPropertyDescriptor(process, 'windowsStore');
  try {
    Object.defineProperty(process, 'windowsStore', { value: true, configurable: true, writable: true });
    delete require.cache[require.resolve('../main')];
    Module._load = function(request, ...args) { return request === 'electron' ? fake : original.call(this, request, ...args); };
    require('../main'); Module._load = original; await shown;
    const invoke = (name, arg) => handlers.get(name)({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, arg);
    assert.deepEqual(await invoke('about'), { version: require('../package.json').version, distribution: 'store' });
    await assert.rejects(invoke('list'), /ENOENT/);
    assert.equal((await invoke('about')).distribution, 'store', 'About survives an unavailable saved WoW folder');
    await invoke('updates');
    assert.equal(opened[0], 'ms-windows-store://downloadsandupdates');
    process.windowsStore = false;
    assert.equal((await invoke('about')).distribution, 'standalone');
    await invoke('updates');
    assert.equal(opened[1], 'https://apps.microsoft.com/detail/9N4167K6C8CN');
    await assert.rejects(invoke('updates', 'file:///untrusted'), /Unexpected argument/);
    await assert.rejects(invoke('about', true), /Unexpected argument/);
    assert.throws(() => handlers.get('updates')({ sender: {}, senderFrame: {} }), /Unauthorized/);
    failStore = true;
    await assert.rejects(invoke('updates'), /Store unavailable/);
    assert.equal(await fs.readFile(file, 'utf8'), retained,
      'Loading and inspecting the new version retains consent, encrypted credentials, mode, watermark and pending retry unchanged');
  } finally {
    Module._load = original;
    if (storeDescriptor) Object.defineProperty(process, 'windowsStore', storeDescriptor); else delete process.windowsStore;
    delete require.cache[require.resolve('../main')];
    app.emit('window-all-closed'); await fs.rm(base, { recursive: true, force: true });
  }
});

test('About UI retains version on scan failure and opens Store without claiming an update check', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { listeners: {}, textContent: '', addEventListener(event, fn) { this.listeners[event] = fn; } });
    return nodes.get(id);
  };
  let updates = 0;
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8'), {
    document: { getElementById: node },
    window: { goalify: {
      about: async () => ({ version: '9.8.7', distribution: 'store' }),
      list: async () => { throw Error('WoW folder unavailable'); },
      updates: async () => { updates++; },
    } },
    setInterval() {},
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('app-version').textContent, 'Version 9.8.7');
  assert.match(node('about-version').textContent, /9\.8\.7.*Microsoft Store/);
  assert.equal(node('message').textContent, 'WoW folder unavailable');
  assert.equal(node('updates').textContent, 'Open Microsoft Store updates');
  await node('updates').listeners.click();
  assert.equal(updates, 1);
  assert.match(node('message').textContent, /has not checked whether a newer version is available/);
});
