import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { z } from 'zod';

/** Validated environment (docs/02-architecture.md §11). Fails fast at startup with a readable message. */
const bool = z.stringbool();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-southeast-1'),
  S3_BUCKET: z.string().default('wems-dev'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),
  /** Endpoint browsers use for presigned URLs (defaults to S3_ENDPOINT) */
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_WEB_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_TTL_MOBILE_DAYS: z.coerce.number().int().positive().default(30),
  APP_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => !v || Buffer.from(v, 'base64').length === 32, {
      message: 'APP_ENCRYPTION_KEY must be base64 of exactly 32 bytes',
    }),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('WEMS <no-reply@wems.local>'),
  GOTENBERG_URL: z.string().default('http://localhost:3001'),
  FCM_CREDENTIALS_JSON: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  TZ_BUSINESS: z.string().default('Asia/Bangkok'),
  /** Secure flag on auth cookies; defaults to true in production */
  COOKIE_SECURE: bool.optional(),
  SWAGGER_ENABLED: bool.optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Loads apps/api/.env then the repo root .env (first value wins), validates and caches. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  if (source === process.env) {
    const apiDir = join(__dirname, '..', '..', '..');
    loadDotenv({ path: [join(apiDir, '.env'), join(apiDir, '..', '..', '.env')], quiet: true });
  }
  const emptyToUndefined = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  const parsed = envSchema.safeParse(emptyToUndefined);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/** Test helper: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}
