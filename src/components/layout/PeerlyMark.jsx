/** The app icon's three connected peers (the gold one is you), drawn inline. */
export function PeerlyMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 6.5 6.7 16.3M12 6.5l5.3 9.8M6.7 16.3h10.6"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="6.5" r="2.7" fill="#ffd678" />
      <circle cx="6.7" cy="16.3" r="2.4" fill="#fff" />
      <circle cx="17.3" cy="16.3" r="2.4" fill="#fff" />
    </svg>
  );
}
