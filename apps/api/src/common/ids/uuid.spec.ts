import { isAcceptableClientUuidV7 } from './id-generator';
import { isUuid, uuidv7, uuidv7Time, uuidVersion } from './uuid';

describe('UUIDv7 (ADR-0005)', () => {
  it('encodes the timestamp, version 7 and RFC variant', () => {
    const t = Date.UTC(2026, 8, 26, 3, 15);
    const id = uuidv7(t);
    expect(isUuid(id)).toBe(true);
    expect(uuidVersion(id)).toBe(7);
    expect(uuidv7Time(id)).toBe(t);
  });

  it('sorts by creation time', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
  });

  it('accepts client ids within ±30 days only (docs/03-data-model.md §3)', () => {
    const now = new Date('2026-09-28T00:00:00Z');
    expect(isAcceptableClientUuidV7(uuidv7(now.getTime() - 5 * 86_400_000), now)).toBe(true);
    expect(isAcceptableClientUuidV7(uuidv7(now.getTime() - 31 * 86_400_000), now)).toBe(false);
    expect(isAcceptableClientUuidV7('3d8f4a1e-1d2c-4b5a-9c8d-1234567890ab', now)).toBe(false);
    expect(isAcceptableClientUuidV7('not-a-uuid', now)).toBe(false);
  });
});
