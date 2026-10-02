import { Injectable } from '@nestjs/common';
import { Problem } from '../errors/problem';
import { PrismaService } from '../prisma/prisma.service';
import type { HealthDto } from './health.dto';

/** A dependency that can report readiness (Redis, S3, Gotenberg register themselves). */
export abstract class HealthIndicator {
  abstract readonly name: string;
  abstract check(): Promise<boolean>;
}

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');

@Injectable()
export class HealthService {
  private readonly indicators: HealthIndicator[] = [];

  constructor(private readonly prisma: PrismaService) {}

  register(indicator: HealthIndicator): void {
    this.indicators.push(indicator);
  }

  async readiness(timeoutMs = 3000): Promise<HealthDto> {
    const checks: HealthDto['checks'] = {};
    const withTimeout = async (p: Promise<boolean>): Promise<boolean> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          p,
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), timeoutMs);
          }),
        ]);
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    };
    checks.database = (await withTimeout(this.prisma.$queryRaw`SELECT 1`.then(() => true)))
      ? 'up'
      : 'down';
    for (const ind of this.indicators) {
      checks[ind.name] = (await withTimeout(ind.check())) ? 'up' : 'down';
    }
    const ok = Object.values(checks).every((c) => c !== 'down');
    if (!ok) {
      throw new Problem('SERVICE_UNAVAILABLE', { extra: { checks } });
    }
    return { status: 'ok', checks };
  }
}
