/** Environment shared by e2e/integration tests (real PostgreSQL + Redis, docs/11-testing.md §2). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://wems:wems@localhost:5432/wems_test';

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.TZ = 'UTC';
  process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-test-secret';
  process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.REDIS_URL ??= 'redis://localhost:6379/15';
  process.env.LOG_LEVEL = 'silent';
  process.env.COOKIE_SECURE = 'false';
  process.env.S3_ENDPOINT ??= 'http://127.0.0.1:9000';
  process.env.S3_BUCKET = process.env.TEST_S3_BUCKET ?? 'wems-test';
  process.env.S3_ACCESS_KEY ??= 'wemsdev';
  process.env.S3_SECRET_KEY ??= 'wemsdev-secret-change-me';
  process.env.S3_FORCE_PATH_STYLE = 'true';
}
