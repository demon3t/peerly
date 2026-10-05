import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from './api/client';
import { DropOverlay } from './components/DropOverlay';
import { Toast } from './components/Toast';
import { Sidebar } from './components/layout/Sidebar';
import { TitleBar } from './components/layout/TitleBar';
import { AddTorrentModal } from './features/torrents/AddTorrentModal';
import { AddTrackersModal } from './features/torrents/AddTrackersModal';
import { DetailsPanel } from './features/torrents/DetailsPanel';
import { RemoveTorrentModal } from './features/torrents/RemoveTorrentModal';
import { useTorrentActions } from './features/torrents/useTorrentActions';
import { useDiskUsage } from './hooks/useDiskUsage';
import { useFileDrop } from './hooks/useFileDrop';
import { useSettings } from './hooks/useSettings';
import { useToast } from './hooks/useToast';
import { useTorrents } from './hooks/useTorrents';
import { useI18n } from './i18n/I18nProvider';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { countByFilter, totals as sumTotals } from './lib/torrentStatus';

const isTorrentFile = (filePath) => /\.torrent$/i.test(filePath);

export default function App() {
  const [route, setRoute] = useState({ page: 'dashboard', filter: 'all' });
  const [modal, setModal] = useState(null); // { type: 'add', mode, sources } | { type: 'remove' | 'trackers', item }
  const [selectedId, setSelectedId] = useState(null);

  const { t, errorText } = useI18n();
  const { toast, show: notify, showError: notifyError, dismiss } = useToast({ errorText });
  const { settings, update: updateSettings, reload: reloadSettings } = useSettings({ onError: notifyError });
  const disk = useDiskUsage(settings?.downloadPath);
  // Callbacks registered once (open requests, drag & drop) read the latest settings from here.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const openAdd = useCallback((mode = 'torrent', sources = []) => {
    setRoute((current) => ({ ...current, page: 'dashboard' }));
    setModal({ type: 'add', mode, sources });
  }, []);

  /** Adds torrents without the dialog ("show add dialog" turned off in settings). */
  const quickAdd = useCallback(
    async (sources) => {
      for (const source of sources) {
        try {
          await api.add({ source });
          notify(t('add.doneOne'));
        } catch (error) {
          notifyError(error);
        }
      }
    },
    [notify, notifyError, t],
  );

  const addTorrents = useCallback(
    (mode, sources) => {
      if (settingsRef.current?.showAddDialog === false) quickAdd(sources);
      else openAdd(mode, sources);
    },
    [openAdd, quickAdd],
  );

  const { torrents, network, lifetime } = useTorrents({
    onOpenRequest: (source) => addTorrents(/^magnet:/i.test(source) ? 'magnet' : 'torrent', [source]),
  });

  const dragging = useFileDrop((paths) => {
    const torrentFiles = paths.filter(isTorrentFile);
    if (torrentFiles.length) addTorrents('torrent', torrentFiles);
    else openAdd('seed', [paths[0]]);
  });

  const showDetails = useCallback((id) => setSelectedId(id), []);
  const requestRemove = useCallback(
    (item) => {
      if (settingsRef.current?.confirmRemoval === false) {
        // No confirmation: remove the task, keep the files (the safe choice).
        setSelectedId((current) => (current === item.id ? null : current));
        api.remove(item.id, false).catch(notifyError);
      } else {
        setModal({ type: 'remove', item });
      }
    },
    [notifyError],
  );
  const requestAddTrackers = useCallback((item) => setModal({ type: 'trackers', item }), []);
  const actions = useTorrentActions({
    t,
    notify,
    notifyError,
    onShowDetails: showDetails,
    onRequestRemove: requestRemove,
    onRequestAddTrackers: requestAddTrackers,
  });

  const counts = useMemo(() => countByFilter(torrents), [torrents]);
  const totals = useMemo(() => sumTotals(torrents), [torrents]);
  const selected = torrents.find((item) => item.id === selectedId) || null;
  // On the downloads list the drop target is an inline field; elsewhere (or under a modal/panel) the full-window hint.
  const inlineDrop = route.page === 'dashboard' && !modal && !selected;

  async function confirmRemove(item, deleteFiles) {
    setModal(null);
    if (selectedId === item.id) setSelectedId(null);
    await actions.remove(item, deleteFiles);
  }

  async function pickDownloadFolder() {
    try {
      const folder = await api.pickFolder(settings?.downloadPath);
      if (folder) updateSettings({ downloadPath: folder });
    } catch (error) {
      notifyError(error);
    }
  }

  async function makeDefaultMagnet() {
    try {
      const ok = await api.setDefaultMagnet();
      notify(t(ok ? 'toast.magnetDefaultOk' : 'toast.magnetDefaultFailed'), ok ? 'success' : 'info');
      reloadSettings();
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <Sidebar
        route={route}
        counts={counts}
        disk={disk}
        network={network}
        onNavigate={(next) => setRoute((current) => ({ ...current, ...next }))}
        onAdd={() => openAdd('torrent')}
        onToggleAltSpeed={() => updateSettings({ altSpeedEnabled: !settings?.altSpeedEnabled })}
      />

      <main className="main-content">
        {route.page === 'dashboard' && (
          <DashboardPage
            torrents={torrents}
            counts={counts}
            totals={totals}
            lifetime={lifetime}
            filter={route.filter}
            selectedId={selectedId}
            actions={actions}
            dropActive={dragging && inlineDrop}
            onAdd={openAdd}
          />
        )}
        {route.page === 'stats' && <StatsPage torrents={torrents} lifetime={lifetime} onSelect={showDetails} />}
        {route.page === 'settings' && (
          <SettingsPage
            settings={settings}
            network={network}
            onChange={updateSettings}
            onPickFolder={pickDownloadFolder}
            onMakeDefaultMagnet={makeDefaultMagnet}
          />
        )}
      </main>

      {selected && (
        <>
          {/* Dims the app behind the panel; a click anywhere outside closes it. */}
          <div className="panel-backdrop" onMouseDown={() => setSelectedId(null)} aria-hidden="true" />
          <DetailsPanel item={selected} actions={actions} onClose={() => setSelectedId(null)} />
        </>
      )}

      {modal?.type === 'add' && (
        <AddTorrentModal
          key={`${modal.mode}-${modal.sources.join('|')}`}
          initialMode={modal.mode}
          defaultPaused={Boolean(settings?.addPaused)}
          initialSources={modal.sources}
          defaultPath={settings?.downloadPath}
          onClose={() => setModal(null)}
          onError={notifyError}
          onDone={(message) => {
            setModal(null);
            notify(message);
          }}
        />
      )}
      {modal?.type === 'trackers' && (
        <AddTrackersModal
          item={modal.item}
          onCancel={() => setModal(null)}
          onConfirm={(item, urls) => {
            setModal(null);
            actions.addTrackers(item, urls);
          }}
        />
      )}
      {modal?.type === 'remove' && (
        <RemoveTorrentModal item={modal.item} onCancel={() => setModal(null)} onConfirm={confirmRemove} />
      )}

      {dragging && !inlineDrop && <DropOverlay />}
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
