import { Check, Minus } from 'lucide-react';

/** App-styled checkbox with an optional label; `indeterminate` shows a dash (e.g. "some files selected"). */
export function Checkbox({ checked, indeterminate = false, onChange, label, hint, disabled = false }) {
  return (
    <label className={disabled ? 'checkbox disabled' : 'checkbox'}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className={checked || indeterminate ? 'checkbox-box on' : 'checkbox-box'} aria-hidden="true">
        {indeterminate ? <Minus size={12} strokeWidth={3} /> : checked && <Check size={12} strokeWidth={3} />}
      </span>
      {(label || hint) && (
        <span className="checkbox-text">
          {label && <span>{label}</span>}
          {hint && <small>{hint}</small>}
        </span>
      )}
    </label>
  );
}
