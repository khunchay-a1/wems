'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

/** Document master data (M04 §5, docs/07-web-ui.md §5). */
export default function MasterLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const tabs = [
    { href: '/admin/master/disciplines', label: t('master.disciplines') },
    { href: '/admin/master/document-types', label: t('master.documentTypes') },
    { href: '/admin/master/workflow-templates', label: t('master.workflowTemplates') },
  ];
  return (
    <>
      <PageHeader title={t('nav.masterData')} />
      <nav className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-foreground',
              pathname.startsWith(tab.href) && 'border-primary font-medium text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
