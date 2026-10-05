// Preload bridge: exposes `window.torrentAPI` to the renderer. Every method maps to
// one IPC channel in electron/ipc.js; nothing else from Node/Electron is reachable.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('torrentAPI', {
  platform: process.platform,
  ready: () => ipcRenderer.invoke('app:ready'),
  pickTorrent: () => ipcRenderer.invoke('dialog:pick-torrent'),
  pickContent: (kind) => ipcRenderer.invoke('dialog:pick-content', kind),
  pickFolder: (current) => ipcRenderer.invoke('dialog:pick-folder', current),
  pickFile: (kind) => ipcRenderer.invoke('dialog:pick-file', kind),
  settings: () => ipcRenderer.invoke('app:settings'),
  i18n: () => ipcRenderer.invoke('app:i18n'),
  updateSettings: (patch) => ipcRenderer.invoke('app:update-settings', patch),
  setDefaultMagnet: () => ipcRenderer.invoke('app:set-default-magnet'),
  disk: () => ipcRenderer.invoke('app:disk'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  list: () => ipcRenderer.invoke('torrent:list'),
  details: (id) => ipcRenderer.invoke('torrent:details', id),
  history: (id) => ipcRenderer.invoke('torrent:history', id),
  inspect: (source) => ipcRenderer.invoke('torrent:inspect', source),
  add: (payload) => ipcRenderer.invoke('torrent:add', payload),
  seed: (payload) => ipcRenderer.invoke('torrent:seed', payload),
  toggle: (id) => ipcRenderer.invoke('torrent:toggle', id),
  recheck: (id) => ipcRenderer.invoke('torrent:recheck', id),
  move: (id) => ipcRenderer.invoke('torrent:move', id),
  setFilePriorities: (id, priorities) => ipcRenderer.invoke('torrent:set-file-priorities', id, priorities),
  addTrackers: (id, urls) => ipcRenderer.invoke('torrent:add-trackers', id, urls),
  setAllPaused: (paused) => ipcRenderer.invoke('torrent:set-all-paused', paused),
  remove: (id, deleteFiles) => ipcRenderer.invoke('torrent:remove', id, deleteFiles),
  export: (id) => ipcRenderer.invoke('torrent:export', id),
  copyMagnet: (id) => ipcRenderer.invoke('torrent:copy-magnet', id),
  openFolder: (id) => ipcRenderer.invoke('torrent:open-folder', id),
  openFile: (id, filePath) => ipcRenderer.invoke('torrent:open-file', id, filePath),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onUpdate: subscribe('torrents:update'),
  onOpenRequest: subscribe('app:open-request'),
  onI18nUpdate: subscribe('i18n:update'),
});
