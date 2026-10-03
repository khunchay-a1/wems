'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine, Plus, Save, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionButton } from '@/components/action-button';
import { ConflictDialog, isConflict } from '@/components/conflict-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { type SignatureInput, SignatureDialog } from '@/components/signature-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, newIdempotencyKey, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';
import { useFormat } from '@/lib/hooks/use-format';
import { useFieldError } from '@/lib/problem-fields';
import { cn } from '@/lib/utils';

type DesignBasis = Dto<'DesignBasisDto'>;
type Item = DesignBasis['items'][number];
type Source = Item['source'];
const SOURCES: Source[] = ['ASSUMED', 'MEASURED', 'CLIENT_PROVIDED', 'STANDARD', 'CALCULATED'];

type ItemForm = {
  parameterId: string | null;
  name: string;
  unit: string;
  influentValue: string;
  influentMin: string;
  influentMax: string;
  targetEffluentValue: string;
  source: Source;
  sourceNote: string;
};
type Form = {
  title: string;
  averageFlowM3PerDay: string;
  peakFactor: string;
  designHorizonYear: string;
  populationEquivalent: string;
  targetStandardId: string;
  notes: string;
  items: ItemForm[];
};

const toForm = (d: DesignBasis): Form => ({
  title: d.title,
  averageFlowM3PerDay: d.averageFlowM3PerDay ?? '',
  peakFactor: d.peakFactor ?? '',
  designHorizonYear: d.designHorizonYear?.toString() ?? '',
  populationEquivalent: d.populationEquivalent?.toString() ?? '',
  targetStandardId: d.targetStandardId ?? '',
  notes: d.notes ?? '',
  items: d.items.map((i) => ({
    parameterId: i.parameterId,
    name: i.name,
    unit: i.unit,
    influentValue: i.influentValue ?? '',
    influentMin: i.influentMin ?? '',
    influentMax: i.influentMax ?? '',
    targetEffluentValue: i.targetEffluentValue ?? '',
    source: i.source,
    sourceNote: i.sourceNote ?? '',
  })),
});

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

