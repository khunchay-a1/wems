'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, enabledFeatures, NAV, type NavItem } from './nav';

export function Sidebar() {
  const t = useTranslations('nav');
  const { can } = useAuth();
  const pathname = usePathname();
  const features = enabledFeatures();
  const visible = (i: NavItem) =>
    (!i.permissions?.length || can(...i.permissions)) && (!i.feature || features.has(i.feature));
  const link = (i: NavItem) => {
    const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href);
    const Icon = i.icon;
    return (
      <Link
        key={i.href}
        href={i.href}
        data-testid={`nav-${i.key}`}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
          active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-subtle',
        )}
      >
        <Icon className="size-4" />
        {t(i.key)}
      </Link>
    );
  };
  const admin = ADMIN_NAV.filter(visible);
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-3">
      {NAV.filter(visible).map(link)}
      {admin.length ? (
        <>
          <p className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">
            {t('admin')}
          </p>
          {admin.map(link)}
        </>
      ) : null}
    </nav>
  );
}
