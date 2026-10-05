// A user-facing error identified by a locale key (see /locales). The key and
// params travel to the renderer inside the message and are translated there.
// Format must match encodeError() in shared/translate.mjs.
class UserError extends Error {
  constructor(key, params = {}) {
    super(`i18n:${JSON.stringify({ key, params })}`);
    this.name = 'UserError';
    this.key = key;
    this.params = params;
  }
}

module.exports = { UserError };
