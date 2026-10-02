import { createConfig, NEST_DETERMINISTIC_FILES } from '@wems/config/eslint';

export default [
  ...createConfig({
    tsconfigRootDir: import.meta.dirname,
    deterministicFiles: NEST_DETERMINISTIC_FILES,
    ignores: ['dist/**', 'src/generated/**', 'prisma/migrations/**'],
  }),
  {
    name: 'api/nest-overrides',
    files: ['**/*.ts'],
    rules: {
      // Nest DI + decorators: classes with only static/DI members are normal
      '@typescript-eslint/no-extraneous-class': 'off',
      // Allow `void promise` fire-and-forget in bootstrap code
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    },
  },
  {
    name: 'api/tests',
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
