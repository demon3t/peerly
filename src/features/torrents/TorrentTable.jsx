import { Download, Link2, Plus, Search } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { TorrentRow } from './TorrentRow';

/** The torrent list, or an empty / "nothing found" state. */
export function TorrentTable({ items, totalCount, selectedId, actions, onAdd }) {
  const { t } = useI18n();

  if (totalCount === 0) {
    return (
      <div className="torrent-table-wrap">
        <div className="empty-state">
          <div className="empty-icon">
            <Download size={24} />
          </div>
          <h3>{t('dashboard.emptyTitle')}</h3>
          <p>{t('dashboard.emptyText')}</p>
          <div className="empty-actions">
            <button className="button button-secondary" type="button" onClick={() => onAdd('magnet')}>
              <Link2 size={17} /> {t('dashboard.addMagnet')}
            </button>
            <button className="button button-primary" type="button" onClick={() => onAdd('torrent')}>
              <Plus size={18} /> {t('dashboard.addTorrent')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="torrent-table-wrap">
      {items.length > 0 ? (
        <table className="torrent-table">
          <thead>
            <tr>
              <th>{t('table.name')}</th>
              <th>{t('table.progress')}</th>
              <th>{t('table.speed')}</th>
              <th title={t('ratio.hint')}>{t('table.ratio')}</th>
              <th aria-label={t('table.actions')} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <TorrentRow item={item} key={item.id} selected={item.id === selectedId} actions={actions} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state compact">
          <Search size={24} />
          <h3>{t('dashboard.notFoundTitle')}</h3>
          <p>{t('dashboard.notFoundText')}</p>
        </div>
      )}
    </div>
  );
}
