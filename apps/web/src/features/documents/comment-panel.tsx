'use client';

import { useMutation } from '@tanstack/react-query';
import { CornerDownRight, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toastError } from '@/components/problem-alert';
import { ProblemAlert } from '@/components/problem-alert';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, Textarea } from '@/components/ui/input';
import type { ViewerAnchor } from '@/components/pdf-viewer';
import { UserPicker } from '@/components/user-picker';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import { cn } from '@/lib/utils';
import { type Comment, useRefreshDocument } from './api';

export type CommentFilter = 'all' | 'open' | 'mine';

export function filterComments(list: Comment[], filter: CommentFilter, meId: string): Comment[] {
  if (filter === 'open') return list.filter((c) => c.status === 'OPEN' || c.status === 'RESPONDED');
  if (filter === 'mine') return list.filter((c) => c.author.id === meId);
  return list;
}

/** New comment form (pin/rect from the viewer, or a general note). */
export function CommentComposer({
  revisionId,
  documentId,
  anchor,
  reviewStepId,
  onDone,
  onCancel,
}: {
  revisionId: string;
  documentId: string;
  anchor: ViewerAnchor | null;
  reviewStepId: string | null;
  onDone: (c: Comment) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('comments');
  const refresh = useRefreshDocument();
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/comments', {
          body: {
            ownerType: 'DOCUMENT_REVISION',
            ownerId: revisionId,
            body,
            anchor: anchor ?? undefined,
            reviewStepId: reviewStepId ?? undefined,
            mentions: mentions.map((m) => m.id),
          },
        }),
      ),
    onSuccess: (c) => {
      refresh(documentId, revisionId);
      setBody('');
      setMentions([]);
      onDone(c);
    },
  });
  return (
    <form
      className="space-y-2 border-b border-border bg-subtle p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) create.mutate();
      }}
      data-testid="comment-composer"
    >
      <p className="text-xs text-muted">
        {anchor
          ? t('anchorOnPage', { page: anchor.page, kind: t(`kind.${anchor.kind}`) })
          : t('general')}
        {reviewStepId ? ` · ${t('reviewComment')}` : ''}
      </p>
      <ProblemAlert error={create.error} />
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('placeholder')}
        data-testid="comment-body"
      />
      <div className="flex flex-wrap items-center gap-1">
        {mentions.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full bg-info px-2 py-0.5 text-xs text-info-fg"
          >
            @{m.name}
            <button
              type="button"
              onClick={() => setMentions(mentions.filter((x) => x.id !== m.id))}
              aria-label="x"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <div className="w-52">
          <UserPicker
            value={null}
            placeholder={t('mention')}
            onChange={(id, u) =>
              id &&
              u &&
              !mentions.some((m) => m.id === id) &&
              setMentions([...mentions, { id, name: u.displayNameTh }])
            }
            testId="mention-picker"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={create.isPending || !body.trim()}
          data-testid="comment-save"
        >
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

/** One comment thread with the workflow buttons the API allows (docs/05-workflows.md §3). */
export function CommentCard({
  c,
  revisionId,
  documentId,
  active,
  onSelect,
}: {
  c: Comment;
  revisionId: string;
  documentId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('comments');
  const f = useFormat();
  const refresh = useRefreshDocument();
  const ref = useRef<HTMLLIElement>(null);
  const [mode, setMode] = useState<'respond' | 'reply' | 'reopen' | 'close' | 'edit' | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const done = () => {
    refresh(documentId, revisionId);
    setMode(null);
    setText('');
  };
  const act = useMutation({
    mutationFn: async (kind: NonNullable<typeof mode> | 'delete') => {
      const path = { params: { path: { id: c.id } } };
      switch (kind) {
        case 'respond':
          return unwrap(
            await api.POST('/api/v1/comments/{id}/respond', {
              ...path,
              body: { version: c.version, responseNote: text },
            }),
          );
        case 'close':
          return unwrap(
            await api.POST('/api/v1/comments/{id}/close', {
              ...path,
              body: { version: c.version, note: text || undefined },
            }),
          );
        case 'reopen':
          return unwrap(
            await api.POST('/api/v1/comments/{id}/reopen', {
              ...path,
              body: { version: c.version, note: text || undefined },
            }),
          );
        case 'edit':
          return unwrap(
            await api.PATCH('/api/v1/comments/{id}', {
              ...path,
              body: { version: c.version, body: text },
            }),
          );
        case 'delete':
          return unwrap(
            await api.DELETE('/api/v1/comments/{id}', {
              params: { path: { id: c.id }, query: { version: c.version } },
            }),
          );
        case 'reply':
          return unwrap(
            await api.POST('/api/v1/comments', {
              body: {
                ownerType: 'DOCUMENT_REVISION',
                ownerId: revisionId,
                body: text,
                parentId: c.id,
              },
            }),
          );
      }
    },
    onSuccess: done,
    onError: (e) => toastError(e, t('failed')),
  });
  const can = (a: string) => c.allowedActions.includes(a);
  const needsText = mode === 'respond' || mode === 'reply' || mode === 'edit';

  return (
    <li
      ref={ref}
      className={cn('border-b border-border px-3 py-2 text-sm', active && 'bg-info/40')}
      data-testid={`comment-${c.seq}`}
      data-status={c.status}
    >
      <button type="button" className="block w-full text-left" onClick={onSelect}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">#{c.seq}</span>
          {c.anchor ? (
            <span className="text-xs text-muted">{t('page', { page: c.anchor.page })}</span>
          ) : null}
          <span className="text-xs">{c.author.displayName}</span>
          {c.status !== 'NONE' ? <StatusBadge enumName="CommentStatus" value={c.status} /> : null}
          {c.carriedFromRevLabel ? (
            <span className="text-xs text-muted">
              {t('carriedFrom', { label: c.carriedFromRevLabel })}
            </span>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
        <p className="text-xs text-muted">
          {c.stepName ? `${c.stepName} · ` : ''}
          {f.dateTime(c.createdAt)}
        </p>
      </button>
      {c.responseNote ? (
        <p className="mt-1 flex gap-1 rounded bg-subtle p-2 text-sm" data-testid="comment-response">
          <CornerDownRight className="size-4 shrink-0 text-muted" />
          <span>
            <span className="font-medium">{t('response')}:</span> {c.responseNote}
          </span>
        </p>
      ) : null}
      {c.replies.length ? (
        <ul className="mt-1 space-y-1 border-l-2 border-border pl-3">
          {c.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="text-xs font-medium">{r.author.displayName}</span>{' '}
              <span className="text-xs text-muted">{f.dateTime(r.createdAt)}</span>
              <p className="whitespace-pre-wrap">{r.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {mode ? (
        <div className="mt-2 space-y-2">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={needsText ? t(`${mode}Placeholder`) : t('optionalNote')}
            data-testid="comment-action-text"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              disabled={act.isPending || (needsText && !text.trim())}
              onClick={() => act.mutate(mode)}
              data-testid="comment-action-confirm"
            >
              {t(`action.${mode}`)}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {(['respond', 'close', 'reopen', 'reply'] as const).filter(can).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === 'respond' || a === 'close' ? 'outline' : 'ghost'}
              onClick={() => {
                setText('');
                setMode(a);
              }}
              data-testid={`comment-${a}`}
            >
              {t(`action.${a}`)}
            </Button>
          ))}
          {can('edit') ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(c.body);
                setMode('edit');
              }}
            >
              {t('action.edit')}
            </Button>
          ) : null}
          {can('delete') ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('action.delete')}
              onClick={() => window.confirm(t('confirmDelete')) && act.mutate('delete')}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function CommentFilterSelect({
  value,
  onChange,
}: {
  value: CommentFilter;
  onChange: (f: CommentFilter) => void;
}) {
  const t = useTranslations('comments');
  return (
    <NativeSelect
      className="h-8 w-32 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value as CommentFilter)}
    >
      <option value="all">{t('filter.all')}</option>
      <option value="open">{t('filter.open')}</option>
      <option value="mine">{t('filter.mine')}</option>
    </NativeSelect>
  );
}
