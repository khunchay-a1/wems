import { canonicalJson, decrypt, encrypt, sha256Hex } from './crypto';
import { signJwt, verifyJwt } from './jwt';
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from './totp';

describe('crypto primitives', () => {
  const key = Buffer.alloc(32, 1).toString('base64');

  it('AES-256-GCM round trip and tamper detection', () => {
    const enc = encrypt('JBSWY3DPEHPK3PXP', key);
    expect(decrypt(enc, key)).toBe('JBSWY3DPEHPK3PXP');
    const raw = Buffer.from(enc, 'base64');
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    expect(() => decrypt(raw.toString('base64'), key)).toThrow();
  });

  it('canonical JSON sorts keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { y: 1, x: 2 }] } })).toBe(
      '{"a":{"c":[3,{"x":2,"y":1}],"d":2},"b":1}',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('JWT HS256 sign/verify, expiry and tampering', () => {
    const secret = 'x'.repeat(32);
    const token = signJwt({ sub: 'u1', sid: 's1', iat: 100, exp: 200 }, secret);
    expect(verifyJwt(token, secret, 150)).toEqual({
      ok: true,
      claims: expect.objectContaining({ sub: 'u1' }),
    });
    expect(verifyJwt(token, secret, 200)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyJwt(token, 'y'.repeat(32), 150)).toEqual({ ok: false, reason: 'signature' });
    const [h, , s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'admin', iat: 1, exp: 999 })).toString('base64url')}.${s}`;
    expect(verifyJwt(forged, secret, 150).ok).toBe(false);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${token.split('.')[1]}.`;
    expect(verifyJwt(none, secret, 150).ok).toBe(false);
  });

  it('TOTP matches RFC 6238 / RFC 4226 test vectors', () => {
    // RFC 4226 Appendix D: secret "12345678901234567890"
    const secret = Buffer.from('12345678901234567890');
    expect(hotp(secret, 0)).toBe('755224');
    expect(hotp(secret, 9)).toBe('520489');
    const b32 = base32Encode(secret);
    expect(base32Decode(b32).equals(secret)).toBe(true);
    // RFC 6238: T=59s → 94287082 (8 digits) → last 6 = 287082
    expect(totp(b32, 59_000)).toBe('287082');
    expect(verifyTotp(b32, '287082', 59_000 + 25_000)).toBe(true);
    expect(verifyTotp(b32, '287082', 59_000 + 95_000)).toBe(false);
  });
});
