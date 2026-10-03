'use client';

import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toastError } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { saveBlob } from './api';

/** Planned vs actual deliveries per month + MDL export (M04 §9). */
export function DeliveryCard({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { can, calendar } = useAuth();
  const stats = useQuery({
    queryKey: ['document-stats', projectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/documents/stats', {
          params: { path: { projectId } },
        }),
      ),
  });
  const mdl = async (format: 'xlsx' | 'pdf') => {
    try {
      const r = await api.GET('/api/v1/projects/{projectId}/reports/mdl', {
        params: { path: { projectId }, query: { format } },
        parseAs: 'blob',
      });
      if (!r.response.ok || !r.data) throw new Error('mdl');
      saveBlob(r.data as Blob, `MDL.${format}`, r.response.headers.get('content-disposition'));
    } catch (e) {
      toastError(e, t('common.unexpected'));
    }
  };
  const months = stats.data?.monthly ?? [];
  const max = Math.max(1, ...months.flatMap((m) => [m.planned, m.actual]));
  const label = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(Date.UTC(y!, mo! - 1, 1));
    const name = d.toLocaleString(locale === 'en' ? 'en-GB' : 'th-TH', {
      month: 'short',
      timeZone: 'UTC',
    });
    const year = calendar === 'BUDDHIST' ? (y! + 543) % 100 : y! % 100;
    return `${name} ${String(year).padStart(2, '0')}`;
  };
  return (
    <Card className="col-span-2 lg:col-span-4" data-testid="delivery-card">
      <CardHeader className="flex-wrap gap-2">
        <CardTitle>{t('reports.delivery')}</CardTitle>
        {can('report.export') ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void mdl('xlsx')}
              data-testid="mdl-xlsx"
            >
              <FileSpreadsheet /> MDL Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => void mdl('pdf')}>
              <FileText /> MDL PDF
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {stats.data ? (
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span>
              {t('reports.openComments')}:{' '}
              <strong className="tabular-nums">{stats.data.openComments}</strong>
            </span>
            <span>
              {t('reports.needsNewRevision')}:{' '}
              <strong className="tabular-nums text-danger-fg">{stats.data.needsNewRevision}</strong>
            </span>
          </div>
        ) : null}
        {months.length ? (
          <>
            <div
              className="flex h-40 items-end gap-3 overflow-x-auto"
              role="img"
              aria-label={t('reports.delivery')}
            >
              {months.map((m) => (
                <div key={m.month} className="flex min-w-12 flex-col items-center gap-1">
                  <div className="flex h-32 items-end gap-1">
                    <div
                      className="w-4 rounded-t bg-border"
                      style={{ height: `${(m.planned / max) * 100}%` }}
                      title={`${t('documents.planned')}: ${m.planned}`}
                    />
                    <div
                      className="w-4 rounded-t bg-primary"
                      style={{ height: `${(m.actual / max) * 100}%` }}
                      title={`${t('documents.actual')}: ${m.actual}`}
                    />
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted">{label(m.month)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="size-3 rounded-sm bg-border" /> {t('documents.planned')}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 rounded-sm bg-primary" /> {t('documents.actual')}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{t('reports.noPlans')}</p>
        )}
      </CardContent>
    </Card>
  );
}
