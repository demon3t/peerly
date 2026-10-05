import { Download } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

/** Full-window hint shown while files are dragged over the app. */
export function DropOverlay() {
  const { t } = useI18n();
  return (
    <div className="drop-overlay">
      <div className="drop-overlay-card">
        <div className="drop-icon large">
          <Download size={28} />
        </div>
        <strong>{t('drop.title')}</strong>
        <span>{t('drop.hint')}</span>
      </div>
    </div>
  );
}
