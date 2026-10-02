import { NumberingService } from '../src/common/numbering/numbering.service';
import { makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin } from './utils/http';

describe('P0-08 numbering, settings, audit admin', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('AT-PLT-04 twenty concurrent document numbers in the same discipline/type are 001–020 without gaps or duplicates', async () => {
    const numbering = t.app.get(NumberingService);
    const ctx = { project: 'P26-001', discipline: 'PR', type: 'DWG' };
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () =>
        t.prisma.$transaction((tx) => numbering.next(tx, 'DOCUMENT', ctx)),
      ),
    );
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `P26-001-PR-DWG-${String(i + 1).padStart(3, '0')}`),
    );
  });

  it('BR-PLT-010 a rolled-back transaction may skip a number but never repeats one', async () => {
    const numbering = t.app.get(NumberingService);
    const ctx = { project: 'P26-002', discipline: 'CV', type: 'RPT' };
    const a = await t.prisma.$transaction((tx) => numbering.next(tx, 'DOCUMENT', ctx));
    await expect(
      t.prisma.$transaction(async (tx) => {
        await numbering.next(tx, 'DOCUMENT', ctx);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    const b = await t.prisma.$transaction((tx) => numbering.next(tx, 'DOCUMENT', ctx));
    expect(a).toBe('P26-002-CV-RPT-001');
    expect(b > a).toBe(true);
  });

  it('BR-PLT-011 skips numbers that already exist', async () => {
    const numbering = t.app.get(NumberingService);
    const taken = new Set(['TR-P26-009-001', 'TR-P26-009-002']);
    const n = await t.prisma.$transaction((tx) =>
      numbering.next(
        tx,
        'TRANSMITTAL',
        { project: 'P26-009' },
        { exists: (x) => Promise.resolve(taken.has(x)) },
      ),
    );
    expect(n).toBe('TR-P26-009-003');
  });

  it('admin edits a pattern and previews the next number (Buddhist year)', async () => {
    const admin = await makeUser(t.prisma, { roles: ['ADMIN'] });
    const c = await bearerLogin(t.app, admin.email);
    const schemes = await c.get('/api/v1/numbering-schemes').expect(200);
    const project = schemes.body.find((s: { entity: string }) => s.entity === 'PROJECT');
    expect(project.example).toBe('P26-001');
    await c
      .put(`/api/v1/numbering-schemes/${project.id}`)
      .send({ pattern: 'P{BYY}-{SEQ}', resetPolicy: 'YEARLY' })
      .expect(422)
      .expect((r) => expect(r.body.code).toBe('NUMBERING_PATTERN_INVALID'));
    const upd = await c
      .put(`/api/v1/numbering-schemes/${project.id}`)
      .send({ pattern: 'P{BYY}-{SEQ:3}', resetPolicy: 'YEARLY' })
      .expect(200);
    expect(upd.body.example).toBe('P69-001');
    const prev = await c
      .post('/api/v1/numbering-schemes/preview')
      .send({ entity: 'PROJECT' })
      .expect(200);
    expect(prev.body.number).toBe('P69-001');
    await c
      .put(`/api/v1/numbering-schemes/${project.id}`)
      .send({ pattern: 'P{YY}-{SEQ:3}', resetPolicy: 'YEARLY' })
      .expect(200);
  });

  it('settings are validated; holidays readable by everyone, security settings by admins only', async () => {
    const admin = await makeUser(t.prisma, { roles: ['ADMIN'] });
    const c = await bearerLogin(t.app, admin.email);
    await c
      .put('/api/v1/settings/calendar.holidays')
      .send({ value: ['2026-10-13', 'not-a-date'] })
      .expect(422)
      .expect((r) => expect(r.body.code).toBe('SETTING_INVALID'));
    await c
      .put('/api/v1/settings/calendar.holidays')
      .send({ value: ['2026-10-13', '2026-10-23'] })
      .expect(200);
    const eng = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email);
    const h = await eng.get('/api/v1/settings/calendar.holidays').expect(200);
    expect(h.body.value).toEqual(['2026-10-13', '2026-10-23']);
    await eng.get('/api/v1/settings/security.sessionIdleMinutes').expect(404);
    await eng.put('/api/v1/settings/calendar.holidays').send({ value: [] }).expect(403);
    await c.put('/api/v1/settings/calendar.holidays').send({ value: [] }).expect(200);
  });

  it('audit log search and CSV export (audit.read)', async () => {
    const admin = await makeUser(t.prisma, { roles: ['ADMIN'] });
    const c = await bearerLogin(t.app, admin.email);
    const res = await c.get('/api/v1/audit-logs?action=auth.&pageSize=5').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].action.startsWith('auth.')).toBe(true);
    const csv = await c.get('/api/v1/audit-logs/export?action=auth.').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('occurredAt,actorName,action');
    const eng = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email);
    await eng.get('/api/v1/audit-logs').expect(403);
  });

  it('GET /app/config is public', async () => {
    const res = await (
      await import('supertest')
    )
      .default(t.app.getHttpServer())
      .get('/api/v1/app/config')
      .expect(200);
    expect(res.body.minSupportedVersion).toEqual({ android: '1.0.0', ios: '1.0.0' });
  });
});
