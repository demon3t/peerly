// Small formatting helpers for the main process (tray tooltip, file names).
function formatSpeed(value) {
  if (!value || value < 1) return '0 B/s';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}/s`;
}

function safeFileName(name) {
  return String(name || 'peerly').replace(/[\/:*?"<>|]/g, '_');
}

module.exports = { formatSpeed, safeFileName };
