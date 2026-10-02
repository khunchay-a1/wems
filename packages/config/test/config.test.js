// P0-01: guards the shared config so that every package inherits the rules in CLAUDE.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ESLint } from 'eslint';
import prettierConfig from '../prettier/index.js';
import { createConfig, NEST_DETERMINISTIC_FILES } from '../eslint/index.js';

const pkgDir = join(import.meta.dirname, '..');
/** @param {string} name */
const readJson = (name) => JSON.parse(readFileSync(join(pkgDir, name), 'utf8'));

/** @param {string} code @param {string} filePath @param {Parameters<typeof createConfig>[0]} [opts] */
async function lint(code, filePath, opts = {}) {
  const eslint = new ESLint({
    cwd: pkgDir,
    overrideConfigFile: true,
    overrideConfig: createConfig(opts),
  });
  const [result] = await eslint.lintText(code, { filePath: join(pkgDir, filePath) });
  assert.ok(result);
  return result.messages.map((m) => m.ruleId);
}

describe('P0-01 tsconfig presets', () => {
  it('base preset is strict', () => {
    const { compilerOptions } = readJson('tsconfig/base.json');
    for (const flag of [
      'strict',
      'noUncheckedIndexedAccess',
      'noImplicitOverride',
      'useUnknownInCatchVariables',
    ]) {
      assert.equal(compilerOptions[flag], true, `${flag} must be enabled`);
    }
  });

  it('every preset extends the strict base', () => {
    assert.equal(readJson('tsconfig/node.json').extends, './base.json');
    assert.equal(readJson('tsconfig/nextjs.json').extends, './base.json');
    assert.equal(readJson('tsconfig/nestjs.json').extends, './node.json');
    assert.equal(readJson('tsconfig/library.json').extends, './node.json');
  });

  it('nestjs preset enables decorator metadata', () => {
    const { compilerOptions } = readJson('tsconfig/nestjs.json');
    assert.equal(compilerOptions.experimentalDecorators, true);
    assert.equal(compilerOptions.emitDecoratorMetadata, true);
  });
});

describe('P0-01 eslint preset', () => {
  const det = { deterministicFiles: NEST_DETERMINISTIC_FILES };

  it('rule 7: forbids new Date() / Date.now() in services', async () => {
    const rules = await lint(
      'export const a = new Date();\nexport const b = Date.now();\n',
      'src/x/x.service.ts',
      det,
    );
    assert.deepEqual(rules, ['no-restricted-syntax', 'no-restricted-syntax']);
  });

  it('rule 7: forbids randomUUID in domain code', async () => {
    const rules = await lint(
      "import { randomUUID } from 'node:crypto';\nexport const id = randomUUID();\n",
      'src/x/domain/y.ts',
      det,
    );
    assert.deepEqual(rules, ['no-restricted-imports']);
  });

  it('rule 7: allows parsing dates and code outside services/domain', async () => {
    assert.deepEqual(
      await lint("export const a = new Date('2026-01-01');\n", 'src/x/x.service.ts', det),
      [],
    );
    assert.deepEqual(
      await lint('export const a = new Date();\n', 'src/x/x.controller.ts', det),
      [],
    );
  });

  it('forbids console.* unless allowed (apps log via pino)', async () => {
    assert.deepEqual(await lint("console.log('x');\n", 'src/a.ts'), ['no-console']);
    assert.deepEqual(await lint("console.log('x');\n", 'tools/a.mjs', { allowConsole: true }), []);
  });

  it('ignores generated code', async () => {
    const eslint = new ESLint({
      cwd: pkgDir,
      overrideConfigFile: true,
      overrideConfig: createConfig(),
    });
    assert.equal(await eslint.isPathIgnored(join(pkgDir, 'src/generated/prisma/client.ts')), true);
  });
});

describe('P0-01 prettier preset', () => {
  it('uses LF line endings and single quotes', () => {
    assert.equal(prettierConfig.endOfLine, 'lf');
    assert.equal(prettierConfig.singleQuote, true);
  });
});
