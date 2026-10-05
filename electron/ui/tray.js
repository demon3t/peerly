const { Menu, Tray, nativeImage } = require('electron');
const { APP_NAME, ICON_PATH } = require('../config');
const { formatSpeed } = require('../lib/format');

function createTray({ t, onShow, onPauseAll, onResumeAll, onQuit }) {
  const tray = new Tray(nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 }));
  tray.setToolTip(APP_NAME);
  tray.on('click', onShow);

  const buildMenu = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('tray.open'), click: onShow },
        { type: 'separator' },
        { label: t('tray.pauseAll'), click: onPauseAll },
        { label: t('tray.resumeAll'), click: onResumeAll },
        { type: 'separator' },
        { label: t('tray.quit'), click: onQuit },
      ]),
    );
  buildMenu();

  return {
    /** Rebuild labels after the language changes. */
    relabel: buildMenu,
    updateSpeeds({ downloadSpeed, uploadSpeed }) {
      tray.setToolTip(`${APP_NAME}\n↓ ${formatSpeed(downloadSpeed)}  ↑ ${formatSpeed(uploadSpeed)}`);
    },
    destroy: () => tray.destroy(),
  };
}

module.exports = { createTray };
