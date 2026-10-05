const fs = require('fs');
const path = require('path');
const { app, Notification } = require('electron');
const { ICON_PATH } = require('../config');

/** OS integration: autostart, magnet protocol, notifications, disk usage. */

function applyLoginItem(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--hidden'] });
}

function isDefaultMagnetClient() {
  return app.isDefaultProtocolClient('magnet');
}

function setDefaultMagnetClient() {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient('magnet');
  } else {
    app.setAsDefaultProtocolClient('magnet', process.execPath, [path.resolve(process.argv[1] || '.')]);
  }
  return isDefaultMagnetClient();
}

function showNotification({ title, body, onClick }) {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title, body, icon: ICON_PATH });
  if (onClick) note.on('click', onClick);
  note.show();
}

function diskUsage(target) {
  try {
    const stats = fs.statfsSync(target);
    return { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
}

module.exports = { applyLoginItem, isDefaultMagnetClient, setDefaultMagnetClient, showNotification, diskUsage };
