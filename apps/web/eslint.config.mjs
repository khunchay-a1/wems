import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    // explicit version: eslint-plugin-react's "detect" calls context.getFilename (removed in ESLint 10)
    settings: { react: { version: '19.2' } },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Thai strings must come from next-intl messages (CLAUDE.md, .claude/rules/web.md)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[\\u0E00-\\u0E7F]/]',
          message: 'Use next-intl messages instead of hard-coded Thai text.',
        },
      ],
    },
  },
  prettier,
];

export default config;
