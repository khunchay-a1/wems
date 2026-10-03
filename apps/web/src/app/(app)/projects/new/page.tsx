'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectFields, type ProjectFormValue } from '@/features/projects/project-form';
import { api, unwrap } from '@/lib/api';

function NewProjectInner() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [value, setValue] = useState<ProjectFormValue>({
    name: '',
    type: 'DESIGN',
    clientId: params.get('clientId') ?? '',
    requireSeparationOfDuties: true,
    revisionScheme: 'ALPHA_NUMERIC',
  });
  const create = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== '' && v !== null && v !== undefined),
      ) as ProjectFormValue;
      return unwrap(await api.POST('/api/v1/projects', { body }));
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      router.replace(`/projects/${p.id}`);
    },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('projects.new')} subtitle={t('projects.newHint')} />
      <Card>
        <CardContent className="pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <ProblemAlert error={create.error} />
            <div className="mt-3">
              <ProjectFields value={value} onChange={setValue} error={create.error} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending} data-testid="project-submit">
                {t('common.create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectInner />
    </Suspense>
  );
}
