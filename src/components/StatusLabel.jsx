import { Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { isBusy, statusInfo } from '../lib/torrentStatus';

/** Coloured torrent status with a dot, or a spinner while metadata is fetched / data is checked. */
export function StatusLabel({ item }) {
  const { t } = useI18n();
  const { labelKey, tone } = statusInfo(item.status);
  const label = t(labelKey);
  return (
    <span className={`status-label ${tone}`} title={item.error || label}>
      {isBusy(item) ? <Loader2 size={12} className="spin" /> : <i />}
      {label}
    </span>
  );
}
