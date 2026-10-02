import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { applyTestEnv, TEST_DATABASE_URL } from './test-env';

/**
 * Builds the test database once per run: drop schema → apply every migration.sql in order → seed
 * master data (docs/11-testing.md §2). Applies the SQL directly so tests do not need the Prisma CLI.
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dir = join(__dirname, '..', 'prisma', 'migrations');
    const migrations = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const m of migrations) {
      await client.query(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
  // Seed in a child process (tsx resolves the generated client's ESM-style specifiers)
  execFileSync(
    process.execPath,
    [require.resolve('tsx/cli'), join(__dirname, '..', 'prisma', 'seed', 'seed.ts')],
    {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    },
  );
}
