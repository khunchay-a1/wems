'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from './ui/button';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const t = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted">
      <span>{t('total', { total })}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label={t('prev')}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">{t('page', { page, pages })}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label={t('next')}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
