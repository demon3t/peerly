// Translation core shared by the main process (electron/services/i18n.js) and
// the renderer (src/i18n). Locale files live in /locales; see locales/README.md.

const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages);
}

function isPluralNode(node) {
  return (
    node && typeof node === 'object' && 'other' in node && Object.keys(node).every((k) => PLURAL_FORMS.includes(k))
  );
}

function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}

/**
 * Creates t(key, params) for one language with a fallback language.
 * - "{name}" placeholders are replaced from params.
 * - A value like { "one": "{count} file", "other": "{count} files" } is chosen
 *   by params.count using the language's plural rules (Intl.PluralRules).
 * - Missing keys fall back to the fallback language, then to the key itself.
 */
export function createTranslator({ messages, fallback = {}, locale = 'en' }) {
  let pluralRules;
  try {
    pluralRules = new Intl.PluralRules(locale);
  } catch {
    pluralRules = new Intl.PluralRules('en');
  }

  function resolve(source, key, params) {
    let node = lookup(source, key);
    if (isPluralNode(node)) node = node[pluralRules.select(Number(params.count) || 0)] ?? node.other;
    return typeof node === 'string' ? interpolate(node, params) : undefined;
  }

  return function t(key, params = {}) {
    return resolve(messages, key, params) ?? resolve(fallback, key, params) ?? key;
  };
}

/** Errors cross the IPC boundary as text, so translatable errors carry their key and params encoded in the message. */
export const ERROR_PREFIX = 'i18n:';

export function encodeError(key, params = {}) {
  return `${ERROR_PREFIX}${JSON.stringify({ key, params })}`;
}

export function decodeError(message) {
  const index = String(message || '').indexOf(ERROR_PREFIX);
  if (index === -1) return null;
  try {
    return JSON.parse(message.slice(index + ERROR_PREFIX.length));
  } catch {
    return null;
  }
}
