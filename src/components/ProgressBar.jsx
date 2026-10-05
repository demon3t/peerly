/** Thin progress bar; `tone` follows the torrent status, `size` is normal | wide | tiny. */
export function ProgressBar({ value, tone = 'seeding', size = 'normal' }) {
  const percent = Math.max(0, Math.min(100, (value || 0) * 100));
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(percent)}
      className={`progress-line ${size} ${tone}`}
      role="progressbar"
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
