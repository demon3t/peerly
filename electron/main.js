// Composition root: wires services together and owns the app lifecycle.
const { app } = require('electron');
const { APP_ID, ENGINE_SETTINGS, SPEED_SETTINGS } = require('./config');
const { SettingsStore } = require('./services/settings');
const { I18n } = require('./services/i18n');
const { migrateLegacyProfile } = require('./services/legacy-profile');
const { WatchFolder } = require('./services/watch-folder');
const { OpenRequestQueue } = require('./services/open-requests');
const system = require('./services/system');
const { TorrentManager } = require('./core/torrent-manager');
const { MainWindow } = require('./ui/main-window');
const { createTray } = require('./ui/tray');
const { registerIpc } = require('./ipc');
const paths = require('./lib/paths');

app.setAppUserModelId(APP_ID);

// Isolated profile for tests / portable runs.
if (process.env.PEERLY_USER_DATA) app.setPath('userData', process.env.PEERLY_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const UPDATE_INTERVAL_MS = 1000;

const settings = new SettingsStore();
const i18n = new I18n();
const t = (key, params) => i18n.t(key, params);
const manager = new TorrentManager({
  settings,
  dataDir: paths.dataDir(),
  // utp-native crashes the Electron process (0xC0000005) on exit while uTP
  // peers are connected; plain TCP works with every client.
  clientOptions: { utp: false },
});
const watchFolder = new WatchFolder({ manager, settings });
let tray = null;

const mainWindow = new MainWindow({
  shouldHideOnClose: () => Boolean(settings.get('closeToTray') && tray),
  darkMode: () => settings.get('darkMode'),
});

const openRequests = new OpenRequestQueue({
  deliver: (target) => {
    if (!mainWindow.send('app:open-request', target)) return false;
    mainWindow.show();
    return true;
  },
});

function pushUpdate() {
  const network = manager.network();
  mainWindow.send('torrents:update', { torrents: manager.list(), network, lifetime: manager.lifetime() });
  tray?.updateSpeeds(network);
}

function quit() {
  mainWindow.quitting = true;
  app.quit();
}

settings.on('change', (_, changed) => {
  if (changed.some((key) => SPEED_SETTINGS.includes(key))) manager.applyLimits();
  if (changed.includes('watchFolder')) watchFolder.restart();
  if (changed.includes('startWithWindows')) system.applyLoginItem(settings.get('startWithWindows'));
  if (changed.includes('language')) i18n.setLanguage(settings.get('language'));
  if (changed.includes('darkMode')) mainWindow.applyTheme();
  if (changed.includes('maxActiveDownloads')) manager.schedule();
  if (changed.some((key) => ENGINE_SETTINGS.includes(key))) {
    manager.restartEngine().catch((error) => console.error('Engine restart failed', error));
  }
});

manager.on('change', pushUpdate);

manager.on('completed', ({ name }) => {
  if (!settings.get('notifications')) return;
  system.showNotification({
    title: t('notifications.completedTitle'),
    body: t('notifications.completedBody', { name }),
    onClick: () => mainWindow.show(),
  });
});

app.on('second-instance', (_, argv) => {
  mainWindow.show();
  openRequests.pushFromArgv(argv);
});

app.whenReady().then(async () => {
  // Only the real profile inherits the old Northstar data, never a test/portable one.
  if (!process.env.PEERLY_USER_DATA && migrateLegacyProfile())
    console.log('Migrated data from the old Northstar profile');
  settings.load();
  await i18n.init(settings.get('language'));
  i18n.on('change', () => {
    tray?.relabel();
    mainWindow.send('i18n:update', i18n.bundle());
  });

  registerIpc({
    manager,
    settings,
    i18n,
    mainWindow,
    onRendererReady: () => {
      pushUpdate();
      openRequests.flush();
    },
  });

  tray = createTray({
    t,
    onShow: () => mainWindow.show(),
    onPauseAll: () => manager.setAllPaused(true),
    onResumeAll: () => manager.setAllPaused(false),
    onQuit: quit,
  });

  await manager.start();
  watchFolder.restart();
  // Autostart passes --hidden; "start minimized" keeps the window in the tray too.
  mainWindow.create({ show: !process.argv.includes('--hidden') && !settings.get('startMinimized') });
  openRequests.pushFromArgv(process.argv);

  setInterval(pushUpdate, UPDATE_INTERVAL_MS);
});

app.on('window-all-closed', () => {
  if (!settings.get('closeToTray') || mainWindow.quitting) app.quit();
});

let shuttingDown = false;
app.on('before-quit', (event) => {
  mainWindow.quitting = true;
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  manager.shutdown().finally(() => app.exit(0));
});
