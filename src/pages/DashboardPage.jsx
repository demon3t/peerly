import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { isDesktop } from '../api/client';
import { Ratio } from '../components/Ratio';
import { DownloadsDropZone } from '../features/torrents/DownloadsDropZone';
import { TorrentTable } from '../features/torrents/TorrentTable';
import { useI18n } from '../i18n/I18nProvider';
import { formatBytes, formatSpeed } from '../lib/format';
import { FILTERS, applyFilter } from '../lib/torrentStatus';

/** Main page: the filtered torrent list with search and a traffic summary. */
export function DashboardPage({ torrents, counts, totals, lifetime, filter, selectedId, actions, dropActive, onAdd }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => applyFilter(torrents, filter, query), [torrents, filter, query]);
  const titleKey = FILTERS.find((item) => item.value === filter)?.labelKey || 'nav.all';

  return (
    <>
      <header className="page-header">
        <h1>{t(titleKey)}</h1>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label={t('dashboard.search')}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('dashboard.search')}
            value={query}
          />
          {query && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setQuery('')}
              aria-label={t('dashboard.clearSearch')}
            >
              <X size={14} />
            </button>
          )}
        </label>
      </header>

      {counts.all > 0 && (
        <div className="summary-bar">
          <span>
            <b className="down">↓ {formatSpeed(totals.down)}</b>
          </span>
          <span>
            <b className="up">↑ {formatSpeed(totals.up)}</b>
          </span>
          <span className="summary-sep" />
          <span>
            {t('ratio.downloaded')} <b>{formatBytes(lifetime.received)}</b>
          </span>
          <span>
            {t('ratio.uploaded')} <b>{formatBytes(lifetime.uploaded)}</b>
          </span>
          <span className="summary-ratio">
            {t('table.ratio')} <Ratio ratio={lifetime.ratio} />
          </span>
        </div>
      )}

      {dropActive && <DownloadsDropZone />}

      {!isDesktop && <div className="demo-note">{t('dashboard.demoNote')}</div>}

      <TorrentTable items={visible} totalCount={counts.all} selectedId={selectedId} actions={actions} onAdd={onAdd} />
    </>
  );
}
