'use client';

import { AlertTriangle, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

/** Shows problem+json detail and the copyable request id (docs/07-web-ui.md §3). */
export function ProblemAlert({ error }: { error: unknown }) {
  const t = useTranslations('common');
  if (!error) return null;
  const p = error instanceof ApiError ? error.problem : null;
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-md border border-danger-fg/30 bg-danger p-3 text-sm text-danger-fg"
      data-testid="problem-alert"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{p?.title ?? t('unexpected')}</p>
        {p?.detail ? <p>{p.detail}</p> : null}
        {p?.errors?.length ? (
          <ul className="mt-1 list-disc pl-5">
            {p.errors.map((e, i) => (
              <li key={i}>
                {e.field}: {e.message ?? e.code}
              </li>
            ))}
          </ul>
        ) : null}
        {p?.requestId ? (
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
            onClick={() => {
              void navigator.clipboard.writeText(p.requestId ?? '');
              toast.success(t('copied'));
            }}
          >
            {t('requestId')}: {p.requestId} <Copy className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Toast for mutation errors. */
export function toastError(error: unknown, fallback: string): void {
  if (error instanceof ApiError)
    toast.error(error.problem.title, { description: error.problem.detail });
  else toast.error(fallback);
}
