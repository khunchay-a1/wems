import { createHash } from 'node:crypto';
import { encodeCursor } from '../src/modules/sync/domain/sync-cursor';
import { makeUser } from './factories/users';
import { type DesignProject, makeDesignProject, stepsFor, uploadPdf } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { startFakeGotenberg } from './utils/fake-gotenberg';
import { bearerLogin, type BearerClient } from './utils/http';

interface Change {
  entityType: string;
  op: 'UPSERT' | 'DELETE';
  id: string;
  data?: Record<string, unknown>;
}

/** Pulls a scope until hasMore = false, like the mobile sync engine does. */
async function pullAll(c: BearerClient, scope: string, cursor?: string, limit = 500) {
  const changes: Change[] = [];
  let pages = 0;
  for (;;) {
    const q = new URLSearchParams({ scope, limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    const body = (await c.get(`/api/v1/sync/pull?${q.toString()}`).expect(200)).body as {
      changes: Change[];
      nextCursor: string;
      hasMore: boolean;
      scope: string;
    };
    expect(body.scope).toBe(scope);
    changes.push(...body.changes);
    cursor = body.nextCursor;
    pages += 1;
    if (!body.hasMore) return { changes, cursor, pages };
  }
}

describe('P0-14 mobile pull sync (docs/08-mobile.md §5.1)', () => {
  let t: TestApp;
  let p: DesignProject;
  let gotenberg: Awaited<ReturnType<typeof startFakeGotenberg>>;

  beforeAll(async () => {
    gotenberg = await startFakeGotenberg();
    process.env.GOTENBERG_URL = gotenberg.url;
    t = await createTestApp();
    p = await makeDesignProject(t, 'ซิงก์มือถือ');
  }, 60_000);
  afterAll(async () => {
    await t.close();
    await gotenberg.close();
  });

  it('global scope: snapshot pages through master data, then follows the change log', async () => {
    const all = await pullAll(p.site.c, 'global', undefined, 5);
    expect(all.pages).toBeGreaterThan(1);
    const disciplines = all.changes.filter((c) => c.entityType === 'Discipline');
    expect(disciplines.map((d) => d.data?.code)).toContain('PR');
    expect(all.changes.some((c) => c.entityType === 'DocumentType')).toBe(true);
    expect(new Set(all.changes.map((c) => c.id)).size).toBe(all.changes.length);
    const again = await pullAll(p.site.c, 'global', all.cursor);
    expect(again.changes).toEqual([]);
  });

  it('project scope: snapshot, then only the changed entity; revisions carry current files', async () => {
    const d = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/documents`)
        .send({
          title: 'ผังท่อน้ำดิบ',
          disciplineId: p.disciplines.PR,
          documentTypeId: p.types.DWG,
          ownerId: p.author.id,
        })
        .expect(201)
    ).body;
    const rev = (
      await p.author.c
        .post(`/api/v1/documents/${d.id}/revisions`)
        .send({ purposeCode: 'FA' })
        .expect(201)
    ).body;
    const pdf = await uploadPdf(t, p.author.c);
    await p.author.c
      .post(`/api/v1/revisions/${rev.id}/files`)
      .send({ fileId: pdf, role: 'PDF_RENDITION' })
      .expect(201);

    const scope = `project:${p.projectId}`;
    const snap = await pullAll(p.site.c, scope, undefined, 3);
    const types = snap.changes.map((c) => c.entityType);
    expect(types[0]).toBe('Project');
    expect(types.filter((x) => x === 'ProjectMember').length).toBeGreaterThanOrEqual(6);
    const doc = snap.changes.find((c) => c.entityType === 'Document')!;
    expect(doc.data).toMatchObject({ number: d.number, currentRevisionId: rev.id });
    const r = snap.changes.find((c) => c.entityType === 'DocumentRevision')!;
    expect(r.data).toMatchObject({ revLabel: 'A', status: 'DRAFT' });
    expect(r.data!.files).toEqual([
      expect.objectContaining({ role: 'PDF_RENDITION', fileId: pdf, mimeType: 'application/pdf' }),
    ]);

    const fresh = (await p.dc.c.get(`/api/v1/documents/${d.id}`).expect(200)).body;
    await p.dc.c
      .patch(`/api/v1/documents/${d.id}`)
      .send({ version: fresh.version, title: 'ผังท่อน้ำดิบ (แก้ไข)' })
      .expect(200);
    const delta = await pullAll(p.site.c, scope, snap.cursor);
    expect(delta.changes).toEqual([
      expect.objectContaining({
        entityType: 'Document',
        op: 'UPSERT',
        id: d.id,
        data: expect.objectContaining({ title: 'ผังท่อน้ำดิบ (แก้ไข)' }),
      }),
    ]);

    // the stamped download reports the sha256 of the served bytes (offline pin check, §6)
    const dl = (await p.site.c.get(`/api/v1/revisions/${rev.id}/download`).expect(200)).body;
    const bytes = Buffer.from(await (await fetch(dl.url)).arrayBuffer());
    expect(dl.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const cached = (await p.site.c.get(`/api/v1/revisions/${rev.id}/download`).expect(200)).body;
    expect(cached.sha256).toBe(dl.sha256);
  });

  it('user scope: my open review step appears, and leaves (DELETE) once decided', async () => {
    const dca = p.templates.find((x) => x.code === 'DRAW_CHECK_APPROVE')!;
    const d = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/documents`)
        .send({
          title: 'แบบถังตกตะกอน',
          disciplineId: p.disciplines.PR,
          documentTypeId: p.types.DWG,
          ownerId: p.author.id,
        })
        .expect(201)
    ).body;
    const rev = (
      await p.author.c
        .post(`/api/v1/documents/${d.id}/revisions`)
        .send({ purposeCode: 'FA' })
        .expect(201)
    ).body;
    const pdf = await uploadPdf(t, p.author.c);
    let r = (
      await p.author.c
        .post(`/api/v1/revisions/${rev.id}/files`)
        .send({ fileId: pdf, role: 'PDF_RENDITION' })
        .expect(201)
    ).body;
    const scope = `user:${p.checker.id}`;
    const before = await pullAll(p.checker.c, scope);
    r = (
      await p.author.c
        .post(`/api/v1/revisions/${rev.id}/submit`)
        .send({
          version: r.version,
          steps: stepsFor(dca, { CHECK: [p.checker.id], APPROVE: [p.approver.id] }),
        })
        .expect(200)
    ).body;
    const check = r.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');
    const assigned = await pullAll(p.checker.c, scope, before.cursor);
    expect(assigned.changes).toEqual([
      expect.objectContaining({
        entityType: 'ReviewStep',
        op: 'UPSERT',
        id: check.id,
        data: expect.objectContaining({
          documentNumber: d.number,
          revLabel: 'A',
          status: 'ACTIVE',
          projectId: p.projectId,
        }),
      }),
    ]);
    const snap = await pullAll(p.checker.c, scope);
    expect(snap.changes.map((c) => c.id)).toContain(check.id);

    await p.checker.c
      .post(`/api/v1/review-steps/${check.id}/decision`)
      .send({ version: check.version, decision: 'APPROVED' })
      .expect(200);
    const decided = await pullAll(p.checker.c, scope, assigned.cursor);
    expect(decided.changes).toEqual([{ entityType: 'ReviewStep', op: 'DELETE', id: check.id }]);
  });

  it('SYNC_SCOPE_FORBIDDEN, SYNC_CURSOR_EXPIRED and malformed input', async () => {
    const outsider = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email,
    );
    const forbidden = await outsider
      .get(`/api/v1/sync/pull?scope=project:${p.projectId}`)
      .expect(403);
    expect(forbidden.body.code).toBe('SYNC_SCOPE_FORBIDDEN');
    await outsider.get(`/api/v1/sync/pull?scope=user:${p.checker.id}`).expect(403);
    await outsider.get('/api/v1/sync/pull?scope=trip:x').expect(400);
    await outsider.get('/api/v1/sync/pull?scope=global&cursor=nope').expect(400);
    const old = encodeCursor({ mode: 'changes', seq: 1n, issuedAt: 0 });
    const expired = await outsider.get(`/api/v1/sync/pull?scope=global&cursor=${old}`).expect(410);
    expect(expired.body.code).toBe('SYNC_CURSOR_EXPIRED');

    // a member who is removed loses the scope
    const removed = await pullAll(p.site.c, `project:${p.projectId}`);
    await p.pm.c.delete(`/api/v1/projects/${p.projectId}/members/${p.site.id}`).expect(204);
    await p.site.c
      .get(`/api/v1/sync/pull?scope=project:${p.projectId}&cursor=${removed.cursor}`)
      .expect(403);
  });
});
