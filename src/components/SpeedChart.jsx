import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { formatSpeed } from '../lib/format';

const HEIGHT = 168;
const MIN_SPAN_SECONDS = 60;
const TOOLTIP_WIDTH = 160;
const PAD = { top: 10, right: 12, bottom: 22, left: 64 };
const SERIES = [
  { key: 'down', labelKey: 'chart.download', className: 'series-down' },
  { key: 'up', labelKey: 'chart.upload', className: 'series-up' },
];

/**
 * Rounds the max up to a readable axis top in the same binary units the labels
 * use (1, 2, 5, 10, 20, 50… KB/s, MB/s), so ticks read "10 MB/s", not "9.5 MB/s".
 */
function niceMax(value) {
  if (value <= 1024) return 1024;
  const unit = 1024 ** Math.floor(Math.log(value) / Math.log(1024));
  const scaled = value / unit;
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((m) => m >= scaled) || 1024;
  return step * unit;
}

/** Axis ticks are round numbers: "50 MB/s", not "50.0 MB/s". */
const tickLabel = (value) => formatSpeed(value).replace(/\.0(?= )/, '');

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Download/upload speed over time: one axis (both are bytes/s), 2px lines with a
 * 10% wash, hairline grid, crosshair + tooltip on hover, legend with current values.
 * The time span grows with the collected history (from one minute) up to
 * `windowSeconds`, so a fresh session isn't a flat line squeezed to the edge.
 */
export function SpeedChart({ points, windowSeconds }) {
  const { t } = useI18n();
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [hover, setHover] = useState(null);

  const now = points.length ? points[points.length - 1].t : Date.now();
  const collected = points.length ? (now - points[0].t) / 1000 : 0;
  const span = Math.min(windowSeconds, Math.max(MIN_SPAN_SECONDS, Math.ceil(collected / 60) * 60));
  const start = now - span * 1000;
  const visible = useMemo(() => points.filter((p) => p.t >= start), [points, start]);
  const max = niceMax(Math.max(0, ...visible.map((p) => Math.max(p.down, p.up))));
  const latest = visible[visible.length - 1] || { down: 0, up: 0 };

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (time) => PAD.left + ((time - start) / (span * 1000)) * plotW;
  const y = (value) => PAD.top + plotH - (value / max) * plotH;
  const baseline = PAD.top + plotH;

  const paths = useMemo(() => {
    if (visible.length < 2 || !plotW) return {};
    return Object.fromEntries(
      SERIES.map(({ key }) => {
        const line = visible.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
        const area = `${line}L${x(visible[visible.length - 1].t).toFixed(1)},${baseline}L${x(visible[0].t).toFixed(1)},${baseline}Z`;
        return [key, { line, area }];
      }),
    );
  }, [visible, plotW, max]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerMove(event) {
    if (!visible.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = start + ((event.clientX - rect.left - PAD.left) / plotW) * span * 1000;
    // Snap to the nearest sample.
    let nearest = visible[0];
    for (const point of visible) if (Math.abs(point.t - time) < Math.abs(nearest.t - time)) nearest = point;
    setHover(nearest);
  }

  const ticks = [0, 0.5, 1].map((f) => f * max);
  const minutes = Math.round(span / 60);

  return (
    <div className="speed-chart" ref={wrapRef}>
      <div className="chart-legend">
        {SERIES.map(({ key, labelKey, className }) => (
          <span key={key} className="chart-legend-item">
            <i className={`line-key ${className}`} aria-hidden="true" />
            {t(labelKey)} <b>{formatSpeed(latest[key])}</b>
          </span>
        ))}
      </div>

      {width > 0 && (
        <svg
          className="chart-svg"
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={t('chart.aria', { minutes, down: formatSpeed(latest.down), up: formatSpeed(latest.up) })}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((value) => (
            <g key={value}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(value)} y2={y(value)} />
              <text className="chart-axis" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
                {tickLabel(value)}
              </text>
            </g>
          ))}
          <text className="chart-axis" x={PAD.left} y={HEIGHT - 6}>
            {t('chart.ago', { minutes })}
          </text>
          <text className="chart-axis" x={width - PAD.right} y={HEIGHT - 6} textAnchor="end">
            {t('chart.now')}
          </text>

          {SERIES.map(
            ({ key, className }) =>
              paths[key] && (
                <g key={key} className={className}>
                  <path className="chart-area" d={paths[key].area} />
                  <path className="chart-line" d={paths[key].line} />
                </g>
              ),
          )}

          {hover && (
            <g>
              <line className="chart-crosshair" x1={x(hover.t)} x2={x(hover.t)} y1={PAD.top} y2={baseline} />
              {SERIES.map(({ key, className }) => (
                <circle key={key} className={`chart-dot ${className}`} cx={x(hover.t)} cy={y(hover[key])} r="4" />
              ))}
            </g>
          )}
        </svg>
      )}

      {hover && width > 0 && (
        <div
          className="chart-tooltip"
          // Opens on the side away from the right edge so it never covers the newest data.
          style={{
            left: x(hover.t) > width / 2 ? x(hover.t) - TOOLTIP_WIDTH - 12 : x(hover.t) + 12,
            top: PAD.top + 28,
          }}
        >
          <small>{t('chart.secondsAgo', { seconds: Math.max(0, Math.round((now - hover.t) / 1000)) })}</small>
          {SERIES.map(({ key, labelKey, className }) => (
            <div key={key} className="chart-tooltip-row">
              <i className={`line-key ${className}`} aria-hidden="true" />
              <b>{formatSpeed(hover[key])}</b>
              <span>{t(labelKey)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
