import { useEffect, useRef } from 'react';

/** Calls `handler` when Escape is pressed while `enabled`. */
export function useEscape(handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Calls `handler` on mousedown outside the element behind the returned ref. */
export function useOutsideClick(handler, enabled = true) {
  const elementRef = useRef(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const onDown = (event) => {
      if (!elementRef.current?.contains(event.target)) handlerRef.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [enabled]);

  return elementRef;
}
