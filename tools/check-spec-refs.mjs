#!/usr/bin/env node
// ตรวจความสอดคล้องของสเปก (ไม่ต้องติดตั้ง dependency)
//   node tools/check-spec-refs.mjs            ตรวจเอกสาร: BR/AT ที่อ้างถึงมีนิยามจริง, ไฟล์ที่อ้างถึงมีอยู่จริง
//   node tools/check-spec-refs.mjs --tests BR-DOC   ตรวจว่ากติกาที่ขึ้นต้นด้วย prefix มี test อ้างถึงอย่างน้อย 1 ตัวใน apps/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir, filter) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (['node_modules', '.git', 'build', '.dart_tool', 'generated'].includes(name)) return [];
    return statSync(p).isDirectory() ? walk(p, filter) : filter(p) ? [p] : [];
  });
};
const docFiles = [join(root, 'CLAUDE.md'), join(root, 'README.md'), ...walk(join(root, 'docs'), (p) => p.endsWith('.md')), ...walk(join(root, '.claude'), (p) => p.endsWith('.md'))].filter(existsSync);
const read = (p) => readFileSync(p, 'utf8');

const defined = new Map(); // id -> file
for (const f of docFiles) {
  for (const m of read(f).matchAll(/\*\*((?:BR|AT)-[A-Z]+-\d{2,3})\*\*|^\|\s*((?:AT)-[A-Z]+-\d{2,3})\s*\|/gm)) {
    defined.set(m[1] || m[2], relative(root, f));
  }
}

const args = process.argv.slice(2);
if (args[0] === '--tests') {
  const prefix = args[1] || 'BR-';
  const testFiles = walk(join(root, 'apps'), (p) => /(\.spec|\.test|_test)\.(ts|tsx|dart)$/.test(p));
  const testText = testFiles.map(read).join('\n');
  const missing = [...defined.keys()].filter((id) => id.startsWith(prefix) && !testText.includes(id));
  if (missing.length) { console.error(`ยังไม่มี test สำหรับ ${missing.length} รายการ:\n- ${missing.join('\n- ')}`); process.exit(1); }
  console.log(`ทุกกติกา ${prefix}* มี test แล้ว`); process.exit(0);
}

const problems = [];
for (const f of docFiles) {
  const text = read(f);
  // 1) BR/AT ที่อ้างถึงต้องมีนิยาม (รองรับช่วง เช่น BR-DOC-040..042 / AT-DOC-03..08)
  for (const m of text.matchAll(/\b((?:BR|AT)-[A-Z]+)-(\d{2,3})(?:\s*(?:\.\.|–|-)\s*(\d{2,3}))?\b/g)) {
    const [, pfx, a, b] = m;
    const ids = [`${pfx}-${a}`];
    if (b && Number(b) > Number(a) && Number(b) - Number(a) < 40) {
      for (let n = Number(a) + 1; n <= Number(b); n++) {
        const id = `${pfx}-${String(n).padStart(a.length, '0')}`;
        if (defined.has(id)) ids.push(id);
      }
      const last = `${pfx}-${String(b).padStart(a.length, '0')}`; if (!ids.includes(last)) ids.push(last);
    }
    for (const id of ids) if (!defined.has(id)) problems.push(`${relative(root, f)}: อ้างถึง ${id} แต่ไม่มีนิยาม`);
  }
  // 2) ไฟล์ในโฟลเดอร์ docs ที่อ้างถึงต้องมีอยู่
  for (const m of text.matchAll(/`((?:docs\/|modules\/|adr\/)?[\w./-]*?(?:\d{2}-[\w-]+|M\d{2}-[\w-]+|\d{4}-[\w-]+|open-questions)\.md)`/g)) {
    const ref = m[1];
    const candidates = [join(root, ref), join(root, 'docs', ref), join(dirname(f), ref)];
    if (!candidates.some(existsSync)) problems.push(`${relative(root, f)}: ไม่พบไฟล์ ${ref}`);
  }
}
const uniq = [...new Set(problems)];
if (uniq.length) { console.error(`พบปัญหา ${uniq.length} รายการ:\n- ${uniq.join('\n- ')}`); process.exit(1); }
console.log(`spec refs OK: ${docFiles.length} ไฟล์, นิยาม BR/AT ${defined.size} รายการ`);
