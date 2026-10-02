import { createHmac } from 'node:crypto';
import { safeEqual } from './crypto';

/** Minimal HS256 JWT (RFC 7519) — only what WEMS needs; rejects any other algorithm. */
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export interface JwtClaims {
  sub: string;
  iat: number;
  exp: number;
  [claim: string]: unknown;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signJwt(claims: JwtClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${HEADER}.${body}.${sign(`${HEADER}.${body}`, secret)}`;
}

export type JwtVerifyResult =
  { ok: true; claims: JwtClaims } | { ok: false; reason: 'malformed' | 'signature' | 'expired' };

export function verifyJwt(token: string, secret: string, nowSec: number): JwtVerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, body, sig] = parts as [string, string, string];
  try {
    const h = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string };
    if (h.alg !== 'HS256') return { ok: false, reason: 'malformed' };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!safeEqual(sig, sign(`${header}.${body}`, secret))) return { ok: false, reason: 'signature' };
  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.exp !== 'number' || typeof claims.sub !== 'string')
    return { ok: false, reason: 'malformed' };
  if (claims.exp <= nowSec) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
