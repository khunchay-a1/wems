'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import { api, unwrap } from './api';
import type { CalendarPref } from './dates';

export type Me = Dto<'MeDto'>;

interface AuthValue {
  me: Me;
  can: (...permissions: string[]) => boolean;
  calendar: CalendarPref;
  locale: 'th' | 'en';
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useMeQuery() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => unwrap(await api.GET('/api/v1/auth/me')),
    staleTime: 5 * 60_000,
  });
}

export function AuthProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  const qc = useQueryClient();
  const value = useMemo<AuthValue>(
    () => ({
      me,
      can: (...perms) => perms.some((p) => me.permissions.includes(p)),
      calendar: me.calendar,
      locale: me.locale === 'en' ? 'en' : 'th',
      logout: async () => {
        await api.POST('/api/v1/auth/logout', { body: {} });
        qc.clear();
        // full navigation on purpose: no cached data of the previous user survives
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
      },
    }),
    [me, qc],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
