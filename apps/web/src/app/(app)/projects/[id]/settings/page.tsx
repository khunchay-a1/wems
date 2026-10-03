'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConflictDialog } from '@/components/conflict-dialog';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { type Project, useProject } from '@/features/projects/api';
import { ProjectFields, type ProjectFormValue } from '@/features/projects/project-form';
import { api, ApiError, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';

function toForm(p: Project): ProjectFormValue {
  return {
    clientId: p.client.id,
    siteId: p.site?.id ?? null,
    name: p.name,
    nameEn: p.nameEn,
    description: p.description,
    type: p.type,
    contractNo: p.contractNo,
    contractValue: p.contractValue,
    plannedStartDate: p.plannedStartDate,
    plannedEndDate: p.plannedEndDate,
    actualStartDate: p.actualStartDate,
    actualEndDate: p.actualEndDate,
    projectManagerId: p.projectManager?.id,
    revisionScheme: p.revisionScheme,
    requireSeparationOfDuties: p.requireSeparationOfDuties,
  };
}

/** Project settings (BR-PRJ-001/004/010) and the DOCUMENT numbering override. */
export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);
  if (!project.data) return null;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <SettingsForm project={project.data} />
      </div>
      <NumberingCard project={project.data} />
    </div>
  );
}

function SettingsForm({ project }: { project: Project }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [draft, setDraft] = useDraft(project, toForm);
  const form = draft!;
  const editable = project.allowedActions.includes('edit');
  const save = useMutation({
    mutationFn: async () => {
      const { clientId: _c, ...body } = form;
      return unwrap(
        await api.PATCH('/api/v1/projects/{id}', {
          params: { path: { id: project.id } },
          body: { ...body, version: project.version },
        }),
      );
    },
    onSuccess: (p) => {
      qc.setQueryData(['project', project.id], p);
      void qc.invalidateQueries({ queryKey: ['project', project.id, 'members'] });
      toast.success(t('common.saved'));
    },
  });
  const isConflict =
    save.error instanceof ApiError && save.error.problem.code === 'CONFLICT_STALE_VERSION';
  const schemeLocked =
    save.error instanceof ApiError && save.error.problem.code === 'PROJECT_SCHEME_LOCKED';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('projects.settings')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!isConflict ? <ProblemAlert error={save.error} /> : null}
          <fieldset disabled={!editable} className="mt-2">
            <ProjectFields
              value={form}
              onChange={setDraft}
              error={save.error}
              clientLocked
              schemeLocked={schemeLocked}
            />
          </fieldset>
          {editable ? (
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={save.isPending} data-testid="project-save">
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
      <ConflictDialog
        error={save.error}
        yourInput={form}
        onReload={() => void qc.invalidateQueries({ queryKey: ['project', project.id] })}
        onClose={() => save.reset()}
      />
    </Card>
  );
}

function NumberingCard({ project }: { project: Project }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const numbering = useQuery({
    queryKey: ['project', project.id, 'numbering'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{id}/numbering-scheme', {
          params: { path: { id: project.id } },
        }),
      ),
  });
  const [pattern, setPattern] = useState<string | null>(null);
  const value = pattern ?? numbering.data?.pattern ?? '';
  const editable = project.allowedActions.includes('editNumbering');
  const save = useMutation({
    mutationFn: async (p: string | null) =>
      unwrap(
        await api.PUT('/api/v1/projects/{id}/numbering-scheme', {
          params: { path: { id: project.id } },
          body: { pattern: p },
        }),
      ),
    onSuccess: (d) => {
      qc.setQueryData(['project', project.id, 'numbering'], d);
      setPattern(null);
      toast.success(t('common.saved'));
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('projects.numbering')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProblemAlert error={save.error} />
        <FormField
          label={t('admin.pattern')}
          hint={
            numbering.data?.isOverride
              ? t('projects.numberingOverride')
              : t('projects.numberingGlobal')
          }
        >
          <Input
            className="font-mono"
            value={value}
            disabled={!editable}
            onChange={(e) => setPattern(e.target.value)}
            data-testid="numbering-pattern"
          />
        </FormField>
        <p className="text-sm">
          {t('admin.example')}: <span className="font-mono">{numbering.data?.example}</span>
        </p>
        <p className="text-xs text-muted">{t.raw('admin.tokensHelp') as string}</p>
        {editable ? (
          <div className="flex justify-end gap-2">
            {numbering.data?.isOverride ? (
              <Button variant="outline" onClick={() => save.mutate(null)} disabled={save.isPending}>
                {t('projects.useGlobal')}
              </Button>
            ) : null}
            <Button onClick={() => save.mutate(value)} disabled={save.isPending || !value}>
              {t('common.save')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
