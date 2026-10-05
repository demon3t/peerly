import { useCallback, useEffect, useState } from 'react';

const DURATION = { success: 3400, info: 4200, error: 5200 };

/** One transient notification at a time. `errorText` turns an error into readable text. */
export function useToast({ errorText }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, tone = 'success') => setToast({ message, tone, key: Date.now() }), []);
  const showError = useCallback((error) => show(errorText(error), 'error'), [show, errorText]);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(dismiss, DURATION[toast.tone] || DURATION.success);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return { toast, show, showError, dismiss };
}
