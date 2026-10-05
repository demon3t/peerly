import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useI18n } from '../../i18n/I18nProvider';

/** Asks for extra tracker URLs (one per line) for a torrent. */
export function AddTrackersModal({ item, onCancel, onConfirm }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const urls = text.split(/\s+/).filter(Boolean);

  return (
    <Modal small title={t('trackersModal.title')} onClose={onCancel}>
      <p className="modal-hint">{t('trackersModal.hint', { name: item.name })}</p>
      <label className="form-label">
        <textarea
          autoFocus
          className="text-input text-area"
          onChange={(event) => setText(event.target.value)}
          placeholder="udp://tracker.example.org:1337/announce"
          rows="5"
          value={text}
        />
      </label>
      <div className="modal-footer">
        <button className="button button-quiet" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={!urls.length}
          onClick={() => onConfirm(item, urls)}
        >
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>
    </Modal>
  );
}
