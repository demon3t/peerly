import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Checkbox } from '../../components/Checkbox';
import { Modal } from '../../components/Modal';
import { useI18n } from '../../i18n/I18nProvider';

/** Confirms removal; downloaded files are kept unless the user ticks the box (own seeds are never deleted). */
export function RemoveTorrentModal({ item, onCancel, onConfirm }) {
  const { t } = useI18n();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const isSeed = item.sourceType === 'seed';

  return (
    <Modal danger small title={t('remove.title')} onClose={onCancel}>
      <p className="modal-copy">{t('remove.text', { name: item.name })}</p>
      {isSeed ? (
        <p className="modal-hint">{t('remove.seedHint')}</p>
      ) : (
        <div className="checkbox-row">
          <Checkbox checked={deleteFiles} onChange={setDeleteFiles} label={t('remove.deleteFiles')} />
        </div>
      )}
      <div className="modal-footer">
        <button className="button button-quiet" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="button button-danger" type="button" autoFocus onClick={() => onConfirm(item, deleteFiles)}>
          <Trash2 size={16} /> {t('common.delete')}
        </button>
      </div>
    </Modal>
  );
}
