/** On/off switch (role="switch") used for boolean settings. */
export function Toggle({ checked, onChange, label }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'toggle checked' : 'toggle'}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span />
    </button>
  );
}
