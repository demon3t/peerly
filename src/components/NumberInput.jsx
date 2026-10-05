import { useEffect, useState } from 'react';

/** Numeric field that commits on blur or Enter; `decimals` allows fractions (e.g. ratio 1.5). */
export function NumberInput({
  value,
  onCommit,
  unit,
  decimals = 0,
  min = 0,
  max = Infinity,
  disabled = false,
  ariaLabel,
}) {
  const format = (number) => String(Number(number || 0));
  const [draft, setDraft] = useState(format(value));
  useEffect(() => setDraft(format(value)), [value]);

  const commit = () => {
    const factor = 10 ** decimals;
    const parsed = Math.round((Number(draft.replace(',', '.')) || 0) * factor) / factor;
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(format(next));
    if (next !== Number(value || 0)) onCommit(next);
  };

  const pattern = decimals ? /[^\d.,]/g : /[^\d]/g;

  return (
    <div className={disabled ? 'number-input disabled' : 'number-input'}>
      <input
        aria-label={ariaLabel}
        className="text-input"
        disabled={disabled}
        inputMode={decimals ? 'decimal' : 'numeric'}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value.replace(pattern, ''))}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        value={draft}
      />
      {unit && <span>{unit}</span>}
    </div>
  );
}
