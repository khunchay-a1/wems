import { Injectable } from '@nestjs/common';
import { type Env, loadEnv, resetEnvCache } from './env';

/** Typed access to configuration. Inject this instead of reading process.env. */
@Injectable()
export class AppConfig {
  readonly env: Env;

  constructor() {
    // Parse at construction time so each app instance (and each test) sees the current environment
    resetEnvCache();
    this.env = loadEnv();
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get cookieSecure(): boolean {
    return this.env.COOKIE_SECURE ?? this.isProduction;
  }

  get swaggerEnabled(): boolean {
    return this.env.SWAGGER_ENABLED ?? !this.isProduction;
  }
}
