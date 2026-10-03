'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useFieldError } from '@/lib/problem-fields';

type Contact = Dto<'ContactDto'>;
type Form = Dto<'CreateContactDto'>;

const blank: Form = {
  name: '',
  isPrimary: false,
  receivesTransmittals: false,
  receivesLabReports: false,
};

export function ContactDialog({
  clientId,
  contact,
  onClose,
  onSaved,
}: {
  clientId: string;
  contact: Contact | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = contact !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <ContactForm
          key={contact === 'new' ? 'new' : contact.id}
          clientId={clientId}
          contact={contact}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function ContactForm({
  clientId,
  contact,
  onClose,
  onSaved,
}: {
  clientId: string;
  contact: Contact | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [form, setForm] = useState<Form>(contact === 'new' ? blank : { ...contact });
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        position: form.position,
        department: form.department,
        phone: form.phone,
        email: form.email || null,
        isPrimary: form.isPrimary,
        receivesTransmittals: form.receivesTransmittals,
        receivesLabReports: form.receivesLabReports,
        notes: form.notes,
      };
      return contact === 'new'
        ? unwrap(
            await api.POST('/api/v1/clients/{id}/contacts', {
              params: { path: { id: clientId } },
              body,
            }),
          )
        : unwrap(
            await api.PATCH('/api/v1/clients/{id}/contacts/{contactId}', {
              params: { path: { id: clientId, contactId: contact.id } },
              body: { ...body, version: contact.version },
            }),
          );
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const fieldError = useFieldError(save.error);
  const flag = (k: 'isPrimary' | 'receivesTransmittals' | 'receivesLabReports', label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={!!form[k]}
        onCheckedChange={(v) => setForm({ ...form, [k]: v === true })}
        data-testid={`contact-${k}`}
      />
      {label}
    </label>
  );
  return (
    <DialogContent title={contact === 'new' ? t('clients.addContact') : t('common.edit')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ProblemAlert error={save.error} />
        <FormField label={t('common.name')} error={fieldError('name')}>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            data-testid="contact-name"
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('admin.position')}>
            <Input
              value={form.position ?? ''}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
            />
          </FormField>
          <FormField label={t('admin.department')}>
            <Input
              value={form.department ?? ''}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </FormField>
          <FormField label={t('common.email')} error={fieldError('email')}>
            <Input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              data-testid="contact-email"
            />
          </FormField>
          <FormField label={t('common.phone')}>
            <Input
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
        </div>
        <div className="space-y-1.5">
          {flag('isPrimary', t('clients.primary'))}
          {flag('receivesTransmittals', t('clients.receivesTransmittals'))}
          {flag('receivesLabReports', t('clients.receivesLabReports'))}
        </div>
        <FormField label={t('clients.notes')}>
          <Textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending} data-testid="contact-submit">
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
