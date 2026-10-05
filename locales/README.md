# Переводы / Translations

Каждый язык — один файл `<код>.json` в этой папке. Чтобы добавить язык:

1. Скопируйте `en.json` в файл с кодом языка, например `de.json` (код — как в Windows/BCP 47: `de`, `uk`, `pt-BR`).
2. Переведите значения. Ключи и `{плейсхолдеры}` не меняйте.
3. Укажите название языка в `meta.name` — так он будет выглядеть в списке (например, `"Deutsch"`).
4. Проверьте файл: `npm run check:locales`.

Язык появится в «Настройки → Язык» после перезапуска приложения. Регистрировать его в коде не нужно.

**Без пересборки.** В установленное приложение перевод можно добавить, положив файл в
`%APPDATA%\peerly\locales\`.

---

One file per language: `<code>.json`. Copy `en.json`, translate the values,
set `meta.name`, run `npm run check:locales`. The language shows up in
Settings → Language after restarting the app. Installed builds also load files from
`%APPDATA%\peerly\locales\`.

## Format

```json
{
  "meta": { "name": "Deutsch", "locale": "de-DE" },
  "table": { "remaining": "noch {time}" },
  "add": {
    "fileCount": { "one": "{count} Datei", "other": "{count} Dateien" }
  }
}
```

- `meta.name` is the display name in the language list. `meta.locale` is used for dates and plural rules.
- `{name}` placeholders are filled in by the app and must stay as-is.
- Plurals are objects with CLDR categories (`zero`, `one`, `two`, `few`, `many`, `other`). Use the ones your language needs; `other` is required. Russian, for example, uses `one` / `few` / `many`.
- Missing keys fall back to English, so a partial translation still works.
