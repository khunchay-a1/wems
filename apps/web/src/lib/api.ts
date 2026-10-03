'use client';

import type { paths, Problem } from '@wems/api-contract';
import createClient from 'openapi-fetch';

function cookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function currentLocale(): 'th' | 'en' {
  return cookie('NEXT_LOCALE') === 'en' ? 'en' : 'th';
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight token refresh (docs/06-security.md §2.4 pattern, also for the web). */
async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

export function onUnauthenticated(): void {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith('/login')) return;
  // full navigation on purpose: drops all client state of the expired session
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/login?next=${encodeURIComponent(here)}`;
}

/** fetch with CSRF/locale/request-id headers and transparent refresh on 401. */
export async function apiFetch(input: Request): Promise<Response> {
  const req = input.clone();
  const decorate = (r: Request) => {
    if (!['GET', 'HEAD'].includes(r.method))
      r.headers.set('X-CSRF-Token', cookie('wems_csrf') ?? '');
    r.headers.set('Accept-Language', currentLocale());
    if (!r.headers.has('X-Request-Id')) r.headers.set('X-Request-Id', crypto.randomUUID());
    return r;
  };
  let res = await fetch(decorate(input));
  if (res.status === 401 && !new URL(req.url).pathname.includes('/auth/')) {
    if (await refreshSession()) res = await fetch(decorate(req));
    else onUnauthenticated();
  }
  return res;
}

export const api = createClient<paths>({
  baseUrl: '',
  fetch: apiFetch,
  credentials: 'same-origin',
});

/** Thrown by `unwrap` with the parsed problem+json body. */
export class ApiError extends Error {
  constructor(
    readonly problem: Problem,
    readonly status: number,
  ) {
    super(problem.detail || problem.title || problem.code);
  }
}

/** openapi-fetch result → data or throw ApiError (for TanStack Query). */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    const p = (result.error ?? {}) as Partial<Problem>;
    throw new ApiError(
      {
        type: p.type ?? '',
        title: p.title ?? result.response.statusText,
        status: result.response.status,
        detail: p.detail ?? '',
        code: p.code ?? 'INTERNAL_ERROR',
        rule: p.rule,
        errors: p.errors,
        requestId: p.requestId,
        current: p.current,
      },
      result.response.status,
    );
  }
  return result.data as T;
}

export function newIdempotencyKey(): string {
  // UUIDv7-like time-ordered key is not required for web; v4 is a valid UUID
  return crypto.randomUUID();
}
