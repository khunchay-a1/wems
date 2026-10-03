'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Document master data (disciplines, document types…) — screens arrive with P1-03. */
export default function MasterDataPage() {
  const t = useTranslations();
  return (
    <>
      <PageHeader title={t('nav.masterData')} />
      <EmptyState title={t('common.comingSoon')} />
    </>
  );
}
