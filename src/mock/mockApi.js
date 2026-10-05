import { encodeError } from '../../shared/translate.mjs';
import { SAMPLE_TORRENTS, sampleDetails } from './sampleData';

// Every locales/<code>.json is bundled for the preview, just like the desktop app discovers them.
const LOCALES = Object.fromEntries(
  Object.entries(import.meta.glob('../../locales/*.json', { eager: true, import: 'default' })).map(
    ([file, messages]) => [
      file
        .split('/')
        .pop()
        .replace(/\.json$/, ''),
      messages,
    ],
  ),
);

function localeBundle(preferred) {
  const browser = navigator.language || 'en';
  const language =
    [preferred, browser, browser.split('-')[0], 'en'].find((code) => code && code !== 'auto' && LOCALES[code]) ||
    Object.keys(LOCALES)[0];
  return {
    language,
    messages: LOCALES[language],
    fallback: LOCALES.en || {},
    available: Object.entries(LOCALES).map(([code, messages]) => ({ code, name: messages.meta?.name || code })),
  };
}

/**
 * Browser-only stand-in for the Electron bridge (see electron/preload.cjs).
 * Keeps demo torrents in memory and simulates progress so the UI can be
 * developed and reviewed with `npm run preview` / plain Vite.
 */
export function createMockApi() {
  let torrents = SAMPLE_TORRENTS.map((item) => ({ ...item }));
  let settings = {
    language: 'auto',
    showAddDialog: true,
    addPaused: false,
    confirmRemoval: true,
    altSpeedEnabled: false,
    altDownloadLimit: 512,
    altUploadLimit: 128,
    schedule: '0'.repeat(7 * 24),
    downloadPath: 'C:\\Users\\you\\Downloads\\Peerly',
    darkMode: false,
    notifications: true,
    closeToTray: true,
    startWithWindows: false,
    downloadLimit: 0,
    uploadLimit: 0,
    version: 'preview',
    dataPath: '',
    isDefaultMagnet: false,
  };
  const listeners = new Set();
  const i18nListeners = new Set();

  const lifetime = () => {
    const uploaded = torrents.reduce((sum, item) => sum + item.uploaded, 0);
    const received = torrents.reduce((sum, item) => sum + item.received, 0);
    return { uploaded, received };
  };
  const payload = () => ({
    torrents: torrents.map((item) => ({ ...item })),
    network: { online: true, port: 51413, altSpeed: settings.altSpeedEnabled, scheduleMode: 'full' },
    lifetime: lifetime(),
  });
  const emit = () => listeners.forEach((listener) => listener(payload()));
  const find = (id) => {
    const item = torrents.find((candidate) => candidate.id === id);
    if (!item) throw new Error(encodeError('errors.taskNotFound'));
    return item;
  };
  const desktopOnly = () => Promise.reject(new Error(encodeError('errors.desktopOnly')));

  setInterval(() => {
    torrents = torrents.map((item) => {
      if (item.status === 'downloading') {
        const speed = 4_000_000 + Math.random() * 5_000_000;
        const downloaded = Math.min(item.length, item.downloaded + speed);
        const received = item.received + (downloaded - item.downloaded);
        const done = downloaded >= item.length;
        return {
          ...item,
          downloaded,
          received,
          ratio: item.uploaded / received,
          progress: downloaded / item.length,
          downloadSpeed: done ? 0 : speed,
          uploadSpeed: 300_000 + Math.random() * 400_000,
          eta: done ? null : (item.length - downloaded) / speed,
          status: done ? 'seeding' : 'downloading',
          completedAt: done ? Date.now() : item.completedAt,
        };
      }
      if (item.status === 'seeding') {
        const up = 800_000 + Math.random() * 2_000_000;
        return {
          ...item,
          uploadSpeed: up,
          uploaded: item.uploaded + up,
          ratio: (item.uploaded + up) / (item.received || item.length),
        };
      }
      return { ...item, downloadSpeed: 0, uploadSpeed: 0 };
    });
    emit();
  }, 1000);

  return {
    ready: async () => {
      emit();
      return true;
    },
    list: async () => payload(),
    onUpdate: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onOpenRequest: () => () => {},

    settings: async () => ({ ...settings }),
    updateSettings: async (patch) => {
      settings = { ...settings, ...patch };
      if ('language' in patch) i18nListeners.forEach((listener) => listener(localeBundle(settings.language)));
      return { ...settings };
    },
    i18n: async () => localeBundle(settings.language),
    onI18nUpdate: (listener) => {
      i18nListeners.add(listener);
      return () => i18nListeners.delete(listener);
    },
    setDefaultMagnet: desktopOnly,
    disk: async () => ({ free: 340e9, total: 500e9 }),
    openDataFolder: desktopOnly,

    pickTorrent: desktopOnly,
    pickContent: desktopOnly,
    pickFolder: desktopOnly,
    pickFile: desktopOnly,
    pathForFile: (file) => file.name,

    details: async (id) => sampleDetails(find(id)),
    history: async (id) => {
      const now = Date.now();
      const base = id ? find(id) : { downloadSpeed: 6_000_000, uploadSpeed: 1_500_000 };
      return Array.from({ length: id ? 300 : 600 }, (_, i) => ({
        t: now - ((id ? 300 : 600) - i) * 1000,
        down: Math.max(0, (base.downloadSpeed || 0) * (0.7 + 0.3 * Math.sin(i / 17))),
        up: Math.max(0, (base.uploadSpeed || 0) * (0.6 + 0.4 * Math.cos(i / 23))),
      }));
    },
    inspect: async () => ({ name: 'Demo torrent', length: 2_400_000_000, fileCount: 3, files: [] }),
    add: async ({ source }) => {
      const isMagnet = String(source).startsWith('magnet:');
      torrents = [
        {
          ...SAMPLE_TORRENTS[1],
          id: `preview-${Date.now()}`,
          name: isMagnet
            ? 'Big Buck Bunny'
            : String(source)
                .split(/[\\/]/)
                .pop()
                .replace(/\.torrent$/i, ''),
          sourceType: isMagnet ? 'magnet' : 'torrent',
          status: 'downloading',
          progress: 0,
          downloaded: 0,
          received: 0,
          uploaded: 0,
          ratio: 0,
          addedAt: Date.now(),
        },
        ...torrents,
      ];
      emit();
    },
    seed: async ({ source }) => {
      torrents = [
        {
          ...SAMPLE_TORRENTS[3],
          id: `preview-${Date.now()}`,
          name: String(source).split(/[\\/]/).pop(),
          uploaded: 0,
          addedAt: Date.now(),
        },
        ...torrents,
      ];
      emit();
    },
    toggle: async (id) => {
      const item = find(id);
      item.status = item.status === 'paused' ? (item.progress >= 1 ? 'seeding' : 'downloading') : 'paused';
      emit();
    },
    setAllPaused: async (paused) => {
      torrents.forEach((item) => {
        item.status = paused ? 'paused' : item.progress >= 1 ? 'seeding' : 'downloading';
      });
      emit();
    },
    recheck: async () => true,
    move: desktopOnly,
    setFilePriorities: async (id, priorities) => {
      find(id).filePriorities = priorities;
      emit();
    },
    addTrackers: async () => true,
    remove: async (id) => {
      torrents = torrents.filter((item) => item.id !== id);
      emit();
    },
    export: desktopOnly,
    copyMagnet: async (id) => {
      await navigator.clipboard?.writeText(`magnet:?xt=urn:btih:${find(id).infoHash}`);
      return true;
    },
    openFolder: desktopOnly,
    openFile: desktopOnly,
  };
}
