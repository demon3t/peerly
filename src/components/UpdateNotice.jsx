import { useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Card in the corner for two things: asking once whether Peerly may check for updates
 * (no request is made before the user agrees), and telling that a newer version is out.
 */
export function UpdateNotice({ settings, update, onChange, onDownload }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState('');

  if (!settings) return null;

  if (!settings.updatePromptShown) {
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

  const latest = update?.status === 'available' ? update.latest : '';
  if (!latest || latest === settings.skippedVersion || latest === dismissed) return null;

  return (
    <div className="update-notice" role="status">
      <Download size={18} />
      <div className="update-notice-text">
        <strong>{t('updates.availableTitle', { version: latest })}</strong>
        <span>{t('updates.availableBody', { version: update.current })}</span>
        <div className="update-notice-actions">
          <button className="button button-primary" type="button" onClick={onDownload}>
            <Download size={15} /> {t('updates.download')}
          </button>
          <button className="button button-quiet" type="button" onClick={() => onChange({ skippedVersion: latest })}>
            {t('updates.skip')}
          </button>
        </div>
      </div>
      <button
        className="icon-button"
        type="button"
        onClick={() => setDismissed(latest)}
        title={t('updates.later')}
        aria-label={t('updates.later')}
      >
        <X size={15} />
      </button>
    </div>
  );
}
