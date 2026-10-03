'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Download, FileUp, Plus, Search } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import {
  CLIENT_CODES,
  type DocumentItem,
  PURPOSES,
  REVISION_STATUSES,
  saveBlob,
} from '@/features/documents/api';
import { CreateDocumentDialog } from '@/features/documents/create-document-dialog';
import { ImportDialog } from '@/features/documents/import-dialog';
import { useDisciplines, useDocumentTypes } from '@/features/documents/master';
import { useProject, useProjectMembers } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';

const KEYS = [
  'q',
  'disciplineId',
  'documentTypeId',
  'revisionStatus',
  'purposeCode',
  'ownerId',
  'clientReturnCode',
  'hasOpenComments',
  'page',
  'sort',
] as const;

/** Document register (docs/07-web-ui.md §6.2). */
function RegisterInner() {
  const { id: projectId } = useParams<{ id: string }>();
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const { can } = useAuth();
  const [state, set] = useUrlState(KEYS);
  const [q, setQ] = useState(state.q ?? '');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const page = Number(state.page ?? 1);
  const project = useProject(projectId);
  const members = useProjectMembers(projectId);
  const disciplines = useDisciplines();
  const types = useDocumentTypes();

  const query = {
    q: state.q,
    disciplineId: state.disciplineId,
    documentTypeId: state.documentTypeId,
    revisionStatus: state.revisionStatus as
      NonNullable<DocumentItem['currentRevision']>['status'] | undefined,
    purposeCode: state.purposeCode as
      NonNullable<DocumentItem['currentRevision']>['purposeCode'] | undefined,
    ownerId: state.ownerId,
    clientReturnCode: state.clientReturnCode as (typeof CLIENT_CODES)[number] | undefined,
    hasOpenComments: state.hasOpenComments === '1' ? true : undefined,
    sort: state.sort ?? 'number',
  };
  const docs = useQuery({
    queryKey: ['documents', projectId, state],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/documents', {
          params: { path: { projectId }, query: { ...query, page, pageSize: 50 } },
        }),
      ),
  });

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const r = await api.GET('/api/v1/projects/{projectId}/documents/export', {
        params: { path: { projectId }, query },
        parseAs: 'blob',
      });
      if (!r.response.ok || !r.data) throw new Error('export');
      saveBlob(r.data as Blob, 'documents.xlsx', r.response.headers.get('content-disposition'));
    } catch (e) {
      toastError(e, t('common.unexpected'));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<DocumentItem, unknown>[]>(
    () => [
      {
        id: 'number',
        header: t('documents.number'),
        cell: ({ row }) => (
          <span className="flex items-center gap-1 font-mono text-xs whitespace-nowrap">
            {row.original.needsNewRevision ? (
              <AlertTriangle
                className="size-3.5 text-danger-fg"
                aria-label={t('documents.needsNewRevision')}
              />
            ) : null}
            {row.original.number}
          </span>
        ),
      },
      {
        id: 'title',
        header: t('documents.docTitle'),
        cell: ({ row }) => (
          <div className="min-w-48">
            <div className="font-medium">{row.original.title}</div>
            {row.original.status !== 'ACTIVE' ? (
              <StatusBadge enumName="DocumentStatus" value={row.original.status} />
            ) : null}
          </div>
        ),
      },
      {
        id: 'discipline',
        header: t('documents.discipline'),
        cell: ({ row }) => row.original.discipline.code,
      },
      {
        id: 'type',
        header: t('documents.type'),
        cell: ({ row }) => row.original.documentType.code,
      },
      {
        id: 'current',
        header: t('documents.currentRev'),
        cell: ({ row }) => {
          const r = row.original.currentRevision;
          return r ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-semibold">{r.revLabel}</span>
              <StatusBadge enumName="RevisionStatus" value={r.status} />
            </span>
          ) : (
            '–'
          );
        },
      },
      {
        id: 'approved',
        header: t('documents.approvedRev'),
        cell: ({ row }) => {
          const r = row.original.latestApprovedRevision;
          return r ? `${r.revLabel} (${r.purposeCode})` : '–';
        },
      },
      {
        id: 'client',
        header: t('documents.clientCode'),
        cell: ({ row }) => (
          <StatusBadge
            enumName="ClientReturnCode"
            value={row.original.latestApprovedRevision?.clientReturnCode}
          />
        ),
      },
      {
        id: 'comments',
        header: t('documents.openComments'),
        cell: ({ row }) =>
          row.original.openCommentCount ? (
            <span className="font-semibold text-warning-fg tabular-nums">
              {row.original.openCommentCount}
            </span>
          ) : (
            ''
          ),
      },
      {
        id: 'planFC',
        header: t('documents.planFC'),
        cell: ({ row }) => {
          const p = row.original.plans.find((x) => x.purposeCode === 'FC');
          return p?.actualDate ? (
            <span className="text-success-fg">{f.date(p.actualDate)}</span>
          ) : (
            f.date(p?.forecastDate ?? p?.plannedDate)
          );
        },
      },
    ],
    [t, f],
  );

  const editable =
    project.data?.allowedActions.includes('createDocument') ?? can('document.create');

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {can('document.create') ? (
          <>
            <Button
              onClick={() => setCreating(true)}
              disabled={!editable}
              data-testid="new-document"
            >
              <Plus /> {t('documents.register')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setImporting(true)}
              disabled={!editable}
              data-testid="import-documents"
            >
              <FileUp /> {t('documents.import')}
            </Button>
          </>
        ) : null}
        {can('report.export') ? (
          <Button variant="outline" onClick={() => void exportXlsx()} disabled={exporting}>
            <Download /> {t('common.export')}
          </Button>
        ) : null}
        <form
          className="relative ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q });
          }}
        >
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted" />
          <Input
            className="w-72 pl-8"
            placeholder={t('documents.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="document-search"
          />
        </form>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NativeSelect
          className="w-40"
          value={state.disciplineId ?? ''}
          onChange={(e) => set({ disciplineId: e.target.value })}
        >
          <option value="">{t('documents.allDisciplines')}</option>
          {disciplines.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.nameTh}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          value={state.documentTypeId ?? ''}
          onChange={(e) => set({ documentTypeId: e.target.value })}
        >
          <option value="">{t('documents.allTypes')}</option>
          {types.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.nameTh}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          value={state.revisionStatus ?? ''}
          onChange={(e) => set({ revisionStatus: e.target.value })}
        >
          <option value="">{t('documents.anyRevisionStatus')}</option>
          {REVISION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.RevisionStatus.${s}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          value={state.purposeCode ?? ''}
          onChange={(e) => set({ purposeCode: e.target.value })}
        >
          <option value="">{t('documents.anyPurpose')}</option>
          {PURPOSES.map((s) => (
            <option key={s} value={s}>
              {s} · {t(`enums.PurposeCode.${s}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          value={state.ownerId ?? ''}
          onChange={(e) => set({ ownerId: e.target.value })}
        >
          <option value="">{t('documents.anyOwner')}</option>
          {members.data?.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          value={state.clientReturnCode ?? ''}
          onChange={(e) => set({ clientReturnCode: e.target.value })}
        >
          <option value="">{t('documents.anyClientCode')}</option>
          {CLIENT_CODES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.ClientReturnCode.${s}`)}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={state.hasOpenComments === '1'}
            onCheckedChange={(v) => set({ hasOpenComments: v === true ? '1' : '' })}
          />
          {t('documents.hasOpenComments')}
        </label>
        {KEYS.some((k) => k !== 'page' && k !== 'sort' && state[k]) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              set(Object.fromEntries(KEYS.map((k) => [k, undefined])));
            }}
          >
            {t('common.clearFilters')}
          </Button>
        ) : null}
      </div>
      <ProblemAlert error={docs.error} />
      <DataTable
        columns={columns}
        data={docs.data?.data}
        loading={docs.isLoading}
        page={page}
        pageSize={50}
        total={docs.data?.meta.total}
        onPage={(p) => set({ page: p }, false)}
        sort={query.sort}
        onSort={(s) => set({ sort: s })}
        sortable={['number', 'title', 'updatedAt']}
        onRowClick={(d) => router.push(`/projects/${projectId}/documents/${d.id}`)}
        rowTestId={(d) => `document-row-${d.number}`}
      />
      <CreateDocumentDialog
        projectId={projectId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(d) => router.push(`/projects/${projectId}/documents/${d.id}`)}
      />
      <ImportDialog projectId={projectId} open={importing} onOpenChange={setImporting} />
    </>
  );
}

export default function DocumentsRegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
