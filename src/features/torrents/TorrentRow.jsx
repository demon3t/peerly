import { Pause, Play } from 'lucide-react';
import { ProgressBar } from '../../components/ProgressBar';
import { Ratio } from '../../components/Ratio';
import { StatusLabel } from '../../components/StatusLabel';
import { TorrentIcon } from '../../components/TorrentIcon';
import { useI18n } from '../../i18n/I18nProvider';
import { formatBytes, formatEta, formatPercent, formatSpeed } from '../../lib/format';
import { isActive, isStopped, statusInfo } from '../../lib/torrentStatus';
import { RowMenu } from './RowMenu';

function progressNote(item, t) {
  if (item.progress >= 1) return ''; // 100% already says it
  if (isActive(item) && item.eta) return t('table.remaining', { time: formatEta(item.eta, t) });
  return item.length ? t('table.ofSize', { done: formatBytes(item.downloaded), total: formatBytes(item.length) }) : '';
}

/** One table row: click opens details, double-click opens the folder. */
export function TorrentRow({ item, selected, actions }) {
  const { t } = useI18n();
  const { tone } = statusInfo(item.status);
  const toggleLabel = isStopped(item) ? t('actions.resume') : t('actions.pause');

  return (
    <tr
      className={selected ? 'selected' : ''}
      onClick={() => actions.showDetails(item)}
      onDoubleClick={() => actions.openFolder(item)}
    >
      <td>
        <div className="torrent-cell">
          <TorrentIcon item={item} />
          <div className="torrent-info">
            <strong title={item.name}>{item.name || t('table.fetchingMetadata')}</strong>
            <span>
              <StatusLabel item={item} /> <i /> {item.length ? formatBytes(item.length) : t('table.sizeUnknown')}
            </span>
          </div>
        </div>
      </td>
      <td>
        <div className="progress-cell">
          <div className="progress-top">
            <ProgressBar value={item.progress} tone={tone} />
            <span>{formatPercent(item.progress)}%</span>
          </div>
          <small>{progressNote(item, t)}</small>
        </div>
      </td>
      <td>
        <div className="speed-cell">
          <span className={item.downloadSpeed ? 'down' : ''}>
            ↓ {item.downloadSpeed ? formatSpeed(item.downloadSpeed) : '—'}
          </span>
          <span className={item.uploadSpeed ? 'up' : ''}>
            ↑ {item.uploadSpeed ? formatSpeed(item.uploadSpeed) : '—'}
          </span>
        </div>
      </td>
      <td>
        <Ratio ratio={item.ratio} uploaded={item.uploaded} received={item.received} detailed />
      </td>
      <td>
        <div
          className="row-actions"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            className="row-icon"
            type="button"
            title={toggleLabel}
            aria-label={toggleLabel}
            onClick={() => actions.toggle(item)}
          >
            {isStopped(item) ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <RowMenu item={item} actions={actions} />
        </div>
      </td>
    </tr>
  );
}
