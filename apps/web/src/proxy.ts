import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC = [
  /^\/login(\/|$)/,
  /^\/t\//,
  /^\/_next\//,
  /^\/api\//,
  /^\/favicon/,
  /\.(png|svg|ico|txt|webmanifest)$/,
];

function origin(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
}

/**
 * Content-Security-Policy (docs/06-security.md §7): own origin only, plus the object storage that
 * serves presigned uploads/downloads (S3_PUBLIC_ENDPOINT or S3_ENDPOINT, read at runtime) and
 * blob: for the pdf.js worker. Inline scripts/styles are needed by Next.js hydration.
 */
function contentSecurityPolicy(): string {
  const storage = origin(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT);
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${storage}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${storage}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function secure(res: NextResponse): NextResponse {
  res.headers.set('Content-Security-Policy', contentSecurityPolicy());
  return res;
}

/**
 * Next.js 16 proxy (formerly middleware): pages require a session cookie, otherwise /login?next=…
 * The CSRF cookie (Path=/) is the visible marker of a web session; the API still validates everything.
 */
export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC.some((r) => r.test(pathname))) return secure(NextResponse.next());
  if (req.cookies.get('wems_csrf')) return secure(NextResponse.next());
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
