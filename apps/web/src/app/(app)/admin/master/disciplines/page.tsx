'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { useFieldError } from '@/lib/problem-fields';

type Discipline = Dto<'DisciplineDto'>;

export default function DisciplinesPage() {
  const t = useTranslations();
  const [editing, setEditing] = useState<Discipline | 'new' | null>(null);
  const list = useQuery({
    queryKey: ['disciplines', 'all'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/disciplines', { params: { query: { includeInactive: true } } }),
      ),
  });
  return (
    <Card>
      <div className="flex justify-end p-3">
        <Button size="sm" onClick={() => setEditing('new')} data-testid="new-discipline">
          <Plus /> {t('common.add')}
        </Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>{t('common.code')}</TH>
            <TH>{t('admin.nameTh')}</TH>
            <TH>{t('admin.nameEn')}</TH>
            <TH>{t('master.sortOrder')}</TH>
            <TH>{t('common.status')}</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {list.data?.map((d) => (
            <TR key={d.id}>
              <TD className="font-mono">{d.code}</TD>
              <TD>{d.nameTh}</TD>
              <TD>{d.nameEn}</TD>
              <TD className="tabular-nums">{d.sortOrder}</TD>
              <TD>
                <Badge tone={d.isActive ? 'success' : 'muted'}>
                  {d.isActive ? t('common.active') : t('common.inactive')}
                </Badge>
              </TD>
              <TD className="text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(d)}
                  aria-label={t('common.edit')}
                >
                  <Pencil />
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DisciplineForm
            key={editing === 'new' ? 'new' : editing.id}
            value={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

function DisciplineForm({ value, onDone }: { value: Discipline | 'new'; onDone: () => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [form, setForm] = useState(
    value === 'new' ? { code: '', nameTh: '', nameEn: '', sortOrder: 0, isActive: true } : value,
  );
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        nameTh: form.nameTh,
        nameEn: form.nameEn,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      return value === 'new'
        ? unwrap(await api.POST('/api/v1/disciplines', { body: { ...body, code: form.code } }))
        : unwrap(
            await api.PATCH('/api/v1/disciplines/{id}', {
              params: { path: { id: value.id } },
              body,
            }),
          );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['disciplines'] });
      onDone();
    },
  });
  const fe = useFieldError(save.error);
  return (
    <DialogContent title={value === 'new' ? t('master.newDiscipline') : t('common.edit')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ProblemAlert error={save.error} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('common.code')} hint={t('master.codeHint')} error={fe('code')}>
            <Input
              required
              disabled={value !== 'new'}
              maxLength={10}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              data-testid="discipline-code"
            />
          </FormField>
          <FormField label={t('master.sortOrder')}>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </FormField>
          <FormField label={t('admin.nameTh')}>
            <Input
              required
              value={form.nameTh}
              onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
              data-testid="discipline-name-th"
            />
          </FormField>
          <FormField label={t('admin.nameEn')}>
            <Input
              required
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              data-testid="discipline-name-en"
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v === true })}
          />
          {t('common.active')}
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending} data-testid="discipline-submit">
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
