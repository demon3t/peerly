import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  File,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { ProgressBar } from '../../components/ProgressBar';
import { RatioBar } from '../../components/Ratio';
import { SpeedChart } from '../../components/SpeedChart';
import { Select } from '../../components/Select';
import { StatusLabel } from '../../components/StatusLabel';
import { Tabs } from '../../components/Tabs';
import { TorrentIcon } from '../../components/TorrentIcon';
import { useEscape } from '../../hooks/useKeyboard';
import { useSpeedHistory } from '../../hooks/useSpeedHistory';
import { useI18n } from '../../i18n/I18nProvider';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
} from '../../lib/format';
import { isActive, isStopped, ratioTone, statusInfo } from '../../lib/torrentStatus';
import { RowMenu } from './RowMenu';

const REFRESH_MS = 1500;
const TABS = ['files', 'speed', 'peers', 'trackers', 'info'];
const PRIORITIES = [
  { value: 0, key: 'details.priority.skip' },
  { value: 1, key: 'details.priority.normal' },
  { value: 2, key: 'details.priority.high' },
];

/** Polls full details (files, peers) only while the panel is open. */
function useTorrentDetails(id) {
  const [details, setDetails] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .details(id)
        .then((next) => {
          if (!cancelled) setDetails(next);
        })
        .catch(() => {}); // the torrent may have been removed meanwhile
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, version]);

  useEffect(() => setDetails(null), [id]);

  return [details, () => setVersion((v) => v + 1)];
}

export function DetailsPanel({ item, actions, onClose }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('files');
  const [details, refresh] = useTorrentDetails(item.id);
  useEscape(onClose);
  const { tone } = statusInfo(item.status);

  async function changePriority(file, priority) {
    const priorities = details.files.map((f) => (f.index === file.index ? priority : f.priority));
    await actions.setFilePriorities(item, priorities);
    refresh();
  }

  return (
    <aside className="details-panel" aria-label={t('details.label')}>
      <div className="details-header">
        <TorrentIcon item={item} />
        <div className="details-title">
          <strong title={item.name}>{item.name || t('table.fetchingMetadata')}</strong>
          <StatusLabel item={item} />
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={t('common.close')}>
          <X size={18} />
        </button>
      </div>

      {item.error && (
        <div className="details-error">
          <AlertCircle size={15} /> {item.error}
        </div>
      )}

      <div className="details-progress">
        <div className="details-progress-top">
          <span>{t('table.ofSize', { done: formatBytes(item.downloaded), total: formatBytes(item.length) })}</span>
          <strong>{formatPercent(item.progress)}%</strong>
        </div>
        <ProgressBar value={item.progress} tone={tone} size="wide" />
      </div>

      <div className="details-metrics">
        <Metric
          icon={<ArrowDownToLine size={14} />}
          label={t('details.download')}
          value={formatSpeed(item.downloadSpeed)}
        />
        <Metric
          icon={<ArrowUpFromLine size={14} />}
          label={t('details.upload')}
          value={formatSpeed(item.uploadSpeed)}
        />
        <Metric icon={<Users size={14} />} label={t('details.peers')} value={item.peers || 0} />
        {isActive(item) ? (
          <Metric icon={<Clock size={14} />} label={t('details.remaining')} value={formatEta(item.eta, t)} />
        ) : (
          <Metric
            icon={<Clock size={14} />}
            label={t('details.seedingTime')}
            value={formatDuration(item.seedingSeconds, t)}
          />
        )}
      </div>

      <div className="details-ratio" title={t('ratio.hint')}>
        <div className="details-ratio-top">
          <span>{t('table.ratio')}</span>
          <strong className={`ratio-value ${ratioTone(item.ratio)}`}>{formatRatio(item.ratio)}</strong>
        </div>
        <RatioBar ratio={item.ratio} />
        <div className="details-ratio-numbers">
          <span>
            ↑ {t('ratio.uploaded')} <b>{formatBytes(item.uploaded)}</b>
          </span>
          <span>
            ↓ {t('ratio.downloaded')} <b>{formatBytes(item.received)}</b>
          </span>
        </div>
      </div>

      <div className="details-actions">
        <button className="button button-secondary" type="button" onClick={() => actions.toggle(item)}>
          {isStopped(item) ? (
            <>
              <Play size={15} /> {t('actions.resume')}
            </>
          ) : (
            <>
              <Pause size={15} /> {t('actions.pause')}
            </>
          )}
        </button>
        <button className="button button-secondary" type="button" onClick={() => actions.openFolder(item)}>
          <FolderOpen size={15} /> {t('details.folder')}
        </button>
        <RowMenu item={item} actions={actions} inPanel />
      </div>

      <Tabs
        className="details-tabs"
        items={TABS.map((value) => ({ value, label: t(`details.tabs.${value}`) }))}
        value={tab}
        onChange={setTab}
      />

      <div className="details-body">
        {!details && (
          <div className="details-empty">
            <Loader2 size={18} className="spin" /> {t('common.loading')}
          </div>
        )}
        {details && tab === 'files' && (
          <FilesTab files={details.files} onOpen={(file) => actions.openFile(item, file)} onPriority={changePriority} />
        )}
        {tab === 'speed' && <SpeedTab id={item.id} />}
        {details && tab === 'peers' && <PeersTab peers={details.peerList} paused={isStopped(item)} />}
        {details && tab === 'trackers' && (
          <TrackersTab details={details} onAdd={() => actions.requestAddTrackers(item)} />
        )}
        {details && tab === 'info' && <InfoTab details={details} />}
      </div>
    </aside>
  );
}

