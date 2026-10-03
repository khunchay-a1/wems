'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Power, Star, Trash2, UserX } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionButton } from '@/components/action-button';
import { ConflictDialog } from '@/components/conflict-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { EnumLabel, StatusBadge } from '@/components/status-badge';
import { formatAddress } from '@/components/thai-address-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientFields, type ClientFormValue } from '@/features/clients/client-form';
import { ContactDialog } from '@/features/clients/contact-dialog';
import { SiteDialog } from '@/features/clients/site-dialog';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDraft } from '@/lib/hooks/use-draft';

const LocationPicker = dynamic(
  () => import('@/components/location-picker').then((m) => m.LocationPicker),
  { ssr: false },
);

type Client = Dto<'ClientDto'>;

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const client = useQuery({
    queryKey: ['client', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/clients/{id}', { params: { path: { id } } })),
  });
  const summary = useQuery({
    queryKey: ['client', id, 'summary'],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/clients/{id}/summary', { params: { path: { id } } })),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['client', id] });
  const toggle = useMutation({
    mutationFn: async (c: Client) =>
      unwrap(
        await api.PATCH('/api/v1/clients/{id}', {
          params: { path: { id } },
          body: { version: c.version, isActive: !c.isActive },
        }),
      ),
    onSuccess: () => {
      void refresh();
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const remove = useMutation({
    mutationFn: async (c: Client) =>
      unwrap(
        await api.DELETE('/api/v1/clients/{id}', {
          params: { path: { id }, query: { version: c.version } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      router.replace('/clients');
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });

  if (!client.data) return <ProblemAlert error={client.error} />;
  const c = client.data;

  return (
    <>
      <Link
        href="/clients"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('clients.title')}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {c.nameTh}
            <Badge tone={c.isActive ? 'success' : 'muted'}>
              {c.isActive ? t('common.active') : t('common.inactive')}
            </Badge>
          </span>
        }
        subtitle={`${c.code}${c.nameEn ? ` · ${c.nameEn}` : ''}`}
        actions={
          <>
            <ActionButton
              state={c}
              action={c.isActive ? 'deactivate' : 'activate'}
              variant="outline"
              onClick={() => toggle.mutate(c)}
              data-testid="client-toggle-active"
            >
              <Power /> {c.isActive ? t('admin.deactivate') : t('admin.activate')}
            </ActionButton>
            <ActionButton
              state={c}
              action="delete"
              variant="outline"
              onClick={() => {
                if (window.confirm(t('clients.confirmDelete'))) remove.mutate(c);
              }}
              data-testid="client-delete"
            >
              <Trash2 /> {t('common.delete')}
            </ActionButton>
          </>
        }
      />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t('clients.general')}</TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            {t('clients.contacts')} ({summary.data?.contactCount ?? 0})
          </TabsTrigger>
          <TabsTrigger value="sites" data-testid="tab-sites">
            {t('clients.sites')} ({summary.data?.siteCount ?? 0})
          </TabsTrigger>
          <TabsTrigger value="projects">
            {t('nav.projects')} ({summary.data?.projectCount ?? 0})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab client={c} onSaved={refresh} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsTab client={c} />
        </TabsContent>
        <TabsContent value="sites">
          <SitesTab client={c} />
        </TabsContent>
        <TabsContent value="projects">
          <Card>
            {summary.data?.recentProjects.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('common.code')}</TH>
                    <TH>{t('common.name')}</TH>
                    <TH>{t('common.status')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {summary.data.recentProjects.map((p) => (
                    <TR
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/projects/${p.id}`)}
                    >
                      <TD className="font-mono text-xs">{p.code}</TD>
                      <TD>{p.name}</TD>
                      <TD>
                        <StatusBadge enumName="ProjectStatus" value={p.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title={t('common.noData')} />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function toForm(c: Client): ClientFormValue {
  return {
    nameTh: c.nameTh,
    nameEn: c.nameEn,
    clientType: c.clientType,
    taxId: c.taxId,
    branchCode: c.branchCode,
    industry: c.industry,
    addressLine: c.addressLine,
    subdistrict: c.subdistrict,
    district: c.district,
    province: c.province,
    postcode: c.postcode,
    phone: c.phone,
    email: c.email,
    website: c.website,
    notes: c.notes,
  };
}

function GeneralTab({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const t = useTranslations();
  const [draft, setDraft] = useDraft(client, toForm);
  const form = draft!;
  const editable = client.allowedActions.includes('edit');
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH('/api/v1/clients/{id}', {
          params: { path: { id: client.id } },
          body: { ...form, version: client.version },
        }),
      ),
    onSuccess: (res) => {
      toast.success(t('common.saved'));
      for (const w of res.warnings)
        toast.warning(t('clients.taxIdExists', { codes: w.clients.join(', ') }));
      onSaved();
    },
  });
  const conflict =
    (save.error as { problem?: { code?: string } } | null)?.problem?.code ===
    'CONFLICT_STALE_VERSION';
  return (
    <Card>
      <CardContent className="pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!conflict ? <ProblemAlert error={save.error} /> : null}
          <fieldset disabled={!editable} className="mt-2">
            <ClientFields value={form} onChange={setDraft} error={save.error} />
          </fieldset>
          {editable ? (
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={save.isPending} data-testid="client-save">
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
      <ConflictDialog
        error={save.error}
        yourInput={form}
        onReload={onSaved}
        onClose={() => save.reset()}
      />
    </Card>
  );
}

type Contact = Dto<'ContactDto'>;

function ContactsTab({ client }: { client: Client }) {
  const t = useTranslations();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const contacts = useQuery({
    queryKey: ['client', client.id, 'contacts'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/clients/{id}/contacts', { params: { path: { id: client.id } } }),
      ),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', client.id] });
  const remove = useMutation({
    mutationFn: async (c: Contact) =>
      unwrap(
        await api.DELETE('/api/v1/clients/{id}/contacts/{contactId}', {
          params: { path: { id: client.id, contactId: c.id }, query: { version: c.version } },
        }),
      ),
    onSuccess: invalidate,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const anonymize = useMutation({
    mutationFn: async (c: Contact) =>
      unwrap(await api.POST('/api/v1/contacts/{id}/anonymize', { params: { path: { id: c.id } } })),
    onSuccess: invalidate,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const manage = client.allowedActions.includes('addContact');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('clients.contacts')}</CardTitle>
        {manage ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing('new')}
            data-testid="new-contact"
          >
            <Plus /> {t('clients.addContact')}
          </Button>
        ) : null}
      </CardHeader>
      {contacts.data?.length ? (
        <Table>
          <THead>
            <TR>
              <TH>{t('common.name')}</TH>
              <TH>{t('common.email')}</TH>
              <TH>{t('common.phone')}</TH>
              <TH>{t('clients.receives')}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {contacts.data.map((c) => (
              <TR key={c.id} data-testid="contact-row">
                <TD>
                  <div className="flex items-center gap-1 font-medium">
                    {c.isAnonymized ? (
                      <span className="text-muted italic">{t('clients.anonymized')}</span>
                    ) : (
                      c.name
                    )}
                    {c.isPrimary ? (
                      <Star
                        className="size-3.5 fill-warning-fg text-warning-fg"
                        aria-label={t('clients.primary')}
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-muted">
                    {[c.position, c.department].filter(Boolean).join(' · ')}
                  </div>
                </TD>
                <TD>{c.email ?? '–'}</TD>
                <TD>{c.phone ?? '–'}</TD>
                <TD className="space-x-1">
                  {c.receivesTransmittals ? <Badge>{t('clients.transmittals')}</Badge> : null}
                  {c.receivesLabReports ? <Badge>{t('clients.labReports')}</Badge> : null}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  {manage && !c.isAnonymized ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(c)}
                        aria-label={t('common.edit')}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          window.confirm(t('clients.confirmDelete')) && remove.mutate(c)
                        }
                        aria-label={t('common.delete')}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : null}
                  {can('user.manage') && !c.isAnonymized ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        window.confirm(t('clients.confirmAnonymize')) && anonymize.mutate(c)
                      }
                      aria-label={t('clients.anonymize')}
                      title={t('clients.anonymize')}
                    >
                      <UserX />
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState title={t('common.noData')} />
      )}
      <ContactDialog
        clientId={client.id}
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />
    </Card>
  );
}

type Site = Dto<'SiteDto'>;

function SitesTab({ client }: { client: Client }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  const sites = useQuery({
    queryKey: ['client', client.id, 'sites'],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/clients/{id}/sites', { params: { path: { id: client.id } } })),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', client.id] });
  const remove = useMutation({
    mutationFn: async (s: Site) =>
      unwrap(
        await api.DELETE('/api/v1/clients/{id}/sites/{siteId}', {
          params: { path: { id: client.id, siteId: s.id }, query: { version: s.version } },
        }),
      ),
    onSuccess: invalidate,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const manage = client.allowedActions.includes('addSite');
  const points = (sites.data ?? [])
    .filter((s) => s.latitude && s.longitude)
    .map((s) => ({
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      label: `${s.code} ${s.name}`,
    }));
  return (
    <div className="space-y-4">
      {points.length ? (
        <LocationPicker key={points.map((p) => p.label).join()} points={points} height={260} />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('clients.sites')}</CardTitle>
          {manage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing('new')}
              data-testid="new-site"
            >
              <Plus /> {t('clients.addSite')}
            </Button>
          ) : null}
        </CardHeader>
        {sites.data?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>{t('common.code')}</TH>
                <TH>{t('common.name')}</TH>
                <TH>{t('clients.siteType')}</TH>
                <TH>{t('clients.defaultStandard')}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {sites.data.map((s) => (
                <TR key={s.id} data-testid={`site-row-${s.code}`}>
                  <TD className="font-mono text-xs">{s.code}</TD>
                  <TD>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted">{formatAddress(s)}</div>
                  </TD>
                  <TD>
                    <EnumLabel enumName="SiteType" value={s.siteType} />
                    {s.buildingClass ? (
                      <span className="text-muted">
                        {' '}
                        · <EnumLabel enumName="BuildingClass" value={s.buildingClass} />
                      </span>
                    ) : null}
                  </TD>
                  <TD data-testid="site-standard">{s.defaultStandard?.code ?? '–'}</TD>
                  <TD className="text-right whitespace-nowrap">
                    {manage ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(s)}
                          aria-label={t('common.edit')}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            window.confirm(t('clients.confirmDelete')) && remove.mutate(s)
                          }
                          aria-label={t('common.delete')}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title={t('common.noData')} />
        )}
      </Card>
      <SiteDialog
        clientId={client.id}
        site={editing}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />
    </div>
  );
}
