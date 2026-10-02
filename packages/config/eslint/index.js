// Shared ESLint flat config for WEMS packages.
// Usage (in a package's eslint.config.js):
//   import { createConfig, NEST_DETERMINISTIC_FILES } from '@wems/config/eslint';
//   export default createConfig({ tsconfigRootDir: import.meta.dirname, deterministicFiles: NEST_DETERMINISTIC_FILES });
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Paths never linted (build output and generated code — CLAUDE.md rule 9). */
export const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/src/generated/**',
  '**/next-env.d.ts',
];

/** Files in apps/api where time and ids must come from ClockService / IdGenerator (CLAUDE.md rule 7). */
export const NEST_DETERMINISTIC_FILES = ['src/**/*.service.ts', 'src/**/domain/**/*.ts'];

const CLOCK_MSG = 'Use the injected ClockService instead (CLAUDE.md rule 7).';
const ID_MSG = 'Use the injected IdGenerator (UUIDv7) instead (CLAUDE.md rule 7).';

/**
 * @param {string[]} files
 * @returns {import('eslint').Linter.Config}
 */
export function deterministicRules(files) {
  return {
    name: 'wems/deterministic-time-and-ids',
    files,
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MSG },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: CLOCK_MSG,
        },
        {
          selector:
            "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
          message: ID_MSG,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'crypto', importNames: ['randomUUID'], message: ID_MSG },
            { name: 'node:crypto', importNames: ['randomUUID'], message: ID_MSG },
          ],
        },
      ],
    },
  };
}

/**
 * Build the WEMS flat config.
 * @param {object} [options]
 * @param {string} [options.tsconfigRootDir] Enables type-aware rules (pass `import.meta.dirname`).
 * @param {boolean} [options.allowConsole] Allow console.* (scripts/tools only; apps log via pino).
 * @param {string[]} [options.deterministicFiles] Globs that must not call Date/randomUUID directly.
 * @param {string[]} [options.ignores] Extra ignore globs.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createConfig(options = {}) {
  const { tsconfigRootDir, allowConsole = false, deterministicFiles = [], ignores = [] } = options;
  const typeChecked = Boolean(tsconfigRootDir);

  /** @type {import('eslint').Linter.Config[]} */
  const configs = [
    { name: 'wems/ignores', ignores: [...DEFAULT_IGNORES, ...ignores] },
    js.configs.recommended,
    ...(typeChecked ? tseslint.configs.recommendedTypeChecked : tseslint.configs.recommended),
    {
      name: 'wems/base',
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: { ...globals.node },
        ...(typeChecked ? { parserOptions: { projectService: true, tsconfigRootDir } } : {}),
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': allowConsole ? 'off' : 'error',
        'prefer-const': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
  ];

  if (typeChecked) {
    configs.push({
      name: 'wems/js-without-types',
      files: ['**/*.{js,mjs,cjs}'],
      ...tseslint.configs.disableTypeChecked,
    });
  }
  if (deterministicFiles.length > 0) {
    configs.push(deterministicRules(deterministicFiles));
  }
  // Must stay last: turns off stylistic rules that conflict with Prettier.
  configs.push(prettier);
  return configs;
}
