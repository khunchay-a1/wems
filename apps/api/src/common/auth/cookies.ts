/** Cookie names and paths (docs/04-api-conventions.md §2, docs/06-security.md §2.3). */
export const COOKIE_ACCESS = 'wems_at';
export const COOKIE_REFRESH = 'wems_rt';
export const COOKIE_CSRF = 'wems_csrf';
export const ACCESS_COOKIE_PATH = '/api';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const CSRF_HEADER = 'x-csrf-token';
