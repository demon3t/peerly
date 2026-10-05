/**
 * Segmented tab switcher used everywhere a view has modes (add dialog, details panel).
 * items: [{ value, label, icon? }]
 */
export function Tabs({ items, value, onChange, disabled = false, className = '' }) {
  return (
    <div className={`tabs ${className}`.trim()} role="tablist">
      {items.map(({ value: itemValue, label, icon: Icon }) => (
        <button
          aria-selected={value === itemValue}
          className={value === itemValue ? 'tab active' : 'tab'}
          disabled={disabled}
          key={itemValue}
          onClick={() => onChange(itemValue)}
          role="tab"
          type="button"
        >
          {Icon && <Icon size={16} />} {label}
        </button>
      ))}
    </div>
  );
}
