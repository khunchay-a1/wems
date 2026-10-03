#!/usr/bin/env node
// Generates enum label translations from docs/data/enum-labels.json (docs/01-glossary.md):
//   apps/web/messages/enums.th.json, enums.en.json   → next-intl namespace "enums": enums.<Enum>.<VALUE>
//   apps/mobile/lib/l10n/enums_th.arb, enums_en.arb  → ARB keys enum<Enum><Value> (camelCase)
//   apps/web/messages/errors.th.json, errors.en.json → copy of the API error catalog (namespace "errors")
// Usage: node tools/gen-i18n-enums.mjs [--check]   (--check fails if the generated files are stale)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { enums } = JSON.parse(readFileSync(join(root, 'docs/data/enum-labels.json'), 'utf8'));
const check = process.argv.includes('--check');
const locales = ['th', 'en'];

const camel = (s) =>
  s
    .toLowerCase()
    .split('_')
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const outputs = {};
for (const locale of locales) {
  const web = {};
  const arb = { '@@locale': locale };
  for (const name of Object.keys(enums).sort()) {
    web[name] = {};
    for (const [value, labels] of Object.entries(enums[name])) {
      const label = labels[locale] ?? labels.th ?? value;
      web[name][value] = label;
      const key = `enum${name}${pascal(camel(value).replace(/^\d/, (d) => `n${d}`))}`;
      arb[key] = label;
    }
  }
  outputs[join(root, `apps/web/messages/enums.${locale}.json`)] =
    `${JSON.stringify(web, null, 2)}\n`;
  outputs[join(root, `apps/mobile/lib/l10n/enums_${locale}.arb`)] =
    `${JSON.stringify(arb, null, 2)}\n`;
}

// API error catalog → web (translate blockedActions codes client-side — docs/04-api-conventions.md §7)
for (const locale of locales) {
  const catalog = JSON.parse(
    readFileSync(join(root, `apps/api/src/common/i18n/errors.${locale}.json`), 'utf8'),
  );
  outputs[join(root, `apps/web/messages/errors.${locale}.json`)] =
    `${JSON.stringify(catalog, null, 2)}\n`;
}

let stale = 0;
for (const [file, content] of Object.entries(outputs)) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (current === content) continue;
  if (check) {
    console.error(`stale: ${file.replace(`${root}/`, '')}`);
    stale += 1;
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`wrote ${file.replace(`${root}/`, '')}`);
  }
}
if (check && stale) {
  console.error('run: node tools/gen-i18n-enums.mjs');
  process.exit(1);
}
console.log(
  `enum labels: ${Object.keys(enums).length} enums → web + mobile${check ? ' (up to date)' : ''}`,
);
