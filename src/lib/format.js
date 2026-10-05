export function formatBytes(value) {
  if (!value || value < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount >= 100 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export const formatSpeed = (value) => `${formatBytes(value)}/s`;

export const formatRatio = (value) => (value === Infinity ? '∞' : Number(value || 0).toFixed(2));

export const formatPercent = (fraction) => {
  const value = Math.floor((fraction || 0) * 1000) / 10;
  return value >= 100 ? '100' : value.toFixed(1);
};

/** Remaining time, e.g. "12 s" / "3 h 5 min"; unit words come from the locale (time.*). */
export function formatEta(seconds, t) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return t('time.seconds', { n: Math.max(1, Math.round(seconds)) });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('time.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursMinutes', { h: hours, m: minutes % 60 });
  return t('time.daysHours', { d: Math.floor(hours / 24), h: hours % 24 });
}

/** How long something has been going on, e.g. seeding time; '—' when zero. */
export const formatDuration = (seconds, t) => (seconds > 0 ? formatEta(seconds, t) : '—');

export const formatDateTime = (timestamp, locale) => (timestamp ? new Date(timestamp).toLocaleString(locale) : '—');

export const baseName = (filePath) =>
  String(filePath || '')
    .split(/[\\/]/)
    .pop();
