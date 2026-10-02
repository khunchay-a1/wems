import { AsyncLocalStorage } from 'node:async_hooks';
import { isUuid } from '../ids/uuid';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;

/** Accepts a client X-Request-Id only if it is a sane token; otherwise mints one. */
export function pickRequestId(header: string | string[] | undefined, mint: () => string): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (value && (isUuid(value) || SAFE_REQUEST_ID.test(value))) return value;
  return mint();
}

/** Per-request facts used by audit logging (who, from where) without threading them through calls. */
export interface RequestContextStore {
  requestId?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  locale?: 'th' | 'en';
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): RequestContextStore {
    return storage.getStore() ?? {};
  },
  set(patch: Partial<RequestContextStore>): void {
    const s = storage.getStore();
    if (s) Object.assign(s, patch);
  },
};
