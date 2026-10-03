'use client';

import { ChevronDown, LogOut, Search, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { NotificationBell } from './notification-bell';

export function Topbar() {
  const t = useTranslations();
  const { me, logout } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-surface px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold text-primary">
        <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-white">W</span>
        {t('common.appName')}
      </Link>
      <form
        className="relative ml-4 max-w-xl flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('common.searchPlaceholder')}
          className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-8 text-sm"
          data-testid="global-search"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-subtle"
            data-testid="user-menu"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-4" />
            </span>
            <span className="max-w-40 truncate">{me.displayNameTh}</span>
            <ChevronDown className="size-4 text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{me.email}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => router.push('/profile')}>
              <User className="size-4" /> {t('nav.profile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()} data-testid="logout">
              <LogOut className="size-4" /> {t('nav.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
