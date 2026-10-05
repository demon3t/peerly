// Domain helpers shared by every view that renders a torrent.

const TONES = {
  downloading: 'downloading',
  metadata: 'downloading',
  checking: 'downloading',
  queued: 'queued',
  scheduled: 'queued',
  seeding: 'seeding',
  completed: 'seeding',
  paused: 'paused',
  error: 'error',
};

/** Colour tone plus the locale key of the status label (status.*). */
export const statusInfo = (status) => {
  const known = status in TONES ? status : 'downloading';
  return { tone: TONES[known], labelKey: `status.${known}` };
};

export const isActive = (item) => ['downloading', 'metadata', 'checking'].includes(item.status);

/** Unfinished work, including torrents waiting in the queue. */
export const isDownloadTask = (item) =>
  isActive(item) || item.status === 'queued' || (item.status === 'scheduled' && item.progress < 1);

export const isBusy = (item) => item.status === 'metadata' || item.status === 'checking';

export const isStopped = (item) => ['paused', 'completed', 'error'].includes(item.status);

export const FILTERS = [
  { value: 'all', labelKey: 'nav.all', match: () => true },
  { value: 'active', labelKey: 'nav.active', match: isDownloadTask },
  { value: 'seeding', labelKey: 'nav.seeding', match: (item) => item.status === 'seeding' },
  { value: 'completed', labelKey: 'nav.completed', match: (item) => item.progress >= 1 },
  { value: 'paused', labelKey: 'nav.paused', match: (item) => item.status === 'paused' || item.status === 'completed' },
];

export function countByFilter(torrents) {
  return Object.fromEntries(FILTERS.map((filter) => [filter.value, torrents.filter(filter.match).length]));
}

export function applyFilter(torrents, filterValue, query) {
  const filter = FILTERS.find((candidate) => candidate.value === filterValue) || FILTERS[0];
  const needle = query.trim().toLowerCase();
  return torrents
    .filter((item) => !needle || item.name.toLowerCase().includes(needle))
    .filter(filter.match)
    .sort((a, b) => b.addedAt - a.addedAt);
}

/** Current transfer speeds across all torrents. */
export function totals(torrents) {
  return torrents.reduce(
    (acc, item) => ({ down: acc.down + (item.downloadSpeed || 0), up: acc.up + (item.uploadSpeed || 0) }),
    { down: 0, up: 0 },
  );
}

/** Share-ratio colour: below 0.5 is "taking", 1.0+ means you gave back at least as much. */
export function ratioTone(ratio) {
  if (ratio >= 1) return 'good';
  if (ratio >= 0.5) return 'fair';
  return 'low';
}
