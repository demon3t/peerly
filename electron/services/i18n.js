const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { readJson } = require('../lib/json-file');

const FALLBACK_LANGUAGE = 'en';

/** Built-in translations shipped with the app, plus user-provided ones (no rebuild needed). */
const localeDirs = () => [path.join(__dirname, '..', '..', 'locales'), path.join(app.getPath('userData'), 'locales')];

/**
 * Discovers locale files (every locales/<code>.json), picks the active
 * language from settings ('auto' = system language) and translates strings
 * for the main process. Emits 'change' when the language switches.
 */
class I18n extends EventEmitter {
  constructor() {
    super();
    this.locales = new Map(); // code -> messages
    this.language = FALLBACK_LANGUAGE;
    this.t = (key) => key;
    this.createTranslator = null;
  }

  async init(preferred) {
    ({ createTranslator: this.createTranslator } = await import('../../shared/translate.mjs'));
    this.reload();
    this.setLanguage(preferred);
  }

  reload() {
    this.locales.clear();
    for (const dir of localeDirs()) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const messages = readJson(path.join(dir, file), null);
        if (messages && typeof messages === 'object') this.locales.set(path.basename(file, '.json'), messages);
        else console.warn(`Locale file is not valid JSON: ${path.join(dir, file)}`);
      }
    }
  }

  /** Resolves 'auto' / unknown codes to an available language. */
  resolve(preferred) {
    if (preferred && preferred !== 'auto' && this.locales.has(preferred)) return preferred;
    const system = app.getLocale(); // e.g. "ru", "en-US", "pt-BR"
    const candidates = [system, system.split('-')[0]];
    return (
      candidates.find((code) => this.locales.has(code)) ||
      (this.locales.has(FALLBACK_LANGUAGE) ? FALLBACK_LANGUAGE : this.locales.keys().next().value)
    );
  }

  setLanguage(preferred) {
    const language = this.resolve(preferred);
    const messages = this.locales.get(language) || {};
    this.language = language;
    this.t = this.createTranslator({
      messages,
      fallback: this.locales.get(FALLBACK_LANGUAGE) || {},
      locale: messages.meta?.locale || language,
    });
    this.emit('change', language);
  }

  /** Everything the renderer needs to translate on its own. */
  bundle() {
    return {
      language: this.language,
      messages: this.locales.get(this.language) || {},
      fallback: this.locales.get(FALLBACK_LANGUAGE) || {},
      available: Array.from(this.locales.entries())
        .map(([code, messages]) => ({ code, name: messages.meta?.name || code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}

module.exports = { I18n, FALLBACK_LANGUAGE };
