# Peerly

A desktop BitTorrent client for Windows built with Electron, React and WebTorrent.
It does what qBittorrent does — downloading and sharing regular `.torrent` files
and magnet links — with a simpler, calmer interface.

## Download

The latest build of `main`, rebuilt automatically on every push ([all releases](https://github.com/demon3t/peerly/releases)):

| System                                 | Download                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Windows** 64-bit                     | [Peerly-Windows-x64-Setup.exe](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Windows-x64-Setup.exe)                                                                       |
| Windows 32-bit                         | [Peerly-Windows-x86-32bit-Setup.exe](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Windows-x86-32bit-Setup.exe)                                                           |
| Windows ARM64                          | [Peerly-Windows-ARM64-Setup.exe](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Windows-ARM64-Setup.exe)                                                                   |
| **macOS** Apple Silicon (M1 and newer) | [Peerly-macOS-AppleSilicon.dmg](https://github.com/demon3t/peerly/releases/latest/download/Peerly-macOS-AppleSilicon.dmg)                                                                     |
| macOS Intel                            | [Peerly-macOS-Intel.dmg](https://github.com/demon3t/peerly/releases/latest/download/Peerly-macOS-Intel.dmg)                                                                                   |
| **Linux** x64                          | [AppImage](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Linux-x64.AppImage) · [deb](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Linux-x64.deb)     |
| Linux ARM64                            | [AppImage](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Linux-arm64.AppImage) · [deb](https://github.com/demon3t/peerly/releases/latest/download/Peerly-Linux-arm64.deb) |

The installers are not code-signed. On Windows, SmartScreen may ask to confirm: "More info" → "Run anyway".
On macOS, after copying Peerly to Applications run `xattr -cr /Applications/Peerly.app` once.
On Linux, make the AppImage executable (`chmod +x`) or install the `.deb` with `sudo apt install ./Peerly-Linux-x64.deb`.

## Features

- **Torrents**
  - Download from `.torrent` files (several at once) and magnet links, with a metadata preview.
  - Choose which files to download and their priority: skip, normal or high.
  - Create torrents from a file or folder: private flag, custom trackers, comment.
  - Pause, resume, force recheck, move files, add trackers, remove with or without the data.
- **Queue and seeding limits**
  - Download queue: N active downloads, the rest wait.
  - Stop or remove torrents at a ratio or after a seeding time.
- **Speed**
  - Global limits, plus alternative limits (the "turtle" switch).
  - Weekly schedule: every hour is full speed, limited, seeding only or off.
- **Details**
  - Per-file progress and priority, speed chart, peers (client and progress).
  - Trackers with DHT / PEX / LSD status, wasted traffic and seeding time.
- **Statistics**
  - All-time downloaded / uploaded and share ratio, kept even after torrents are removed.
  - Speed chart for the last 10 minutes.
- **Adding torrents**
  - Optional add dialog, add paused, delete the `.torrent` after adding.
  - Watched folder, separate folder for incomplete downloads.
- **Connection**
  - Fixed listening port (falls back to a free one), connection limit, DHT / PEX / LSD.
  - IP filter (P2P / eMule blocklists).
  - Private torrents never leak to public trackers or DHT.
- **Windows integration**
  - Installer with an entry in "Apps & features", `.torrent` association, optional magnet handler.
  - Frameless window, tray, autostart, start minimized, notifications.
- **Interface**
  - Light and dark theme.
  - Languages in plain JSON files: see [locales/README.md](locales/README.md).

## Scripts

| Command                 | What it does                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`           | Vite dev server (UI hot reload) plus Electron that restarts when `electron/`, `shared/` or `locales/` change |
| `npm start`             | Build the UI and run Electron from `dist/`                                                                   |
| `npm run preview`       | UI only, in a browser, backed by mock data                                                                   |
| `npm run dist`          | Icon, UI build and the Windows x64 installer in `release/`                                                   |
| `npm run dist:all`      | UI build and every installer of the current OS, all architectures, in `release/upload/`                      |
| `npm run format`        | Format the whole codebase with Prettier                                                                      |
| `npm run check:locales` | Checks every translation against `en.json`                                                                   |
| `npm run test:engine`   | Engine end-to-end: seed, download, pause, restore, remove                                                    |
| `npm run test:features` | File selection, queue, recheck, move, ratio limit, private torrents, persistence                             |
| `npm run test:settings` | Speed schedule, incomplete folder, watched folder, add paused, delete `.torrent`                             |
| `npm run test:ui`       | Launches the built app via Playwright and saves screenshots to `test-output/`                                |
| `npm run icon`          | Regenerates `build/icon.ico` / `icon.png` from code                                                          |

> When running from a VS Code terminal, `ELECTRON_RUN_AS_NODE` may be set; unset it before the Electron test scripts.

## Architecture

```text
electron/                  main process (CommonJS)
  main.js                  composition root: creates services, wires events, app lifecycle
  config.js                constants: app id, trackers, default settings
  ipc.js                   IPC channel -> service call mapping (no business logic)
  preload.cjs              window.torrentAPI bridge; mirrors ipc.js channel by channel
  core/
    torrent-manager.js     WebTorrent client and all torrents: add/seed/pause/queue/limits/move/persist
    torrent-record.js      record model, progress and traffic math, view mappers
    torrent-source.js      parses magnet / info hash / .torrent input
  services/
    settings.js            persistent, validated preferences (EventEmitter)
    speed-scheduler.js     weekly schedule: hour modes, normal vs alternative limits
    watch-folder.js        auto-adds .torrent files from a folder
    i18n.js                discovers locales, translates main-process strings
    legacy-profile.js      one-time import of the old "Northstar" profile
    system.js              autostart, magnet handler, notifications, disk usage
    open-requests.js       .torrent/magnet arguments from Windows, buffered for the UI
  ui/
    main-window.js         frameless BrowserWindow, native caption buttons, hide-to-tray
    tray.js                tray icon and menu
  lib/                     helpers: json-file, paths, format, errors, peer-client

shared/translate.mjs       translation core used by both processes
locales/                   one <code>.json per language; en.json is the reference

src/                       renderer (React)
  App.jsx                  root: routing, modals, wiring hooks to pages
  api/client.js            the only backend entry point: preload bridge or browser mock
  i18n/                    I18nProvider + useI18n()
  hooks/                   torrents feed, settings, toasts, drag & drop, speed history, …
  features/torrents/       table, row menu, details panel, add/remove/trackers dialogs, actions
  pages/                   Dashboard, Stats, Settings
  components/              UI primitives (Select, Tabs, Checkbox, SpeedChart, …) and layout (title bar, sidebar)
  lib/                     pure helpers: formatting, torrent status & filtering
  mock/                    in-memory API + sample data for browser preview
  styles/                  tokens (light/dark), layout, controls, chart and per-area stylesheets

scripts/                   icon generator, dev runner, end-to-end and UI tests, locale checker
build/                     installer resources (icon, NSIS hooks)
```

**Data flow.**

- The renderer calls commands through `api` (`window.torrentAPI`); `ipc.js` forwards each to the manager or a service.
- `TorrentManager` emits `change`, and `main.js` pushes a `torrents:update` snapshot to the window (plus once per second for live speeds).
- Errors carry a locale key (`UserError`) and are translated in the UI.

**Persistence** lives in `%APPDATA%/peerly/`:

- `settings.json` holds preferences;
- `torrents.json` holds the torrent list (autosaved every 30 s);
- `torrents/<infoHash>.torrent` holds stored metadata;
- `stats.json` holds traffic of removed torrents.

On the first start Peerly imports the data of the old "Northstar" profile (`%APPDATA%/northstar-torrent/`), which is left in place as a backup. Set `PEERLY_USER_DATA` to use a different profile directory (tests do this).

**Engine notes.**

- uTP is disabled: `utp-native` crashes the Electron process on exit while uTP peers are connected.
- Pieces are fetched in order (WebTorrent's `sequential` strategy). Its `rarest` strategy blocks the main process for 10+ seconds at high speed and is about 4× slower.
- WebTorrent has no per-torrent speed limits and no protocol encryption, so Peerly doesn't offer them.

**Share ratio.** Ratio = uploaded ÷ bytes received from peers. Data that was already on disk does not count as downloaded, and duplicate or corrupt blocks are reported separately as "wasted" (like qBittorrent). For your own seeds the content size is used as the denominator.

## Code signing policy

Windows installers will be signed with free code signing provided by [SignPath.io](https://about.signpath.io/),
certificate by [SignPath Foundation](https://signpath.org/).

- Installers are built from this repository's source by [GitHub Actions](.github/workflows/release.yml) on every push to `main`.
- Only binaries built from this repository are signed. Every signing request is approved manually.

**Team roles**

- Committers and reviewers: [demon3t](https://github.com/demon3t)
- Approvers: [demon3t](https://github.com/demon3t)

Contributions from people outside this list are accepted only through pull requests reviewed by a committer.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested
by the user or the person installing or operating it.

Peerly is a BitTorrent client: when you add a torrent or share files, it connects to the trackers listed in
that torrent (plus a few public ones), to the DHT network and to other peers in order to download and upload
that torrent's data. This is how BitTorrent works and other peers can see your IP address while a torrent is active.
If you set an IP filter URL, Peerly downloads that list. There is no telemetry, analytics or update check.
Settings and the torrent list are stored only on your computer.

## License

[MIT](LICENSE)
