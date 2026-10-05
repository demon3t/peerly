import { PeerlyMark } from './PeerlyMark';

/**
 * Custom title bar of the frameless window. The whole strip drags the window;
 * Windows draws its native minimize/maximize/close buttons over the right edge.
 */
export function TitleBar({ title }) {
  return (
    <header className="titlebar">
      <span className="titlebar-mark">
        <PeerlyMark size={14} />
      </span>
      <span className="titlebar-name">Peerly</span>
      {title && <span className="titlebar-title">{title}</span>}
    </header>
  );
}