function FilesTab({ files, onOpen, onPriority }) {
  const { t } = useI18n();
  if (!files.length) return <div className="details-empty">{t('details.noFiles')}</div>;
  const options = PRIORITIES.map(({ value, key }) => ({ value, label: t(key) }));
  return (
    <ul className="file-list">
      {files.map((file) => (
        <li key={file.path} className={file.priority === 0 ? 'skipped' : ''}>
          <button type="button" onDoubleClick={() => onOpen(file)} title={t('details.openFileHint')}>
            <File size={15} />
            <div>
              <strong title={file.path}>{file.name}</strong>
              <div className="file-meta">
                <ProgressBar value={file.progress} size="tiny" />
                <span>
                  {formatBytes(file.length)} · {Math.floor(file.progress * 100)}%
                </span>
              </div>
            </div>
          </button>
          {files.length > 1 && (
            <Select
              size="small"
              ariaLabel={t('details.priority.label')}
              value={file.priority}
              options={options}
              onChange={(value) => onPriority(file, value)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function SpeedTab({ id }) {
  const points = useSpeedHistory(id);
  return <SpeedChart points={points} windowSeconds={300} />;
}

function PeersTab({ peers, paused }) {
  const { t } = useI18n();
  if (!peers.length) {
    return <div className="details-empty">{t(paused ? 'details.pausedNoPeers' : 'details.searchingPeers')}</div>;
  }
  return (
    <ul className="peer-list">
      {peers.map((peer, index) => (
        <li key={`${peer.address}-${index}`}>
          <div className="peer-main">
            <span className="peer-address" title={peer.address}>
              {peer.address}
            </span>
            <small>
              {peer.client || t('details.unknownClient')} · {peer.type}
            </small>
          </div>
          <span className="peer-progress" title={t('details.peerProgress')}>
            {Math.floor(peer.progress * 100)}%
          </span>
          <span>↓ {formatSpeed(peer.downloadSpeed)}</span>
          <span>↑ {formatSpeed(peer.uploadSpeed)}</span>
        </li>
      ))}
    </ul>
  );
}

function TrackersTab({ details, onAdd }) {
  const { t } = useI18n();
  const sourceState = (on) =>
    t(details.isPrivate ? 'details.trackers.private' : on ? 'details.trackers.on' : 'details.trackers.off');
  return (
    <>
      <ul className="tracker-list">
        {['dht', 'pex', 'lsd'].map((key) => (
          <li key={key} className="tracker-source">
            <span>{t(`details.trackers.${key}`)}</span>
            <small>{sourceState(details.sources[key])}</small>
          </li>
        ))}
        {details.trackers.map((url) => (
          <li key={url}>
            <span className="mono" title={url}>
              {url}
            </span>
          </li>
        ))}
      </ul>
      <button className="button button-secondary tracker-add" type="button" onClick={onAdd}>
        <Plus size={15} /> {t('details.trackers.add')}
      </button>
    </>
  );
}

function InfoTab({ details }) {
  const { t, locale } = useI18n();
  return (
    <dl className="info-list">
      <InfoRow
        label={t('details.info.size')}
        value={
          details.totalLength !== details.length
            ? t('details.info.selected', {
                selected: formatBytes(details.length),
                total: formatBytes(details.totalLength),
              })
            : formatBytes(details.length)
        }
      />
      <InfoRow label={t('details.info.files')} value={details.files.length || details.fileCount || '—'} />
      <InfoRow label={t('details.info.wasted')} value={formatBytes(details.wasted)} />
      <InfoRow label={t('details.info.seedingTime')} value={formatDuration(details.seedingSeconds, t)} />
      {details.isPrivate && <InfoRow label={t('details.info.type')} value={t('details.info.private')} />}
      <InfoRow label={t('details.info.added')} value={formatDateTime(details.addedAt, locale)} />
      {details.completedAt && (
        <InfoRow label={t('details.info.completed')} value={formatDateTime(details.completedAt, locale)} />
      )}
      <InfoRow label={t('details.info.folder')} value={details.savePath || '—'} mono />
      <InfoRow label={t('details.info.infoHash')} value={details.infoHash || '—'} mono />
    </dl>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <span>
        {icon} {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : ''} title={String(value)}>
        {value}
      </dd>
    </div>
  );
}
