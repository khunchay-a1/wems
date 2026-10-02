import { Injectable } from '@nestjs/common';
import { ClockService } from '../time/clock';
import { isUuid, uuidv7, uuidv7Time, uuidVersion } from './uuid';

export { isUuid } from './uuid';

/** UUIDv7 ids (time ordered) — ADR-0005. The only place ids are minted (CLAUDE.md rule 7). */
@Injectable()
export class IdGenerator {
  constructor(private readonly clock: ClockService) {}

  next(): string {
    return uuidv7(this.clock.now().getTime());
  }
}

/** Predictable ids for tests. */
export class SequentialIdGenerator extends IdGenerator {
  private n = 0;
  override next(): string {
    this.n += 1;
    const hex = this.n.toString(16).padStart(12, '0');
    return `01900000-0000-7000-8000-${hex}`;
  }
}

/**
 * Validates a client-supplied UUIDv7 (docs/03-data-model.md §3): correct format, version 7,
 * and embedded timestamp within ±maxSkewDays of `now`.
 */
export function isAcceptableClientUuidV7(value: string, now: Date, maxSkewDays = 30): boolean {
  if (!isUuid(value) || uuidVersion(value) !== 7) return false;
  return Math.abs(now.getTime() - uuidv7Time(value)) <= maxSkewDays * 24 * 60 * 60 * 1000;
}
