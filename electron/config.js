const path = require('path');

const APP_ID = 'com.peerly.app';
const APP_NAME = 'Peerly';

// Public trackers appended to every torrent so magnets without trackers still find peers quickly.
const EXTRA_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://explodie.org:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
];

const DEFAULT_SETTINGS = {
  language: 'auto', // 'auto' = system language, otherwise a file name from /locales
  downloadPath: '',
  darkMode: false,
  notifications: true,
  closeToTray: true,
  startWithWindows: false,
  // Adding torrents
  showAddDialog: true, // when Windows opens a .torrent/magnet: ask first, or add right away
  addPaused: false, // start new torrents paused
  deleteTorrentAfterAdd: false, // delete the source .torrent file once added
  confirmRemoval: true,
  incompleteEnabled: false, // keep unfinished downloads in a separate folder
  incompletePath: '',
  watchFolder: '', // automatically add .torrent files that appear here; '' = off

  // Speed (KB/s, 0 = unlimited) and the alternative limits
  downloadLimit: 0,
  uploadLimit: 0,
  altSpeedEnabled: false,
  altDownloadLimit: 512,
  altUploadLimit: 128,

  // Weekly schedule: one digit per hour of the week (see services/speed-scheduler.js).
  schedulerEnabled: false,
  schedule: '0'.repeat(7 * 24),

  // Queue: how many torrents download at once (0 = unlimited), like qBittorrent.
  maxActiveDownloads: 3,

  // Seeding limits: what to do when a finished torrent reaches them.
  ratioLimitEnabled: false,
  ratioLimit: 2,
  seedTimeLimitEnabled: false,
  seedTimeLimit: 1440, // minutes
  limitAction: 'pause', // 'pause' | 'remove'

  // Connection (applied by restarting the engine).
  listeningPort: 0, // 0 = pick a random port once and keep it
  maxConns: 200,
  dht: true,
  pex: true,
  lsd: true,
  ipFilterPath: '', // P2P/eMule blocklist file or URL; '' = off

  // System
  startMinimized: false,
};

// Settings that require recreating the WebTorrent client.
const ENGINE_SETTINGS = ['listeningPort', 'maxConns', 'dht', 'pex', 'lsd', 'ipFilterPath'];

// Settings that change the active speed limits.
const SPEED_SETTINGS = [
  'downloadLimit',
  'uploadLimit',
  'altSpeedEnabled',
  'altDownloadLimit',
  'altUploadLimit',
  'schedulerEnabled',
  'schedule',
];

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const RENDERER_INDEX = path.join(__dirname, '..', 'dist', 'index.html');
const DEV_SERVER_URL = 'http://127.0.0.1:5173';

module.exports = {
  APP_ID,
  APP_NAME,
  EXTRA_TRACKERS,
  DEFAULT_SETTINGS,
  ENGINE_SETTINGS,
  SPEED_SETTINGS,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_INDEX,
  DEV_SERVER_URL,
};
