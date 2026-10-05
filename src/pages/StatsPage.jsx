import { useMemo } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { Ratio, RatioBar } from '../components/Ratio';
import { SpeedChart } from '../components/SpeedChart';
import { StatCard } from '../components/StatCard';
import { TorrentIcon } from '../components/TorrentIcon';
import { useSpeedHistory } from '../hooks/useSpeedHistory';
import { useI18n } from '../i18n/I18nProvider';
import { formatBytes, formatRatio } from '../lib/format';
import { ratioTone } from '../lib/torrentStatus';

/** All-time traffic, the speed chart and every torrent ranked by share ratio. */
export function StatsPage({ torrents, lifetime, onSelect }) {
  const { t } = useI18n();
  const history = useSpeedHistory();
  const byRatio = useMemo(() => [...torrents].sort((a, b) => b.ratio - a.ratio), [torrents]);
  const tone = ratioTone(lifetime.ratio);

  return (
    <>
      <header className="page-header">
        <h1>{t('stats.title')}</h1>
      </header>

      <section className="stats-grid">
        <StatCard
          icon={<ArrowDownToLine size={20} />}
          label={t('stats.downloaded')}
          value={formatBytes(lifetime.received)}
          tone="blue"
        />
        <StatCard
          icon={<ArrowUpFromLine size={20} />}
          label={t('stats.uploaded')}
          value={formatBytes(lifetime.uploaded)}
          tone="green"
        />
        <StatCard
          icon={<Scale size={20} />}
          label={t('stats.ratio')}
          value={formatRatio(lifetime.ratio)}
          tone={`ratio-${tone}`}
        />
      </section>

      <section className="chart-card">
        <h3>{t('chart.title')}</h3>
        <SpeedChart points={history} windowSeconds={600} />
      </section>

      {byRatio.length > 0 && (
        <div className="torrent-table-wrap">
          <table className="torrent-table ratio-table">
            <thead>
              <tr>
                <th>{t('stats.table.torrent')}</th>
                <th>{t('ratio.downloaded')}</th>
                <th>{t('ratio.uploaded')}</th>
                <th title={t('ratio.hint')}>{t('table.ratio')}</th>
              </tr>
            </thead>
            <tbody>
              {byRatio.map((item) => (
                <tr key={item.id} onClick={() => onSelect(item.id)}>
                  <td>
                    <div className="torrent-cell">
                      <TorrentIcon item={item} />
                      <div className="torrent-info">
                        <strong title={item.name}>{item.name || t('table.fetchingMetadata')}</strong>
                      </div>
                    </div>
                  </td>
                  <td className="num">{formatBytes(item.received)}</td>
                  <td className="num">{formatBytes(item.uploaded)}</td>
                  <td>
                    <div className="ratio-with-bar">
                      <RatioBar ratio={item.ratio} />
                      <Ratio ratio={item.ratio} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
