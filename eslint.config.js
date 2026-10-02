// Root lint: repo-level scripts only (tools/, root config files).
// Each workspace package (apps/*, packages/*) owns its eslint.config.js and runs via `turbo run lint`.
import { createConfig } from '@wems/config/eslint';

export default [{ ignores: ['apps/**', 'packages/**'] }, ...createConfig({ allowConsole: true })];
