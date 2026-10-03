'use client';

import { useLocale } from 'next-intl';
import { useCallback } from 'react';
import { useAuth } from '../auth';
import { formatDate, formatDateTime } from '../dates';

/** Date formatters bound to the user's calendar preference (พ.ศ./ค.ศ.) and locale. */
export function useFormat() {
  const { calendar } = useAuth();
  const locale = useLocale();
  return {
    date: useCallback(
      (v: string | null | undefined, style?: 'short' | 'medium' | 'long') =>
        formatDate(v, { locale, calendar, style }),
      [locale, calendar],
    ),
    dateTime: useCallback(
      (v: string | null | undefined) => formatDateTime(v, { locale, calendar }),
      [locale, calendar],
    ),
  };
}
