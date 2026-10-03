#!/usr/bin/env node
// P1-15 audit completeness (docs/06-security.md §9, CLAUDE.md rule 3): every
// `prisma.$transaction(...)` in an API service must record an audit row — directly
// (`audit.record`) or through a method of the same class that does (followed transitively).
// A transaction that intentionally has no audit carries a comment `// audit: <reason>`.
// Usage: node tools/check-audit.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const ts = require('typescript');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.service.ts') && !p.endsWith('.spec.ts')) yield p;
  }
}

const AUDIT = /\baudit\.record\s*\(/;
const EXEMPT = /\/\/\s*audit:\s*\S/;
let checked = 0;
const problems = [];

for (const file of walk(join(root, 'apps/api/src/modules'))) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  // method name → body text, per class
  const methods = new Map();
  const visitClass = (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const m of node.members) {
        if ((ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) && m.name) {
          methods.set(m.name.getText(sf), m.getText(sf));
        }
      }
    }
    ts.forEachChild(node, visitClass);
  };
  visitClass(sf);

  const audits = new Map();
  const auditsVia = (name, seen = new Set()) => {
    if (audits.has(name)) return audits.get(name);
    if (seen.has(name)) return false;
    seen.add(name);
    const body = methods.get(name) ?? '';
    const ok = AUDIT.test(body) || calls(body).some((n) => auditsVia(n, seen));
    audits.set(name, ok);
    return ok;
  };
  const calls = (body) => [...body.matchAll(/this\.(\w+)\s*\(/g)].map((m) => m[1]);

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText(sf) === '$transaction' &&
      // array form = batched reads (list + count); only interactive transactions change data
      node.arguments[0] &&
      (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]))
    ) {
      checked += 1;
      // the exemption comment may sit just before the callback
      const body = text.slice(node.getStart(sf), node.end);
      const ok = AUDIT.test(body) || EXEMPT.test(body) || calls(body).some((n) => auditsVia(n));
      if (!ok) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        problems.push(`${relative(root, file)}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (problems.length) {
  console.error('transactions without an audit record (add audit.record or `// audit: <reason>`):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`audit OK: ${checked} transactions record an audit row`);