/** Design basis (docs/07-web-ui.md §6.7, BR-DOC-080..083). */
export default function DesignBasisPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const t = useTranslations();
  const qc = useQueryClient();
  const f = useFormat();
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['design-bases', projectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/design-bases', {
          params: { path: { projectId } },
        }),
      ),
  });
  const current = selected ?? list.data?.[0]?.id ?? null;
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/projects/{projectId}/design-bases', {
          params: { path: { projectId } },
          body: {},
        }),
      ),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['design-bases', projectId] });
      setSelected(d.id);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  if (list.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!list.data?.length) {
    return (
      <>
        <ProblemAlert error={list.error ?? create.error} />
        <EmptyState
          title={t('designBasis.empty')}
          action={
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              data-testid="dbs-create"
            >
              <Plus /> {t('designBasis.create')}
            </Button>
          }
        />
      </>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <aside>
        <ul
          className="overflow-hidden rounded-md border border-border bg-surface"
          data-testid="dbs-revisions"
        >
          {list.data.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r.id)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-subtle',
                  r.id === current && 'bg-subtle font-medium',
                  r.status === 'SUPERSEDED' && 'text-muted',
                )}
              >
                <span>{t('designBasis.revNo', { n: r.revNo })}</span>
                <span className="ml-auto">
                  <StatusBadge enumName="DesignBasisStatus" value={r.status} />
                </span>
              </button>
              {r.approvedAt ? (
                <p className="px-3 pb-2 text-xs text-muted">
                  {r.approvedBy?.displayName} · {f.date(r.approvedAt)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </aside>
      {current ? (
        <Editor
          key={current}
          id={current}
          previousId={list.data[list.data.findIndex((r) => r.id === current) + 1]?.id ?? null}
          onNew={() => create.mutate()}
        />
      ) : null}
    </div>
  );
}

function Editor({
  id,
  previousId,
  onNew,
}: {
  id: string;
  previousId: string | null;
  onNew: () => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const dbs = useQuery({
    queryKey: ['design-basis', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/design-bases/{id}', { params: { path: { id } } })),
  });
  const previous = useQuery({
    queryKey: ['design-basis', previousId],
    enabled: !!previousId,
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/design-bases/{id}', { params: { path: { id: previousId! } } })),
  });
  const parameters = useQuery({
    queryKey: ['parameters'],
    staleTime: 30 * 60_000,
    queryFn: async () => unwrap(await api.GET('/api/v1/parameters')),
  });
  const standards = useQuery({
    queryKey: ['standards'],
    staleTime: 30 * 60_000,
    queryFn: async () => unwrap(await api.GET('/api/v1/regulatory-standards')),
  });
  const [draft, setForm] = useDraft(dbs.data, toForm);
  const [signing, setSigning] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const after = (d: DesignBasis) => {
    qc.setQueryData(['design-basis', id], d);
    void qc.invalidateQueries({ queryKey: ['design-bases'] });
  };
  const save = useMutation({
    mutationFn: async (form: Form) =>
      unwrap(
        await api.PATCH('/api/v1/design-bases/{id}', {
          params: { path: { id } },
          body: {
            version: dbs.data!.version,
            title: form.title,
            averageFlowM3PerDay: orNull(form.averageFlowM3PerDay),
            peakFactor: orNull(form.peakFactor),
            designHorizonYear: form.designHorizonYear ? Number(form.designHorizonYear) : null,
            populationEquivalent: form.populationEquivalent
              ? Number(form.populationEquivalent)
              : null,
            targetStandardId: form.targetStandardId || null,
            notes: form.notes || null,
            items: form.items.map((i) => ({
              parameterId: i.parameterId,
              name: i.name,
              unit: i.unit,
              influentValue: orNull(i.influentValue),
              influentMin: orNull(i.influentMin),
              influentMax: orNull(i.influentMax),
              targetEffluentValue: orNull(i.targetEffluentValue),
              source: i.source,
              sourceNote: orNull(i.sourceNote),
            })),
          },
        }),
      ),
    onSuccess: (d) => {
      toast.success(t('common.saved'));
      after(d);
    },
  });
  const approve = useMutation({
    mutationFn: async (signature: SignatureInput) =>
      unwrap(
        await api.POST('/api/v1/design-bases/{id}/approve', {
          params: { path: { id } },
          headers: { 'Idempotency-Key': key },
          body: { version: dbs.data!.version, signature },
        }),
      ),
    onSuccess: (d) => {
      setSigning(false);
      toast.success(t('designBasis.approved'));
      after(d);
    },
  });
  const fieldError = useFieldError(save.error);
  if (!dbs.data || !draft)
    return dbs.error ? <ProblemAlert error={dbs.error} /> : <Skeleton className="h-64 w-full" />;
  const d = dbs.data;
  const form = draft;
  const editable = d.allowedActions.includes('edit');
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setItem = (n: number, patch: Partial<ItemForm>) =>
    set({ items: form.items.map((x, i) => (i === n ? { ...x, ...patch } : x)) });
  const prevItem = (name: string) => previous.data?.items.find((x) => x.name === name);
  const changed = (a: string | null | undefined, b: string | null | undefined) =>
    !!previous.data && (a ?? '') !== (b ?? '');

  return (
    <Card data-testid="dbs-editor">
      <CardHeader className="flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          {t('designBasis.revNo', { n: d.revNo })}
          <span data-testid="dbs-status">
            <StatusBadge enumName="DesignBasisStatus" value={d.status} />
          </span>
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending}
              data-testid="dbs-save"
            >
              <Save /> {t('common.save')}
            </Button>
          ) : null}
          <ActionButton
            state={d}
            action="approve"
            variant="outline"
            onClick={() => setSigning(true)}
            data-testid="dbs-approve"
          >
            <PenLine /> {t('designBasis.approve')}
          </ActionButton>
          <ActionButton
            state={d}
            action="newRevision"
            variant="outline"
            onClick={onNew}
            data-testid="dbs-new"
          >
            <Plus /> {t('designBasis.newRevision')}
          </ActionButton>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProblemAlert error={isConflict(save.error) ? null : (save.error ?? null)} />
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label={t('designBasis.title')}>
            <Input
              disabled={!editable}
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </FormField>
          <FormField label={t('designBasis.averageFlow')} error={fieldError('averageFlowM3PerDay')}>
            <Input
              disabled={!editable}
              inputMode="decimal"
              value={form.averageFlowM3PerDay}
              onChange={(e) => set({ averageFlowM3PerDay: e.target.value })}
              className={cn(
                changed(form.averageFlowM3PerDay, previous.data?.averageFlowM3PerDay) &&
                  'border-warning-fg',
              )}
              data-testid="dbs-flow"
            />
          </FormField>
          <FormField label={t('designBasis.peakFactor')} error={fieldError('peakFactor')}>
            <Input
              disabled={!editable}
              inputMode="decimal"
              value={form.peakFactor}
              onChange={(e) => set({ peakFactor: e.target.value })}
            />
          </FormField>
          <FormField label={t('designBasis.horizonYear')}>
            <Input
              disabled={!editable}
              inputMode="numeric"
              value={form.designHorizonYear}
              onChange={(e) => set({ designHorizonYear: e.target.value })}
            />
          </FormField>
          <FormField label={t('designBasis.populationEquivalent')}>
            <Input
              disabled={!editable}
              inputMode="numeric"
              value={form.populationEquivalent}
              onChange={(e) => set({ populationEquivalent: e.target.value })}
            />
          </FormField>
          <FormField label={t('designBasis.targetStandard')}>
            <NativeSelect
              disabled={!editable}
              value={form.targetStandardId}
              onChange={(e) => set({ targetStandardId: e.target.value })}
            >
              <option value="">–</option>
              {standards.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.nameTh}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH className="min-w-44">{t('designBasis.parameter')}</TH>
                <TH>{t('designBasis.unit')}</TH>
                <TH>{t('designBasis.influent')}</TH>
                <TH>{t('designBasis.min')}</TH>
                <TH>{t('designBasis.max')}</TH>
                <TH>{t('designBasis.target')}</TH>
                <TH>{t('designBasis.standardLimit')}</TH>
                <TH className="min-w-48">{t('designBasis.source')}</TH>
                {editable ? <TH /> : null}
              </TR>
            </THead>
            <TBody>
              {form.items.map((i, n) => {
                const saved = d.items[n];
                const prev = prevItem(i.name);
                const num = (
                  k: 'influentValue' | 'influentMin' | 'influentMax' | 'targetEffluentValue',
                  testId?: string,
                ) => (
                  <TD>
                    <Input
                      disabled={!editable}
                      inputMode="decimal"
                      className={cn(
                        'h-8 w-24 tabular-nums',
                        changed(i[k], prev?.[k]) && 'border-warning-fg',
                      )}
                      value={i[k]}
                      onChange={(e) => setItem(n, { [k]: e.target.value })}
                      data-testid={testId}
                    />
                  </TD>
                );
                return (
                  <TR key={n} data-testid={`dbs-item-${n}`}>
                    <TD>
                      {editable ? (
                        <div className="space-y-1">
                          <NativeSelect
                            className="h-8"
                            value={i.parameterId ?? ''}
                            onChange={(e) => {
                              const p = parameters.data?.find((x) => x.id === e.target.value);
                              setItem(
                                n,
                                p
                                  ? { parameterId: p.id, name: p.nameTh, unit: p.defaultUnit }
                                  : { parameterId: null },
                              );
                            }}
                            data-testid={`dbs-param-${n}`}
                          >
                            <option value="">{t('designBasis.custom')}</option>
                            {parameters.data?.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code} · {p.nameTh}
                              </option>
                            ))}
                          </NativeSelect>
                          {!i.parameterId ? (
                            <Input
                              className="h-8"
                              value={i.name}
                              onChange={(e) => setItem(n, { name: e.target.value })}
                              placeholder={t('designBasis.name')}
                            />
                          ) : null}
                        </div>
                      ) : (
                        i.name
                      )}
                    </TD>
                    <TD>
                      <Input
                        disabled={!editable}
                        className="h-8 w-20"
                        value={i.unit}
                        onChange={(e) => setItem(n, { unit: e.target.value })}
                      />
                    </TD>
                    {num('influentValue', `dbs-influent-${n}`)}
                    {num('influentMin')}
                    {num('influentMax')}
                    {num('targetEffluentValue', `dbs-target-${n}`)}
                    <TD className="text-xs whitespace-nowrap text-muted">
                      {saved?.standardLimit ? <LimitText l={saved.standardLimit} /> : '–'}
                    </TD>
                    <TD>
                      <NativeSelect
                        disabled={!editable}
                        className="h-8"
                        value={i.source}
                        onChange={(e) => setItem(n, { source: e.target.value as Source })}
                        data-testid={`dbs-source-${n}`}
                      >
                        {SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {t(`enums.DesignValueSource.${s}`)}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input
                        disabled={!editable}
                        className="mt-1 h-8"
                        placeholder={t('designBasis.sourceNote')}
                        value={i.sourceNote}
                        onChange={(e) => setItem(n, { sourceNote: e.target.value })}
                        aria-invalid={!!fieldError(`items[${n}].sourceNote`)}
                        data-testid={`dbs-note-${n}`}
                      />
                    </TD>
                    {editable ? (
                      <TD>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('common.delete')}
                          onClick={() => set({ items: form.items.filter((_, k) => k !== n) })}
                        >
                          <Trash2 />
                        </Button>
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
        {editable ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set({
                items: [
                  ...form.items,
                  {
                    parameterId: null,
                    name: '',
                    unit: '',
                    influentValue: '',
                    influentMin: '',
                    influentMax: '',
                    targetEffluentValue: '',
                    source: 'ASSUMED',
                    sourceNote: '',
                  },
                ],
              })
            }
            data-testid="dbs-add-item"
          >
            <Plus /> {t('designBasis.addItem')}
          </Button>
        ) : null}
        <FormField label={t('designBasis.notes')}>
          <Textarea
            disabled={!editable}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </FormField>
        {previous.data ? (
          <p className="text-xs text-muted">
            {t('designBasis.changedHint', { n: previous.data.revNo })}
          </p>
        ) : null}
      </CardContent>
      <SignatureDialog
        open={signing}
        onOpenChange={setSigning}
        title={t('designBasis.approve')}
        lines={[
          `${t('designBasis.revNo', { n: d.revNo })} · ${d.title}`,
          t('designBasis.itemsCount', { n: d.items.length }),
        ]}
        confirmLabel={t('signature.sign')}
        pending={approve.isPending}
        error={approve.error}
        onSign={(s) => approve.mutate(s)}
      />
      <ConflictDialog
        error={save.error}
        yourInput={form}
        onReload={() => {
          void qc.invalidateQueries({ queryKey: ['design-basis', id] });
          save.reset();
        }}
        onClose={() => save.reset()}
      />
    </Card>
  );
}

function LimitText({ l }: { l: NonNullable<Item['standardLimit']> }) {
  const t = useTranslations('designBasis');
  switch (l.comparator) {
    case 'MAX':
      return <>{t('limitMax', { v: l.maxValue ?? '', unit: l.unit })}</>;
    case 'MIN':
      return <>{t('limitMin', { v: l.minValue ?? '', unit: l.unit })}</>;
    case 'RANGE':
      return <>{t('limitRange', { min: l.minValue ?? '', max: l.maxValue ?? '', unit: l.unit })}</>;
    case 'NOT_DETECTED':
      return <>{t('limitNotDetected')}</>;
    default:
      return <>{l.note ?? '–'}</>;
  }
}
