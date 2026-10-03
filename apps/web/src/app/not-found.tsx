import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-xl font-semibold">{t('notFoundTitle')}</h1>
      <Link href="/" className="text-primary underline">
        {t('goHome')}
      </Link>
    </div>
  );
}
