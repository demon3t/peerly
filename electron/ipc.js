const fs = require('fs');
const path = require('path');
const { app, clipboard, dialog, ipcMain, shell } = require('electron');
const { safeFileName } = require('./lib/format');
const system = require('./services/system');

/**
 * Thin translation layer between the renderer and the services.
 * Every channel here has a matching method in preload.cjs.
 */
/** Version of an installed dependency, read from its package.json (exports maps may hide it from require). */
function packageVersion(name) {
  try {
    const file = path.join(app.getAppPath(), 'node_modules', name, 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).version || '';
  } catch {
    return '';
  }
}

function registerIpc({ manager, settings, i18n, mainWindow, onRendererReady }) {
  const t = (key, params) => i18n.t(key, params);
  const torrentFilter = () => [{ name: t('dialogs.torrentFiles'), extensions: ['torrent'] }];
  const handle = (channel, fn) => ipcMain.handle(channel, (_, ...args) => fn(...args));
  const runtimeVersions = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    webtorrent: packageVersion('webtorrent'),
  };
  const settingsView = () => ({
    ...settings.all(),
    downloadPath: settings.downloadPath(),
    version: app.getVersion(),
    versions: runtimeVersions,
    dataPath: app.getPath('userData'),
    isDefaultMagnet: system.isDefaultMagnetClient(),
  });

  // ----- app -----
  handle('app:ready', () => {
    mainWindow.markReady();
    onRendererReady();
    return true;
  });
  handle('app:settings', settingsView);
  handle('app:update-settings', (patch) => {
    settings.update(patch);
    return settingsView();
  });
  handle('app:i18n', () => i18n.bundle());
  handle('app:set-default-magnet', () => system.setDefaultMagnetClient());
  handle('app:disk', () => system.diskUsage(settings.downloadPath()));
  handle('app:open-data-folder', async () => {
    const error = await shell.openPath(app.getPath('userData'));
    if (error) throw new Error(error);
    return true;
  });

  // ----- native dialogs -----
  handle('dialog:pick-torrent', async () => {
    const result = await dialog.showOpenDialog(mainWindow.parent, {
      title: t('dialogs.pickTorrent'),
      properties: ['openFile', 'multiSelections'],
      filters: torrentFilter(),
    });
    return result.canceled ? [] : result.filePaths;
  });
  handle('dialog:pick-content', async (kind) => {
    const result = await dialog.showOpenDialog(mainWindow.parent, {
      title: t(kind === 'folder' ? 'dialogs.pickSeedFolder' : 'dialogs.pickSeedFile'),
      properties: [kind === 'folder' ? 'openDirectory' : 'openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('dialog:pick-file', async (kind) => {
    const filters =
      kind === 'ipfilter' ? [{ name: t('dialogs.ipFilterFiles'), extensions: ['p2p', 'dat', 'txt', 'gz'] }] : [];
    const result = await dialog.showOpenDialog(mainWindow.parent, { properties: ['openFile'], filters });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('dialog:pick-folder', async (current) => {
    const result = await dialog.showOpenDialog(mainWindow.parent, {
      title: t('dialogs.pickDownloadFolder'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: current || settings.downloadPath(),
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ----- torrents -----
  handle('torrent:list', () => ({
    torrents: manager.list(),
    network: manager.network(),
    lifetime: manager.lifetime(),
  }));
  handle('torrent:details', (id) => manager.details(id));
  handle('torrent:history', (id) => manager.speedHistory(id));
  handle('torrent:inspect', (source) => manager.inspect(source));
  handle('torrent:add', (payload = {}) => manager.add(payload));
  handle('torrent:seed', (payload = {}) => manager.seed(payload));
  handle('torrent:toggle', (id) => manager.toggle(id));
  handle('torrent:recheck', (id) => manager.recheck(id));
  handle('torrent:set-file-priorities', (id, priorities) =>
    manager.setFilePriorities(id, Array.isArray(priorities) ? priorities : []),
  );
  handle('torrent:add-trackers', (id, urls) => manager.addTrackers(id, urls));
  handle('torrent:move', async (id) => {
    const result = await dialog.showOpenDialog(mainWindow.parent, {
      title: t('dialogs.moveTo'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: manager.get(id).savePath,
    });
    if (result.canceled || !result.filePaths[0]) return false;
    await manager.move(id, result.filePaths[0]);
    return true;
  });
  handle('torrent:set-all-paused', (paused) => manager.setAllPaused(Boolean(paused)));
  handle('torrent:remove', (id, deleteFiles) => manager.remove(id, { deleteFiles: Boolean(deleteFiles) }));

  handle('torrent:export', async (id) => {
    const source = manager.torrentFilePath(id);
    const { name } = manager.details(id);
    const result = await dialog.showSaveDialog(mainWindow.parent, {
      title: t('dialogs.saveTorrent'),
      defaultPath: path.join(app.getPath('downloads'), `${safeFileName(name)}.torrent`),
      filters: torrentFilter(),
    });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.copyFile(source, result.filePath);
    return true;
  });
  handle('torrent:copy-magnet', (id) => {
    clipboard.writeText(manager.magnetURI(id));
    return true;
  });
  handle('torrent:open-folder', async (id) => {
    const target = manager.contentPath(id);
    if (fs.existsSync(target)) shell.showItemInFolder(target);
    else await shell.openPath(manager.get(id).savePath);
    return true;
  });
  handle('torrent:open-file', async (id, relativePath) => {
    const error = await shell.openPath(manager.filePath(id, relativePath));
    if (error) throw new Error(error);
    return true;
  });
}

module.exports = { registerIpc };
