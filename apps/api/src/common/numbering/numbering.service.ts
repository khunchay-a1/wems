import { Injectable } from '@nestjs/common';
import type { NumberedEntity, NumberingScheme } from '../../generated/prisma/client';
import { Problem } from '../errors/problem';
import type { Tx } from '../prisma/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../time/clock';
import { type NumberingContext, renderNumber, sequenceKey, validatePattern } from './pattern';

export const projectScope = (projectId: string): string => `project:${projectId}`;

const MAX_COLLISION_RETRIES = 5;

/**
 * Document numbering (BR-PLT-010/011): project scheme first, then GLOBAL; counter advanced with
 * INSERT … ON CONFLICT … RETURNING inside the caller's transaction, so numbers never repeat.
 */
@Injectable()
export class NumberingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async scheme(tx: Tx, entity: NumberedEntity, projectId?: string): Promise<NumberingScheme> {
    if (projectId) {
      const own = await tx.numberingScheme.findUnique({
        where: { entity_scope: { entity, scope: projectScope(projectId) } },
      });
      if (own?.isActive) return own;
    }
    const global = await tx.numberingScheme.findUnique({
      where: { entity_scope: { entity, scope: 'GLOBAL' } },
    });
    if (!global) throw new Error(`numbering scheme for ${entity} is missing — run the seed`);
    return global;
  }

  /**
   * Issues the next number. `exists` lets callers skip numbers already taken (e.g. imported legacy
   * documents — BR-PLT-011); tries at most 5 times.
   */
  async next(
    tx: Tx,
    entity: NumberedEntity,
    ctx: NumberingContext,
    opts: { projectId?: string; exists?: (n: string) => Promise<boolean> } = {},
  ): Promise<string> {
    const scheme = await this.scheme(tx, entity, opts.projectId);
    const now = this.clock.now();
    const key = sequenceKey(entity, scheme.pattern, scheme.resetPolicy, ctx, now);
    for (let i = 0; i < MAX_COLLISION_RETRIES; i++) {
      const [row] = await tx.$queryRaw<{ current_value: number }[]>`
        INSERT INTO number_sequences (key, current_value, updated_at)
        VALUES (${key}, 1, ${now})
        ON CONFLICT (key) DO UPDATE SET current_value = number_sequences.current_value + 1, updated_at = ${now}
        RETURNING current_value`;
      const candidate = renderNumber(scheme.pattern, ctx, row!.current_value, now);
      if (!opts.exists || !(await opts.exists(candidate))) return candidate;
    }
    throw new Problem('DUPLICATE', { rule: 'BR-PLT-011' });
  }

  /** The number the next call would produce, without advancing the counter. */
  async preview(
    entity: NumberedEntity,
    ctx: NumberingContext,
    opts: { projectId?: string; pattern?: string } = {},
  ): Promise<string> {
    const scheme = await this.scheme(this.prisma, entity, opts.projectId);
    const pattern = opts.pattern ?? scheme.pattern;
    const err = validatePattern(pattern);
    if (err)
      throw new Problem('NUMBERING_PATTERN_INVALID', { errors: [{ field: 'pattern', code: err }] });
    const now = this.clock.now();
    const key = sequenceKey(entity, pattern, scheme.resetPolicy, ctx, now);
    const seq = await this.prisma.numberSequence.findUnique({ where: { key } });
    return renderNumber(pattern, ctx, (seq?.currentValue ?? 0) + 1, now);
  }

  /**
   * BR-DOC-016: after importing legacy numbers, move the counter to the highest number seen so new
   * numbers continue after it.
   */
  async raiseTo(
    tx: Tx,
    entity: NumberedEntity,
    ctx: NumberingContext,
    value: number,
    projectId?: string,
  ): Promise<void> {
    const scheme = await this.scheme(tx, entity, projectId);
    const now = this.clock.now();
    const key = sequenceKey(entity, scheme.pattern, scheme.resetPolicy, ctx, now);
    await tx.$executeRaw`
      INSERT INTO number_sequences (key, current_value, updated_at) VALUES (${key}, ${value}, ${now})
      ON CONFLICT (key) DO UPDATE SET current_value = GREATEST(number_sequences.current_value, ${value}), updated_at = ${now}`;
  }
}
