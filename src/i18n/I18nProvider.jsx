import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createTranslator, decodeError } from '../../shared/translate.mjs';
import { api } from '../api/client';

const I18nContext = createContext(null);

/**
 * Loads the active language bundle from the backend (locales/*.json) and
 * re-renders the app when the language changes.
 */
export function I18nProvider({ children }) {
  const [bundle, setBundle] = useState(null);

  useEffect(() => {
    api.i18n().then(setBundle);
    return api.onI18nUpdate(setBundle);
  }, []);

  const value = useMemo(() => {
    if (!bundle) return null;
    const locale = bundle.messages.meta?.locale || bundle.language;
    const t = createTranslator({ messages: bundle.messages, fallback: bundle.fallback, locale });

    /** Human-readable text for any error, translating backend error keys. */
    const errorText = (error) => {
      const message = error?.message || String(error || '');
      const decoded = decodeError(message);
      if (decoded) return t(decoded.key, decoded.params);
      return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || t('errors.unknown');
    };

    return { t, errorText, locale, language: bundle.language, languages: bundle.available };
  }, [bundle]);

  useEffect(() => {
    if (value) document.documentElement.lang = value.language;
  }, [value]);

  if (!value) return null; // the bundle arrives within one IPC round-trip
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** { t, errorText, locale, language, languages } */
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}
