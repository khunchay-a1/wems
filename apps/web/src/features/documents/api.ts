'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export type DocumentItem = Dto<'DocumentListItemDto'>;
export type Doc = Dto<'DocumentDto'>;
export type Revision = Dto<'RevisionDto'>;
export type ReviewCycle = Dto<'ReviewCycleDto'>;
export type ReviewStep = Dto<'ReviewStepDto'>;
export type Comment = Dto<'CommentDto'>;
export type PdfAnchor = Dto<'PdfAnchorDto'>;
export type PurposeCode = Revision['purposeCode'];
export type FileRole = Dto<'DocumentFileDto'>['role'];

export const PURPOSES: PurposeCode[] = ['FI', 'FR', 'FA', 'FT', 'FC', 'AB'];
export const PLAN_PURPOSES: PurposeCode[] = ['FR', 'FA', 'FT', 'FC'];
export const REVISION_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'ISSUED',
  'SUPERSEDED',
  'VOID',
] as const;
export const CLIENT_CODES = ['CODE_1', 'CODE_2', 'CODE_3', 'CODE_4'] as const;
export const CONFIDENTIALITY = ['CLIENT_SHAREABLE', 'INTERNAL', 'CONFIDENTIAL'] as const;
export const FILE_ROLES: FileRole[] = ['PDF_RENDITION', 'NATIVE', 'SUPPORTING'];

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/documents/{id}', { params: { path: { id } } })),
  });
}

export function useRevision(id: string | null | undefined) {
  return useQuery({
    queryKey: ['revision', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/revisions/{id}', { params: { path: { id: id! } } })),
  });
}

export function useComments(revisionId: string | null | undefined) {
  return useQuery({
    queryKey: ['comments', revisionId],
    enabled: !!revisionId,
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/comments', {
          params: { query: { ownerType: 'DOCUMENT_REVISION', ownerId: revisionId! } },
        }),
      ),
  });
}

/** Invalidate everything that shows a document/revision after a change. */
export function useRefreshDocument() {
  const qc = useQueryClient();
  return (documentId?: string, revisionId?: string) => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
    if (documentId) void qc.invalidateQueries({ queryKey: ['document', documentId] });
    if (revisionId) {
      void qc.invalidateQueries({ queryKey: ['revision', revisionId] });
      void qc.invalidateQueries({ queryKey: ['comments', revisionId] });
    }
    void qc.invalidateQueries({ queryKey: ['review-steps'] });
  };
}

/** Save a Blob response as a file in the browser (exports, CRS). */
export function saveBlob(blob: Blob, fallbackName: string, disposition?: string | null): void {
  const m = disposition ? /filename\*=UTF-8''([^;]+)/i.exec(disposition) : null;
  const name = m ? decodeURIComponent(m[1]!) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Signed download URL of a revision file (stamped PDFs per BR-DOC-070). */
export async function revisionDownloadUrl(
  revisionId: string,
  opts: { fileRole?: FileRole; documentFileId?: string; stamp?: boolean } = {},
): Promise<string> {
  const res = unwrap(
    await api.GET('/api/v1/revisions/{id}/download', {
      params: { path: { id: revisionId }, query: opts },
    }),
  );
  return res.url;
}
