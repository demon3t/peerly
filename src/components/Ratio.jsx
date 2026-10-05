import { useI18n } from '../i18n/I18nProvider';
import { formatBytes, formatRatio } from '../lib/format';
import { ratioTone } from '../lib/torrentStatus';

/** Coloured share ratio, optionally with the uploaded/downloaded amounts below. */
export function Ratio({ ratio, uploaded, received, detailed = false }) {
  const { t } = useI18n();
  return (
    <div className="ratio-cell" title={t('ratio.hint')}>
      <span className={`ratio ${ratioTone(ratio)}`}>{formatRatio(ratio)}</span>
      {detailed && (
        <small>
          ↑ {formatBytes(uploaded)} · ↓ {formatBytes(received)}
        </small>
      )}
    </div>
  );
}

/** Ratio as a bar where the midpoint marks 1.00. */
export function RatioBar({ ratio }) {
  const width = Math.min(100, (ratio / 2) * 100);
  return (
    <div className="ratio-bar">
      <span className={ratioTone(ratio)} style={{ width: `${width}%` }} />
      <i aria-hidden="true" />
    </div>
  );
}
