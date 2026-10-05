// Locations of the profile and default folders.
const path = require('path');
const { app } = require('electron');

const userPath = (...parts) => path.join(app.getPath('userData'), ...parts);

module.exports = {
  dataDir: () => app.getPath('userData'),
  settingsPath: () => userPath('settings.json'),
  defaultDownloadPath: () => path.join(app.getPath('downloads'), 'Peerly'),
};
