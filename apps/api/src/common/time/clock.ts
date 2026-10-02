import { Injectable } from '@nestjs/common';

/**
 * The only place that reads the system clock (CLAUDE.md rule 7).
 * Inject ClockService in services/domain code; tests swap it for FixedClock.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }
}

/** Deterministic clock for tests. */
export class FixedClock extends ClockService {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
