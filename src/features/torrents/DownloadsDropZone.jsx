import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Drop target shown above the downloads list while files are dragged over the window.
 * Only tracks hover for highlighting; the drop itself bubbles up to the window handler (useFileDrop).
 */
export function DownloadsDropZone() {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className={over ? 'downloads-drop-zone over' : 'downloads-drop-zone'}
      onDragEnter={() => {
        depth.current += 1;
        setOver(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
    >
      <div className="drop-icon">
        <Download size={22} />
      </div>
      <strong>{t(over ? 'drop.title' : 'drop.zoneTitle')}</strong>
      <span>{t('drop.hint')}</span>
    </div>
  );
}
