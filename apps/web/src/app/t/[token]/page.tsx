'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileArchive, FileText } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ApiError, api, unwrap } from '@/lib/api';
import { formatDate } from '@/lib/dates';

/** Public download page for clients (docs/07-web-ui.md §7) — no menus, no login, noindex. */
export default function PublicTransmittalPage() {
  const { token } = useParams<{ token: string }>();
  const t = useTranslations('publicTransmittal');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const data = useQuery({
    queryKey: ['public-transmittal', token],
    retry: false,
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/public/transmittals/{token}', { params: { path: { token } } })),
  });
  const date = (v: string) => formatDate(v, { locale: 'th', calendar: 'BUDDHIST', style: 'long' });

  const open = async (key: string, get: () => Promise<{ url: string }>) => {
    setBusy(key);
    setFailed(false);
    try {
      window.location.assign((await get()).url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  if (data.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-48 w-full" />
      </Shell>
    );
  }
  if (data.error || !data.data) {
    const p =
      data.error instanceof ApiError
        ? (data.error.problem as { code: string; senderEmail?: string | null })
        : null;
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-2 p-8 text-center" data-testid="public-expired">
            <h1 className="text-lg font-semibold">
              {p?.code === 'TRN_LINK_EXPIRED' ? t('expired') : t('notFound')}
            </h1>
            {p?.code === 'TRN_LINK_EXPIRED' ? (
              <p className="text-muted">
                {p.senderEmail ? t('contact', { email: p.senderEmail }) : t('contactSender')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </Shell>
    );
  }
  const x = data.data;
  return (
    <Shell company={x.companyName}>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <p className="text-sm text-muted">{t('transmittal')}</p>
            <h1 className="font-mono text-xl font-semibold" data-testid="public-number">
              {x.number}
            </h1>
            <p className="font-medium">{x.subject}</p>
            <p className="text-sm text-muted">{x.projectName}</p>
          </div>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-muted">{t('sentAt')}: </dt>
              <dd className="inline">{date(x.sentAt)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{t('expiresAt')}: </dt>
              <dd className="inline">{date(x.linkExpiresAt)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{t('sender')}: </dt>
              <dd className="inline">
                {x.senderName}
                {x.senderEmail ? ` (${x.senderEmail})` : ''}
              </dd>
            </div>
          </dl>
          {failed ? <p className="text-sm text-danger-fg">{t('downloadFailed')}</p> : null}
          <div className="overflow-x-auto rounded border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>{t('number')}</TH>
                  <TH>{t('title')}</TH>
                  <TH>Rev.</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {x.items.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-mono text-xs whitespace-nowrap">{i.documentNumber}</TD>
                    <TD>
                      {i.documentTitle}
                      <div className="text-xs text-muted">{i.files.join(', ')}</div>
                    </TD>
                    <TD>{i.revLabel}</TD>
                    <TD className="text-right">
                      {i.files.length ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === i.id}
                          data-testid={`public-download-${i.documentNumber}`}
                          onClick={() =>
                            void open(i.id, async () =>
                              unwrap(
                                await api.GET(
                                  '/api/v1/public/transmittals/{token}/items/{itemId}/download',
                                  {
                                    params: { path: { token, itemId: i.id } },
                                  },
                                ),
                              ),
                            )
                          }
                        >
                          <FileText /> {t('download')}
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {x.hasPackage ? (
            <Button
              disabled={busy === 'zip'}
              data-testid="public-download-all"
              onClick={() =>
                void open('zip', async () =>
                  unwrap(
                    await api.GET('/api/v1/public/transmittals/{token}/package', {
                      params: { path: { token } },
                    }),
                  ),
                )
              }
            >
              <FileArchive /> {t('downloadAll')}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ company, children }: { company?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <Download className="size-5 text-primary" />
          <span className="font-semibold">{company ?? 'WEMS'}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
