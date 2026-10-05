const { app, BrowserWindow, shell } = require('electron');
const { APP_NAME, ICON_PATH, PRELOAD_PATH, RENDERER_INDEX, DEV_SERVER_URL } = require('../config');

// Frameless window: the app draws its own title bar (see src/components/layout/TitleBar.jsx);
// Windows keeps its native caption buttons on top of it, so Snap Layouts still work.
const TITLE_BAR_HEIGHT = 40;
const THEMES = {
  light: { background: '#f4f6f5', titleBar: '#eceff0', symbols: '#3f4b4b' },
  dark: { background: '#121818', titleBar: '#0e1414', symbols: '#c9d4d1' },
};
const theme = (dark) => THEMES[dark ? 'dark' : 'light'];

/**
 * The single application window. Closing it hides to tray when
 * `shouldHideOnClose()` says so; pushes to the UI wait for `markReady()`.
 */
class MainWindow {
  constructor({ shouldHideOnClose, darkMode }) {
    this.shouldHideOnClose = shouldHideOnClose;
    this.darkMode = darkMode;
    this.window = null;
    this.rendererReady = false;
    this.quitting = false;
  }

  create({ show = true } = {}) {
    this.rendererReady = false;
    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 640,
      minHeight: 520,
      backgroundColor: theme(this.darkMode()).background,
      title: APP_NAME,
      titleBarStyle: 'hidden',
      titleBarOverlay: this.overlay(),
      icon: ICON_PATH,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.removeMenu();

    if (!app.isPackaged && process.env.PEERLY_DEV_SERVER !== '0') win.loadURL(DEV_SERVER_URL);
    else win.loadFile(RENDERER_INDEX);

    // The app window never navigates; external links go to the browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.on('did-start-loading', () => {
      this.rendererReady = false;
    });

    win.once('ready-to-show', () => {
      if (show) win.show();
    });
    win.on('close', (event) => {
      if (!this.quitting && this.shouldHideOnClose()) {
        event.preventDefault();
        win.hide();
      }
    });
    win.on('closed', () => {
      this.window = null;
      this.rendererReady = false;
    });

    this.window = win;
    return win;
  }

  overlay() {
    const colors = theme(this.darkMode());
    return { color: colors.titleBar, symbolColor: colors.symbols, height: TITLE_BAR_HEIGHT };
  }

  /** Recolors the native caption buttons after a theme change. */
  applyTheme() {
    if (!this.isAlive) return;
    const colors = theme(this.darkMode());
    this.window.setBackgroundColor(colors.background);
    this.window.setTitleBarOverlay(this.overlay());
  }

  get isAlive() {
    return Boolean(this.window && !this.window.isDestroyed());
  }

  /** Parent for native dialogs. */
  get parent() {
    return this.isAlive ? this.window : undefined;
  }

  show() {
    if (!this.isAlive) {
      this.create({ show: true });
      return;
    }
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  markReady() {
    this.rendererReady = true;
  }

  send(channel, payload) {
    if (!this.isAlive || !this.rendererReady) return false;
    this.window.webContents.send(channel, payload);
    return true;
  }
}

module.exports = { MainWindow };
