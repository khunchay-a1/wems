'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/empty-state';

export default function Placeholder() {
  const t = useTranslations('common');
  return <EmptyState title={t('comingSoon')} />;
}
