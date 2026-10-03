'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/** Table filters/sort/page synced with the URL query (docs/07-web-ui.md §3 DataTable). */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const values = useMemo(() => {
    const out = {} as Record<K, string | undefined>;
    for (const k of keys) out[k] = params.get(k) ?? undefined;
    return out;
  }, [params, keys]);
  const set = useCallback(
    (patch: Partial<Record<K, string | number | undefined | null>>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch) as [K, string | number | undefined | null][]) {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return [values, set] as const;
}
