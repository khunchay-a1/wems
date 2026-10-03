'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, PenLine, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useTemplates } from '@/features/documents/master';
import { PROJECT_ROLES } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';

type Template = Dto<'WorkflowTemplateDto'>;
type StepInput = Dto<'WorkflowStepInputDto'>;
const KINDS = ['CHECK', 'REVIEW', 'APPROVE'] as const;

/** Workflow templates: same stepOrder = parallel group (BR-DOC-031, docs/07-web-ui.md §6.8). */
export default function WorkflowTemplatesPage() {
  const t = useTranslations();
  const te = useTranslations('enums');
  const templates = useTemplates(true);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing('new')} data-testid="new-template">
          <Plus /> {t('common.add')}
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {templates.data?.map((tpl) => {
          const groups = [...new Set(tpl.steps.map((s) => s.stepOrder))].sort((a, b) => a - b);
          return (
            <Card key={tpl.id} data-testid={`template-${tpl.code}`}>
              <CardHeader>
                <div>
                  <CardTitle>{tpl.name}</CardTitle>
                  <p className="font-mono text-xs text-muted">{tpl.code}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!tpl.isActive ? <Badge tone="muted">{t('common.inactive')}</Badge> : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(tpl)}
                    aria-label={t('common.edit')}
                  >
                    <Pencil />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-stretch gap-2">
                {groups.map((g, gi) => (
                  <Fragment key={g}>
                    {gi > 0 ? <span className="self-center text-muted">→</span> : null}
                    <div className="space-y-1">
                      {tpl.steps
                        .filter((s) => s.stepOrder === g)
                        .map((s) => (
                          <div
                            key={s.id}
                            className="rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-1.5 font-medium">
                              {s.name}
                              {s.requiresSignature ? (
                                <PenLine
                                  className="size-3.5 text-muted"
                                  aria-label={t('master.signature')}
                                />
                              ) : null}
                              {s.requiresLicense ? (
                                <ShieldCheck
                                  className="size-3.5 text-muted"
                                  aria-label={t('master.license')}
                                />
                              ) : null}
                            </div>
                            <div className="text-xs text-muted">
                              {te(`ReviewStepKind.${s.kind}`)} ·{' '}
                              {t('master.dueDaysShort', { n: s.dueDays })}
                              {s.isOptional ? ` · ${t('master.optional')}` : ''}
                            </div>
                          </div>
                        ))}
                    </div>
                  </Fragment>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <TemplateForm
            key={editing === 'new' ? 'new' : editing.id}
            value={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function TemplateForm({ value, onDone }: { value: Template | 'new'; onDone: () => void }) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const qc = useQueryClient();
  const [code, setCode] = useState(value === 'new' ? '' : value.code);
  const [name, setName] = useState(value === 'new' ? '' : value.name);
  const [description, setDescription] = useState(value === 'new' ? '' : (value.description ?? ''));
  const [isActive, setActive] = useState(value === 'new' ? true : value.isActive);
  const [steps, setSteps] = useState<StepInput[]>(
    value === 'new'
      ? [
          { stepOrder: 1, kind: 'CHECK', name: '', allowedProjectRoles: [], dueDays: 3 },
          {
            stepOrder: 2,
            kind: 'APPROVE',
            name: '',
            allowedProjectRoles: [],
            dueDays: 2,
            requiresSignature: true,
          },
        ]
      : value.steps.map(({ id: _id, ...s }) => s),
  );
  const patch = (i: number, p: Partial<StepInput>) =>
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row!);
    setSteps(next);
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || null, isActive, steps };
      return value === 'new'
        ? unwrap(await api.POST('/api/v1/workflow-templates', { body: { ...body, code } }))
        : unwrap(
            await api.PATCH('/api/v1/workflow-templates/{id}', {
              params: { path: { id: value.id } },
              body,
            }),
          );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflow-templates'] });
      onDone();
    },
  });
  return (
    <DialogContent
      title={value === 'new' ? t('master.newTemplate') : t('common.edit')}
      className="max-w-5xl"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ProblemAlert error={save.error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('common.code')}>
            <Input
              required
              disabled={value !== 'new'}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t('common.name')}>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
          </div>
        </div>
        <FormField label={t('projects.description')}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <div>
          <p className="mb-1 text-sm font-medium">{t('master.steps')}</p>
          <p className="mb-2 text-xs text-muted">{t('master.stepsHint')}</p>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div
                key={i}
                className="grid grid-cols-[4rem_7rem_1fr_6rem_auto] items-start gap-2 rounded-md border border-border p-2"
              >
                <Input
                  type="number"
                  min={1}
                  aria-label={t('master.group')}
                  value={s.stepOrder}
                  onChange={(e) => patch(i, { stepOrder: Number(e.target.value) })}
                />
                <NativeSelect
                  value={s.kind}
                  onChange={(e) => patch(i, { kind: e.target.value as StepInput['kind'] })}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {te(`ReviewStepKind.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
                <div className="space-y-2">
                  <Input
                    required
                    placeholder={t('master.stepName')}
                    value={s.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {PROJECT_ROLES.map((r) => (
                      <label key={r} className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={s.allowedProjectRoles?.includes(r) ?? false}
                          onCheckedChange={(v) =>
                            patch(i, {
                              allowedProjectRoles:
                                v === true
                                  ? [...(s.allowedProjectRoles ?? []), r]
                                  : (s.allowedProjectRoles ?? []).filter((x) => x !== r),
                            })
                          }
                        />
                        {te(`ProjectRole.${r}`)}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <label className="flex items-center gap-1">
                      <Checkbox
                        checked={!!s.requiresSignature}
                        onCheckedChange={(v) => patch(i, { requiresSignature: v === true })}
                      />
                      {t('master.signature')}
                    </label>
                    {s.kind === 'APPROVE' ? (
                      <label className="flex items-center gap-1">
                        <Checkbox
                          checked={!!s.requiresLicense}
                          onCheckedChange={(v) => patch(i, { requiresLicense: v === true })}
                        />
                        {t('master.license')}
                      </label>
                    ) : null}
                    <label className="flex items-center gap-1">
                      <Checkbox
                        checked={!!s.isOptional}
                        onCheckedChange={(v) => patch(i, { isOptional: v === true })}
                      />
                      {t('master.optional')}
                    </label>
                  </div>
                </div>
                <FormField label={t('master.dueDays')}>
                  <Input
                    type="number"
                    min={0}
                    value={s.dueDays ?? 3}
                    onChange={(e) => patch(i, { dueDays: Number(e.target.value) })}
                  />
                </FormField>
                <div className="flex flex-col">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="down"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={steps.length === 1}
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() =>
              setSteps([
                ...steps,
                {
                  stepOrder: Math.max(0, ...steps.map((s) => s.stepOrder)) + 1,
                  kind: 'CHECK',
                  name: '',
                  allowedProjectRoles: [],
                  dueDays: 3,
                },
              ])
            }
          >
            <Plus /> {t('master.addStep')}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isActive} onCheckedChange={(v) => setActive(v === true)} />
          {t('common.active')}
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
