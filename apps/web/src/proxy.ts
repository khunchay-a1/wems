import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC = [
  /^\/login(\/|$)/,
  /^\/t\//,
  /^\/_next\//,
  /^\/api\//,
  /^\/favicon/,
  /\.(png|svg|ico|txt|webmanifest)$/,
];

/**
 * Next.js 16 proxy (formerly middleware): pages require a session cookie, otherwise /login?next=…
 * The CSRF cookie (Path=/) is the visible marker of a web session; the API still validates everything.
 */
export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.get('wems_csrf')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
