/** @type {import('jest').Config} */
const swc = [
  '@swc/jest',
  {
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      target: 'es2023',
    },
    module: { type: 'commonjs' },
  },
];

const common = {
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': swc },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Prisma's generated client uses ESM-style './x.js' specifiers for TS sources
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};

module.exports = {
  projects: [
    { ...common, displayName: 'unit', rootDir: 'src', testMatch: ['**/*.spec.ts'] },
    {
      ...common,
      displayName: 'e2e',
      rootDir: '.',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      testTimeout: 30000,
    },
  ],
};
