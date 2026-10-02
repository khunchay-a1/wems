/**
 * WEMS API contract. Everything in schema.d.ts is generated from apps/api by `pnpm api:contract`
 * — never edit it by hand (CLAUDE.md rule 9).
 */
export type { components, operations, paths } from './schema';
import type { components } from './schema';

export type Schemas = components['schemas'];
/** Response/request DTO by name, e.g. `Dto<'MeDto'>` */
export type Dto<K extends keyof Schemas> = Schemas[K];

/** RFC 9457 problem body returned by every error (docs/04-api-conventions.md §5) */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  rule?: string;
  errors?: { field: string; code: string; message?: string; row?: number; column?: string }[];
  requestId?: string;
  current?: unknown;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
