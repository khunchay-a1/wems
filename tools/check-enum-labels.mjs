#!/usr/bin/env node
// ตรวจว่า docs/data/enum-labels.json มีป้าย th/en ครบทุกค่าของทุก enum ใน apps/api/prisma/schema/*.prisma
// ใช้ใน CI: node tools/check-enum-labels.mjs  (ไม่ต้องติดตั้ง dependency)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = join(root, 'apps/api/prisma/schema');
const labels = JSON.parse(readFileSync(join(root, 'docs/data/enum-labels.json'), 'utf8')).enums;

const enums = {};
for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.prisma'))) {
  const text = readFileSync(join(schemaDir, file), 'utf8');
  for (const m of text.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    enums[m[1]] = m[2]
      .split('\n')
      .map((l) => l.split('//')[0].trim())
      .filter((l) => l && !l.startsWith('@'))
      .map((l) => l.split(/\s+/)[0]);
  }
}

const problems = [];
for (const [name, values] of Object.entries(enums)) {
  if (!labels[name]) {
    problems.push(`missing enum ${name}`);
    continue;
  }
  for (const v of values) {
    const l = labels[name][v];
    if (!l || !l.th || !l.en) problems.push(`missing label ${name}.${v}`);
  }
  for (const v of Object.keys(labels[name])) {
    if (!values.includes(v)) problems.push(`label for removed value ${name}.${v}`);
  }
}
for (const name of Object.keys(labels))
  if (!enums[name]) problems.push(`label for removed enum ${name}`);

if (problems.length) {
  console.error(
    `enum-labels.json ไม่ตรงกับ schema (${problems.length}):\n- ` + problems.join('\n- '),
  );
  process.exit(1);
}
console.log(
  `enum labels OK: ${Object.keys(enums).length} enums, ${Object.values(enums).flat().length} values`,
);
