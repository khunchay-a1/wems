'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

export type DirectoryUser = Dto<'DirectoryUserDto'>;

export function useDirectory() {
  return useQuery({
    queryKey: ['directory'],
    queryFn: async () => unwrap(await api.GET('/api/v1/users/directory')),
    staleTime: 5 * 60_000,
  });
}

export function displayName(
  u: Pick<DirectoryUser, 'displayNameTh' | 'displayNameEn'>,
  locale: string,
): string {
  return locale === 'en' && u.displayNameEn ? u.displayNameEn : u.displayNameTh;
}

/**
 * Pick one active user from the directory (docs/07-web-ui.md §3). `filter` narrows the list
 * (e.g. project members); eligibility rules themselves stay on the API.
 */
export function UserPicker({
  value,
  onChange,
  filter,
  disabled,
  placeholder,
  testId = 'user-picker',
}: {
  value: string | null;
  onChange: (id: string | null, user: DirectoryUser | null) => void;
  filter?: (u: DirectoryUser) => boolean;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  const directory = useDirectory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const users = useMemo(
    () => (directory.data ?? []).filter((u) => u.isActive && (!filter || filter(u))),
    [directory.data, filter],
  );
  const selected =
    users.find((u) => u.id === value) ?? directory.data?.find((u) => u.id === value) ?? null;
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? users.filter((u) =>
          `${u.displayNameTh} ${u.displayNameEn ?? ''} ${u.position ?? ''}`
            .toLowerCase()
            .includes(needle),
        )
      : users;
  }, [users, q]);

  return (
    <div className="relative" data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-surface px-3 text-left text-sm disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={cn('truncate', !selected && 'text-muted')}>
          {selected ? displayName(selected, locale) : (placeholder ?? t('choosePerson'))}
        </span>
        <span className="flex items-center gap-1">
          {selected && !disabled ? (
            <X
              className="size-4 text-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
              }}
            />
          ) : null}
          <ChevronsUpDown className="size-4 text-muted" />
        </span>
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
          <div className="p-2">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search')}
              data-testid={`${testId}-search`}
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1" role="listbox">
            {matches.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={u.id === value}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-subtle"
                  onClick={() => {
                    onChange(u.id, u);
                    setOpen(false);
                    setQ('');
                  }}
                  data-testid={`${testId}-option`}
                >
                  <Check className={cn('size-4', u.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{displayName(u, locale)}</span>
                    {u.position ? (
                      <span className="block truncate text-xs text-muted">{u.position}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">{t('noData')}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
