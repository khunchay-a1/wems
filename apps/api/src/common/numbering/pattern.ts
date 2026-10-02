import type { NumberedEntity, SequenceReset } from '../../generated/prisma/client';
import { bangkokDate, buddhistYear } from '../time/business-calendar';

/**
 * Numbering patterns (M01 §4) — pure functions.
 * Tokens: {YYYY} {YY} {BYYYY} {BYY} {MM} {PROJECT} {CLIENT} {DISCIPLINE} {TYPE} {SEQ:n}
 */
export interface NumberingContext {
  project?: string;
  client?: string;
  discipline?: string;
  type?: string;
}

const TOKEN_RE = /\{([A-Z]+)(?::(\d+))?\}/g;
const TIME_TOKENS = new Set(['YYYY', 'YY', 'BYYYY', 'BYY', 'MM']);
const CONTEXT_TOKENS: Record<string, keyof NumberingContext> = {
  PROJECT: 'project',
  CLIENT: 'client',
  DISCIPLINE: 'discipline',
  TYPE: 'type',
};

export type PatternError =
  'NO_SEQ' | 'MULTIPLE_SEQ' | 'UNKNOWN_TOKEN' | 'BAD_SEQ_WIDTH' | 'UNSAFE_CHARACTERS';

export function validatePattern(pattern: string): PatternError | null {
  if (!/^[A-Za-z0-9{}:\-_/.]+$/.test(pattern)) return 'UNSAFE_CHARACTERS';
  let seq = 0;
  for (const m of pattern.matchAll(TOKEN_RE)) {
    const [, name, width] = m;
    if (name === 'SEQ') {
      seq += 1;
      const w = Number(width);
      if (!width || w < 1 || w > 9) return 'BAD_SEQ_WIDTH';
    } else if (!TIME_TOKENS.has(name!) && !(name! in CONTEXT_TOKENS)) {
      return 'UNKNOWN_TOKEN';
    }
  }
  const stripped = pattern.replace(TOKEN_RE, '');
  if (/[{}]/.test(stripped)) return 'UNKNOWN_TOKEN';
  if (seq === 0) return 'NO_SEQ';
  if (seq > 1) return 'MULTIPLE_SEQ';
  return null;
}

function timeValues(now: Date): Record<string, string> {
  const [y, m] = bangkokDate(now).split('-') as [string, string];
  const by = String(buddhistYear(Number(y)));
  return { YYYY: y, YY: y.slice(2), BYYYY: by, BYY: by.slice(2), MM: m };
}

/** Context tokens used by a pattern (to know what the caller must provide). */
export function requiredContext(pattern: string): (keyof NumberingContext)[] {
  const out: (keyof NumberingContext)[] = [];
  for (const m of pattern.matchAll(TOKEN_RE)) {
    const key = CONTEXT_TOKENS[m[1]!];
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Sequence key = entity | context token values (in pattern order) | reset period.
 * e.g. DOCUMENT → "DOCUMENT|P26-001|PR|DWG", SAMPLE (YEARLY) → "SAMPLE|2026", BATCH (MONTHLY) → "ANALYSIS_BATCH|2026-09"
 */
export function sequenceKey(
  entity: NumberedEntity,
  pattern: string,
  reset: SequenceReset,
  ctx: NumberingContext,
  now: Date,
): string {
  const parts: string[] = [entity];
  for (const m of pattern.matchAll(TOKEN_RE)) {
    const key = CONTEXT_TOKENS[m[1]!];
    if (key) parts.push(requireValue(ctx, key));
  }
  const [y, mo] = bangkokDate(now).split('-') as [string, string];
  if (reset === 'YEARLY') parts.push(y);
  if (reset === 'MONTHLY') parts.push(`${y}-${mo}`);
  return parts.join('|');
}

function requireValue(ctx: NumberingContext, key: keyof NumberingContext): string {
  const v = ctx[key];
  if (!v) throw new Error(`numbering context is missing "${key}"`);
  return v;
}

/** Renders a number; {SEQ:n} is zero-padded and grows past n digits when needed. */
export function renderNumber(
  pattern: string,
  ctx: NumberingContext,
  seq: number,
  now: Date,
): string {
  const time = timeValues(now);
  return pattern.replace(TOKEN_RE, (_, name: string, width?: string) => {
    if (name === 'SEQ') return String(seq).padStart(Number(width), '0');
    if (TIME_TOKENS.has(name)) return time[name]!;
    return requireValue(ctx, CONTEXT_TOKENS[name]!);
  });
}
