'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useBlockedReason } from '@/components/action-button';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { type Project, useProject } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_ACTIONS = [
  'start',
  'hold',
  'resume',
  'complete',
  'close',
  'reopen',
  'cancel',
] as const;
type StatusAction = (typeof STATUS_ACTIONS)[number];
const NEEDS_REASON = new Set<StatusAction>(['reopen', 'cancel']);

/** Project header + tabs (docs/07-web-ui.md §2). */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const pathname = usePathname();
  const project = useProject(id);

  if (!project.data) {
    return project.error ? (
      <ProblemAlert error={project.error} />
    ) : (
      <Skeleton className="h-16 w-full" />
    );
  }
  const p = project.data;
  const base = `/projects/${p.id}`;
  const tabs = [
    { href: base, label: t('projects.overview'), exact: true },
    { href: `${base}/documents`, label: t('projects.documents') },
    { href: `${base}/transmittals`, label: t('projects.transmittals') },
    { href: `${base}/design-basis`, label: t('projects.designBasis') },
    { href: `${base}/members`, label: t('projects.team') },
    { href: `${base}/settings`, label: t('projects.settings') },
  ];
  const fullScreen = pathname.endsWith('/review');
  if (fullScreen) return <>{children}</>;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted">{p.code}</span>
            <StatusBadge enumName="ProjectStatus" value={p.status} />
          </div>
          <h1 className="text-xl font-semibold" data-testid="project-title">
            {p.name}
          </h1>
          <p className="text-sm text-muted">
            <Link href={`/clients/${p.client.id}`} className="hover:underline">
              {p.client.nameTh}
            </Link>
            {p.site ? ` · ${p.site.name}` : ''}
          </p>
        </div>
        <StatusActions project={p} />
      </div>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                '-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted hover:text-foreground',
                active && 'border-primary font-medium text-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}

function StatusActions({ project }: { project: Project }) {
  const t = useTranslations();
  const reason = useBlockedReason();
  const qc = useQueryClient();
  const [asking, setAsking] = useState<StatusAction | null>(null);
  const act = useMutation({
    mutationFn: async ({ action, why }: { action: StatusAction; why?: string }) =>
      unwrap(
        await api.POST(`/api/v1/projects/{id}/${action}`, {
          params: { path: { id: project.id } },
          body: { version: project.version, reason: why },
        }),
      ),
    onSuccess: (p) => {
      qc.setQueryData(['project', project.id], p);
      void qc.invalidateQueries({ queryKey: ['projects'] });
      setAsking(null);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const actions = STATUS_ACTIONS.filter((a) => project.allowedActions.includes(a));
  const blocked = project.blockedActions.filter((b) =>
    (STATUS_ACTIONS as readonly string[]).includes(b.action),
  );
  if (!actions.length && !blocked.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" data-testid="project-status-menu">
            {t('projects.changeStatus')} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <DropdownMenuItem
              key={a}
              data-testid={`project-action-${a}`}
              onSelect={() => {
                if (NEEDS_REASON.has(a)) setAsking(a);
                else if (window.confirm(t(`projects.confirm.${a}`))) act.mutate({ action: a });
              }}
            >
              {t(`projects.action.${a}`)}
            </DropdownMenuItem>
          ))}
          {blocked.map((b) => (
            <DropdownMenuItem key={b.action} disabled title={reason(b.code)}>
              {t(`projects.action.${b.action}`)} — {reason(b.code)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReasonDialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking ? t(`projects.action.${asking}`) : ''}
        confirmLabel={t('common.confirm')}
        danger={asking === 'cancel'}
        pending={act.isPending}
        onConfirm={(why) => asking && act.mutate({ action: asking, why })}
      />
    </>
  );
}
