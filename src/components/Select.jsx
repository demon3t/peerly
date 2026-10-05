import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useEscape, useOutsideClick } from '../hooks/useKeyboard';

/**
 * Dropdown styled like the rest of the app (the native <select> popup is drawn
 * by Windows and ignores the theme). Keyboard: ↑/↓, Home/End, Enter, Escape.
 *
 * options: [{ value, label, hint? }]
 */
export function Select({ value, options, onChange, ariaLabel, size = 'normal' }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const close = () => setOpen(false);
  const rootRef = useOutsideClick(close, open);
  useEscape(() => {
    close();
    triggerRef.current?.focus();
  }, open);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setActive(selectedIndex);
    // Open upwards when there is no room below (e.g. the last rows of a scrolling list).
    const rect = triggerRef.current?.getBoundingClientRect();
    setDropUp(Boolean(rect && window.innerHeight - rect.bottom < Math.min(280, options.length * 40 + 16)));
  }, [open, selectedIndex, options.length]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function choose(option) {
    close();
    triggerRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(event) {
    const last = options.length - 1;
    const keys = {
      ArrowDown: () => (open ? setActive((i) => Math.min(last, i + 1)) : setOpen(true)),
      ArrowUp: () => (open ? setActive((i) => Math.max(0, i - 1)) : setOpen(true)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => (open ? choose(options[active]) : setOpen(true)),
      ' ': () => (open ? choose(options[active]) : setOpen(true)),
    };
    if (!keys[event.key]) return;
    event.preventDefault();
    keys[event.key]();
  }

  return (
    <div className={size === 'small' ? 'select small' : 'select'} ref={rootRef}>
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={open ? 'select-trigger open' : 'select-trigger'}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="select-value">{selected?.label}</span>
        <ChevronDown size={16} className="select-chevron" />
      </button>

      {open && (
        <ul
          className={dropUp ? 'popover select-menu up' : 'popover select-menu'}
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => (
            <li
              aria-selected={option.value === value}
              className={index === active ? 'select-option active' : 'select-option'}
              key={option.value}
              onClick={() => choose(option)}
              onMouseEnter={() => setActive(index)}
              role="option"
            >
              <span className="select-option-text">
                <span>{option.label}</span>
                {option.hint && <small>{option.hint}</small>}
              </span>
              {option.value === value && <Check size={15} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
