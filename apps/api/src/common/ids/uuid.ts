import { randomBytes } from 'node:crypto';

/** Per-millisecond counters (a few recent ms only — clocks may interleave, e.g. a fixed test clock). */
const counters = new Map<number, number>();

/**
 * UUIDv7 (RFC 9562): 48-bit Unix ms timestamp + version/variant + random bits.
 * Monotonic within a millisecond (RFC 9562 §6.2 method 1): ids created in the same millisecond use
 * a 12-bit counter in `rand_a`, so sorting by id keeps creation order (e.g. comment numbering).
 * Implemented locally because the `uuid` package is ESM-only and this API compiles to CommonJS.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  let ms = nowMs;
  let seq = (counters.get(ms) ?? -1) + 1;
  if (seq > 0xfff) {
    ms += 1;
    seq = (counters.get(ms) ?? -1) + 1;
  }
  counters.delete(ms); // re-insert: least recently used ms is evicted first
  counters.set(ms, seq);
  if (counters.size > 64) counters.delete(counters.keys().next().value!);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f);
  bytes[7] = seq & 0xff;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function uuidVersion(value: string): number {
  return parseInt(value.charAt(14), 16);
}

/** Milliseconds embedded in a UUIDv7. */
export function uuidv7Time(value: string): number {
  return parseInt(value.replace(/-/g, '').slice(0, 12), 16);
}
