import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
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
  // Object storage bucket used by file tests (S3 mock/RustFS must be running — see README)
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'ap-southeast-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }));
  }
  s3.destroy();
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
