'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const t = useTranslations('home');
  const { me } = useAuth();
  return <PageHeader title={t('greeting', { name: me.displayNameTh })} subtitle={t('intro')} />;
}
