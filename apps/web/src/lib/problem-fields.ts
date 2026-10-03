'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { ApiError } from './api';

/**
 * Field-level message from a problem+json `errors[]` (docs/04-api-conventions.md §5):
 * a translated `fieldErrors.<CODE>` when the catalog has one, else the server message, else the code.
 */
export function useFieldError(error: unknown): (field: string) => string | undefined {
  const t = useTranslations('fieldErrors');
  return useCallback(
    (field: string) => {
      if (!(error instanceof ApiError)) return undefined;
      const e = error.problem.errors?.find((x) => x.field === field);
      if (!e) return undefined;
      return t.has(e.code) ? t(e.code) : (e.message ?? e.code);
    },
    [error, t],
  );
}
