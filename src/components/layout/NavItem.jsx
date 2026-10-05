/** Sidebar entry: icon, label and an optional counter on the right. */
export function NavItem({ active, icon, label, onClick, trailing }) {
  return (
    <button
      className={active ? 'nav-item active' : 'nav-item'}
      type="button"
      onClick={onClick}
      title={label}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
      {trailing !== undefined && <b>{trailing}</b>}
    </button>
  );
}
