import { RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Asks once whether Peerly may check for updates: no request is made before the user agrees.
 * A found update shows up as the "Update" button in the title bar.
 */
export function UpdateNotice({ settings, onChange }) {
  const { t } = useI18n();
  if (!settings || settings.updatePromptShown) return null;

  return (
    <div className="update-notice" role="dialog" aria-labelledby="update-notice-title">
      <RefreshCw size={18} />
      <div className="update-notice-text">
        <strong id="update-notice-title">{t('updates.askTitle')}</strong>
        <span>{t('updates.askBody')}</span>
        <div className="update-notice-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={() => onChange({ checkUpdates: true, updatePromptShown: true })}
          >
            {t('updates.allow')}
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => onChange({ checkUpdates: false, updatePromptShown: true })}
          >
            {t('updates.deny')}
          </button>
        </div>
      </div>
    </div>
  );
}
