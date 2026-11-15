'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const id = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('Invalid account'); return value; };
const bool = value => { if (typeof value !== 'boolean') throw new TypeError('Invalid setting'); return value; };
contextBridge.exposeInMainWorld('goalify', Object.freeze({
  list: () => ipcRenderer.invoke('list'), choose: () => ipcRenderer.invoke('choose'),
  preview: value => ipcRenderer.invoke('preview', id(value)), send: value => ipcRenderer.invoke('send', id(value)),
  consent: (account, value) => ipcRenderer.invoke('consent', { id: id(account), value: bool(value) }),
  stop: value => ipcRenderer.invoke('stop', bool(value)),
  credit: value => { if (value !== null && (typeof value !== 'string' || value.length > 64)) throw new TypeError('Invalid display name'); return ipcRenderer.invoke('credit', value); },
  deleteData: () => ipcRenderer.invoke('delete'),
  external: value => { if (typeof value !== 'string' || value.length > 2048) throw new TypeError('Invalid link'); return ipcRenderer.invoke('external', value); }
}));
