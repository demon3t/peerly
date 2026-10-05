import { AlertCircle, Check, Info, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

const ICONS = { success: Check, error: AlertCircle, info: Info };

/** The single transient notification in the corner (see hooks/useToast). */
export function Toast({ toast, onDismiss }) {
  const { t } = useI18n();
  if (!toast) return null;
  const Icon = ICONS[toast.tone] || Check;
  return (
    <div className={`toast ${toast.tone}`} key={toast.key} role="status">
      <Icon size={17} />
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} aria-label={t('common.close')}>
        <X size={14} />
      </button>
    </div>
  );
}
