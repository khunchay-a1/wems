'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { FileUploader } from '@/components/file-uploader';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ApiError, api, unwrap } from '@/lib/api';
import { saveBlob, useRefreshDocument } from './api';

type ImportResult = Dto<'ImportResultDto'>;

/** Excel import: upload → dry-run per row → confirm (M04 §8, BR-DOC-015/016). */
export function ImportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const refresh = useRefreshDocument();
  const [fileId, setFileId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: async (dryRun: boolean) =>
      unwrap(
        await api.POST('/api/v1/projects/{projectId}/documents/import', {
          params: { path: { projectId } },
          body: { fileId: fileId!, dryRun },
        }),
      ),
    onSuccess: (res) => {
      if (res.dryRun) {
        setPreview(res);
        return;
      }
      toast.success(t('documents.imported', { count: res.count }));
      refresh();
      close();
    },
  });

  const close = () => {
    setFileId(null);
    setPreview(null);
    run.reset();
    onOpenChange(false);
  };

  const template = async () => {
    try {
      const r = await api.GET('/api/v1/projects/{projectId}/documents/import-template', {
        params: { path: { projectId } },
        parseAs: 'blob',
      });
      if (!r.response.ok || !r.data) throw new Error('template');
      saveBlob(
        r.data as Blob,
        'import-template.xlsx',
        r.response.headers.get('content-disposition'),
      );
    } catch (e) {
      toastError(e, t('common.unexpected'));
    }
  };

  const rowErrors =
    run.error instanceof ApiError && run.error.problem.code === 'IMPORT_INVALID_ROWS'
      ? (run.error.problem.errors ?? [])
      : [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent title={t('documents.import')} description={t('documents.importHelp')} wide>
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => void template()}>
            <Download /> {t('documents.downloadTemplate')}
          </Button>
          <FileUploader
            purpose="IMPORT"
            accept=".xlsx,.csv"
            testId="import-uploader"
            onUploaded={(f) => {
              setFileId(f.id);
              setPreview(null);
              run.reset();
            }}
          />
          {rowErrors.length ? (
            <div className="rounded border border-danger-fg/30 bg-danger p-3 text-sm text-danger-fg">
              <p className="mb-1 font-semibold">{t('documents.importErrors')}</p>
              <ul className="max-h-48 list-disc overflow-auto pl-5" data-testid="import-errors">
                {rowErrors.map((e, i) => (
                  <li key={i}>
                    {t('documents.importRow', {
                      row: (e as { row?: number }).row ?? '?',
                      column: (e as { column?: string }).column ?? e.field,
                    })}
                    : {e.message ?? e.code}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ProblemAlert error={run.error} />
          )}
          {preview ? (
            <div>
              <p className="mb-1 text-sm font-medium">
                {t('documents.importPreview', { count: preview.count })}
              </p>
              <div className="max-h-64 overflow-auto rounded border border-border">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-16">#</TH>
                      <TH>{t('documents.number')}</TH>
                      <TH>{t('documents.docTitle')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {preview.rows.map((r) => (
                      <TR key={r.row}>
                        <TD className="tabular-nums">{r.row}</TD>
                        <TD className="font-mono text-xs">
                          {r.number ?? t('documents.autoNumber')}
                        </TD>
                        <TD>{r.title}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          {preview ? (
            <Button
              onClick={() => run.mutate(false)}
              disabled={run.isPending}
              data-testid="import-commit"
            >
              {t('documents.importConfirm', { count: preview.count })}
            </Button>
          ) : (
            <Button
              onClick={() => run.mutate(true)}
              disabled={!fileId || run.isPending}
              data-testid="import-check"
            >
              {t('documents.importCheck')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
