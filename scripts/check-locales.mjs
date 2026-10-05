// Validates translations: every locales/*.json is compared with the reference
// (en.json) for missing/extra keys and mismatched {placeholders}, and every key
// used in the code must exist in the reference. Run: npm run check:locales
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'locales');
const REFERENCE = 'en';
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/** Flattens nested messages to { "a.b.c": "text" }; plural objects become one entry. */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    const isPlural =
      value && typeof value === 'object' && 'other' in value && Object.keys(value).every((k) => PLURAL_FORMS.has(k));
    if (isPlural) out[full] = Object.values(value).join(' ');
    else if (value && typeof value === 'object') flatten(value, full, out);
    else out[full] = String(value);
  }
  return out;
}

const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort().join(',');

function codeKeys() {
  const keys = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|cjs|mjs)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/\b(?:t|UserError|encodeError)\(\s*'([a-zA-Z]+(?:\.[\w]+)+)'/g))
          keys.add(match[1]);
        for (const match of text.matchAll(/labelKey: '([\w.]+)'/g)) keys.add(match[1]);
      }
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'electron'));
  return keys;
}

let problems = 0;
const report = (message) => {
  problems += 1;
  console.log(`  ✗ ${message}`);
};

const files = fs.readdirSync(localesDir).filter((file) => file.endsWith('.json'));
const locales = {};
for (const file of files) {
  try {
    locales[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
  } catch (error) {
    console.log(`${file}`);
    report(`invalid JSON: ${error.message}`);
  }
}

const reference = flatten(locales[REFERENCE] || {});

console.log(`${REFERENCE}.json (reference)`);
for (const key of codeKeys()) {
  if (!(key in reference)) report(`used in code but missing: ${key}`);
}

for (const [code, messages] of Object.entries(locales)) {
  if (code === REFERENCE) continue;
  console.log(`${code}.json — ${messages.meta?.name || 'meta.name missing!'}`);
  const flat = flatten(messages);
  if (!messages.meta?.name) report('meta.name is required (shown in the language list)');
  for (const key of Object.keys(reference)) {
    if (!(key in flat)) report(`missing: ${key}`);
    else if (placeholders(flat[key]) !== placeholders(reference[key]))
      report(`placeholders differ in ${key}: expected ${placeholders(reference[key]) || 'none'}`);
  }
  for (const key of Object.keys(flat)) {
    if (!(key in reference)) report(`unknown key (typo?): ${key}`);
  }
}

console.log(problems ? `\n${problems} problem(s) found.` : '\nAll locales are complete.');
process.exit(problems ? 1 : 0);
