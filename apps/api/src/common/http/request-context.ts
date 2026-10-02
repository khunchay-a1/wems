import { isUuid } from '../ids/id-generator';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;

/** Accepts a client X-Request-Id only if it is a sane token; otherwise mints one. */
export function pickRequestId(header: string | string[] | undefined, mint: () => string): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (value && (isUuid(value) || SAFE_REQUEST_ID.test(value))) return value;
  return mint();
}
