import * as argon2 from 'argon2';
import { COMMON_PASSWORDS_RAW } from './common-passwords';

/** argon2id m=64MB t=3 p=1 (docs/06-security.md §2.1) */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
} as const;

let commonPasswords: Set<string> | undefined;
function common(): Set<string> {
  commonPasswords ??= new Set(COMMON_PASSWORDS_RAW.split('\n'));
  return commonPasswords;
}

export function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, ARGON2_OPTIONS);
}

export async function verifySecret(
  hash: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

/** A hash to verify against when the user does not exist, so timing does not reveal accounts. */
let dummyHash: Promise<string> | undefined;
export function dummyVerify(secret: string): Promise<boolean> {
  dummyHash ??= hashSecret('wems-dummy-password-for-timing');
  return dummyHash.then((h) => verifySecret(h, secret)).then(() => false);
}

export type PasswordPolicyViolation = 'TOO_SHORT' | 'MATCHES_IDENTITY' | 'TOO_COMMON';

/**
 * Password policy (docs/06-security.md §2.1): ≥ 12 chars, not equal/contained in email or name,
 * not a common password (also after stripping trailing digits/symbols, e.g. "password12345!").
 */
export function checkPasswordPolicy(
  password: string,
  identity: { email?: string | null; names?: (string | null | undefined)[] } = {},
): PasswordPolicyViolation | null {
  if ([...password].length < 12) return 'TOO_SHORT';
  const lower = password.toLowerCase();
  const emailLocal = identity.email?.toLowerCase().split('@')[0] ?? '';
  const ids = [
    identity.email?.toLowerCase(),
    emailLocal,
    ...(identity.names ?? []).map((n) => n?.toLowerCase()),
  ]
    .filter((v): v is string => !!v && v.length >= 3)
    .map((v) => v.replace(/\s+/g, ''));
  const compact = lower.replace(/\s+/g, '');
  if (ids.some((id) => compact === id || (id.length >= 6 && compact.includes(id))))
    return 'MATCHES_IDENTITY';
  const stripped = lower.replace(/[^a-z฀-๿]+$/u, '').replace(/^[^a-z฀-๿]+/u, '');
  if (common().has(lower) || (stripped.length >= 4 && common().has(stripped))) return 'TOO_COMMON';
  if (/^(.)\1+$/u.test(password)) return 'TOO_COMMON';
  return null;
}
