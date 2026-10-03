import { uuidv7 } from '../src/common/ids/uuid';
import { makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin, type BearerClient } from './utils/http';

describe('P1-02 projects and teams (M03)', () => {
  let t: TestApp;
  let pmUser: { id: string; email: string };
  let pm: BearerClient;
  let clientId: string;

  beforeAll(async () => {
    t = await createTestApp();
    pmUser = await makeUser(t.prisma, { roles: ['PROJECT_MANAGER'] });
    pm = await bearerLogin(t.app, pmUser.email);
    const c = await pm
      .post('/api/v1/clients')
      .send({ nameTh: 'ลูกค้าโครงการ', nameEn: 'Project Client' })
      .expect(201);
    clientId = c.body.id;
  });
  afterAll(() => t.close());

  async function newProject(body: Record<string, unknown> = {}) {
    const res = await pm
      .post('/api/v1/projects')
      .send({ name: 'ระบบบำบัดน้ำเสีย', type: 'DESIGN', clientId, ...body })
      .expect(201);
    return res.body as {
      id: string;
      code: string;
      version: number;
      status: string;
      allowedActions: string[];
    };
  }

  it('AT-PRJ-01 BR-PRJ-001/002 a PM creates a project → P<YY>-<seq> code, creator is PROJECT_MANAGER', async () => {
    const yy = String(new Date().getUTCFullYear()).slice(2);
    const p = await newProject({
      contractValue: '12500000.50',
      plannedStartDate: '2026-10-01',
      plannedEndDate: '2027-03-31',
    });
    expect(p.code).toMatch(new RegExp(`^P${yy}-\\d{3}$`));
    expect(p).toMatchObject({
      status: 'PLANNING',
      myRole: 'PROJECT_MANAGER',
      projectManager: { id: pmUser.id },
      contractValue: '12500000.5',
      plannedEndDate: '2027-03-31',
      memberCount: 1,
    });
    expect(p.allowedActions).toEqual(
      expect.arrayContaining(['edit', 'start', 'cancel', 'manageMembers', 'createDocument']),
    );
    const members = await pm.get(`/api/v1/projects/${p.id}/members`).expect(200);
    expect(members.body).toEqual([
      expect.objectContaining({
        userId: pmUser.id,
        role: 'PROJECT_MANAGER',
        isProjectManager: true,
      }),
    ]);
    const next = await newProject();
    expect(Number(next.code.slice(-3))).toBe(Number(p.code.slice(-3)) + 1);
    const audit = await t.prisma.auditLog.findFirst({
      where: { entityId: p.id, action: 'project.create' },
    });
    expect(audit?.projectId).toBe(p.id);
    expect(
      await t.prisma.changeLog.count({ where: { scopeKey: `project:${p.id}` } }),
    ).toBeGreaterThan(0);
  });

  it('AT-PRJ-04 a non-member does not see the project (list and 404)', async () => {
    const p = await newProject();
    const outsider = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email,
    );
    const list = await outsider.get('/api/v1/projects?pageSize=100').expect(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).not.toContain(p.id);
    await outsider.get(`/api/v1/projects/${p.id}`).expect(404);
    // project.read_all sees it without membership
    const dc = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['DOCUMENT_CONTROLLER'] })).email,
    );
    await dc.get(`/api/v1/projects/${p.id}`).expect(200);
    const mine = await dc.get('/api/v1/projects?mine=true&pageSize=100').expect(200);
    expect(mine.body.data.map((x: { id: string }) => x.id)).not.toContain(p.id);
  });

  it('BR-PRJ-010 members: add (notification), change role, the PM role is protected; non-managers get 403', async () => {
    const p = await newProject();
    const eng = await makeUser(t.prisma, { roles: ['ENGINEER'] });
    const added = await pm
      .post(`/api/v1/projects/${p.id}/members`)
      .send({ userId: eng.id, role: 'ENGINEER' })
      .expect(201);
    expect(added.body).toHaveLength(2);
    const dup = await pm
      .post(`/api/v1/projects/${p.id}/members`)
      .send({ userId: eng.id, role: 'ENGINEER' })
      .expect(409);
    expect(dup.body.code).toBe('DUPLICATE');
    expect(
      await t.prisma.outboxEvent.count({
        where: { type: 'project.member_added', aggregateId: p.id },
      }),
    ).toBe(1);

    const engClient = await bearerLogin(t.app, eng.email);
    await engClient.get(`/api/v1/projects/${p.id}`).expect(200);
    const forbidden = await engClient
      .post(`/api/v1/projects/${p.id}/members`)
      .send({ userId: pmUser.id, role: 'VIEWER' })
      .expect(403);
    expect(forbidden.body.rule).toBe('BR-PRJ-010');

    await pm
      .patch(`/api/v1/projects/${p.id}/members/${eng.id}`)
      .send({ role: 'DESIGN_MANAGER' })
      .expect(200);
    const pmDemote = await pm
      .patch(`/api/v1/projects/${p.id}/members/${pmUser.id}`)
      .send({ role: 'ENGINEER' })
      .expect(422);
    expect(pmDemote.body.code).toBe('PROJECT_MANAGER_REQUIRED');
    await pm.delete(`/api/v1/projects/${p.id}/members/${eng.id}`).expect(204);
    await engClient.get(`/api/v1/projects/${p.id}`).expect(404);
    // re-adding a removed member reactivates the row
    await pm
      .post(`/api/v1/projects/${p.id}/members`)
      .send({ userId: eng.id, role: 'VIEWER' })
      .expect(201);
  });

  it('AT-PRJ-02 BR-PRJ-003 removing a member with an ACTIVE review step → 409 MEMBER_HAS_PENDING_REVIEWS', async () => {
    const p = await newProject();
    const eng = await makeUser(t.prisma, { roles: ['ENGINEER'] });
    await pm
      .post(`/api/v1/projects/${p.id}/members`)
      .send({ userId: eng.id, role: 'ENGINEER' })
      .expect(201);
    const discipline = await t.prisma.discipline.findFirstOrThrow();
    const type = await t.prisma.documentType.findFirstOrThrow();
    const docId = uuidv7();
    const revId = uuidv7();
    await t.prisma.document.create({
      data: {
        id: docId,
        projectId: p.id,
        number: `T-${docId}`,
        title: 'แบบทดสอบ',
        disciplineId: discipline.id,
        documentTypeId: type.id,
      },
    });
    await t.prisma.documentRevision.create({
      data: {
        id: revId,
        documentId: docId,
        revLabel: 'A',
        revIndex: 1,
        purposeCode: 'FA',
        status: 'IN_REVIEW',
        preparedById: pmUser.id,
      },
    });
    await t.prisma.reviewCycle.create({
      data: {
        revisionId: revId,
        cycleNo: 1,
        submittedById: pmUser.id,
        steps: {
          create: {
            stepOrder: 1,
            kind: 'CHECK',
            name: 'ตรวจสอบ',
            assigneeId: eng.id,
            status: 'ACTIVE',
          },
        },
      },
    });
    const res = await pm.delete(`/api/v1/projects/${p.id}/members/${eng.id}`).expect(409);
    expect(res.body).toMatchObject({ code: 'MEMBER_HAS_PENDING_REVIEWS', rule: 'BR-PRJ-003' });
    // BR-PRJ-004 revision scheme locked once revisions exist; BR-PRJ-001 code locked once documents exist
    const cur = await pm.get(`/api/v1/projects/${p.id}`).expect(200);
    const scheme = await pm
      .patch(`/api/v1/projects/${p.id}`)
      .send({ version: cur.body.version, revisionScheme: 'ISO19650' })
      .expect(409);
    expect(scheme.body.code).toBe('PROJECT_SCHEME_LOCKED');
    const overview = await pm.get(`/api/v1/projects/${p.id}/overview`).expect(200);
    expect(overview.body).toMatchObject({ documentCount: 1, activeReviewSteps: 1 });
    expect(overview.body.documentsByStatus).toEqual([{ status: 'ACTIVE', count: 1 }]);
  });

  it('BR-PRJ-020 status actions follow the state machine; reopen/cancel need a reason', async () => {
    let p = await newProject();
    const bad = await pm
      .post(`/api/v1/projects/${p.id}/complete`)
      .send({ version: p.version })
      .expect(409);
    expect(bad.body.code).toBe('INVALID_STATE_TRANSITION');
    p = (await pm.post(`/api/v1/projects/${p.id}/start`).send({ version: p.version }).expect(200))
      .body;
    expect(p).toMatchObject({
      status: 'ACTIVE',
      actualStartDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    const stale = await pm
      .post(`/api/v1/projects/${p.id}/hold`)
      .send({ version: p.version - 1 })
      .expect(409);
    expect(stale.body.code).toBe('CONFLICT_STALE_VERSION');
    p = (await pm.post(`/api/v1/projects/${p.id}/hold`).send({ version: p.version }).expect(200))
      .body;
    expect(p.allowedActions).not.toContain('createDocument');
    p = (await pm.post(`/api/v1/projects/${p.id}/resume`).send({ version: p.version }).expect(200))
      .body;
    p = (
      await pm.post(`/api/v1/projects/${p.id}/complete`).send({ version: p.version }).expect(200)
    ).body;
    p = (await pm.post(`/api/v1/projects/${p.id}/close`).send({ version: p.version }).expect(200))
      .body;
    expect(p.status).toBe('CLOSED');
    // CLOSED is read-only, reopen is ADMIN only and needs a reason
    const ro = await pm
      .patch(`/api/v1/projects/${p.id}`)
      .send({ version: p.version, name: 'x' })
      .expect(409);
    expect(ro.body.code).toBe('PROJECT_READ_ONLY');
    await pm
      .post(`/api/v1/projects/${p.id}/reopen`)
      .send({ version: p.version, reason: 'ลูกค้าขอแก้แบบ' })
      .expect(403);
    const admin = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['ADMIN'] })).email);
    const noReason = await admin
      .post(`/api/v1/projects/${p.id}/reopen`)
      .send({ version: p.version })
      .expect(400);
    expect(noReason.body.errors).toEqual([{ field: 'reason', code: 'REQUIRED' }]);
    p = (
      await admin
        .post(`/api/v1/projects/${p.id}/reopen`)
        .send({ version: p.version, reason: 'ลูกค้าขอแก้แบบ' })
        .expect(200)
    ).body;
    expect(p.status).toBe('ACTIVE');
    const audit = await t.prisma.auditLog.findFirst({
      where: { entityId: p.id, action: 'project.reopen' },
    });
    expect(audit?.reason).toBe('ลูกค้าขอแก้แบบ');
  });

  it('AT-PRJ-03 BR-PRJ-021 closing with a DRAFT transmittal → 409 PROJECT_HAS_OPEN_ITEMS with the list', async () => {
    let p = await newProject();
    p = (await pm.post(`/api/v1/projects/${p.id}/start`).send({ version: p.version }).expect(200))
      .body;
    p = (
      await pm.post(`/api/v1/projects/${p.id}/complete`).send({ version: p.version }).expect(200)
    ).body;
    await t.prisma.transmittal.create({
      data: {
        projectId: p.id,
        number: `TR-${p.code}-001`,
        subject: 'ส่งแบบ',
        recipientName: 'ลูกค้า',
        purposeCode: 'FI',
        deliveryMethod: 'EMAIL_LINK',
      },
    });
    const detail = await pm.get(`/api/v1/projects/${p.id}`).expect(200);
    expect(detail.body.blockedActions).toContainEqual({
      action: 'close',
      code: 'PROJECT_HAS_OPEN_ITEMS',
    });
    const res = await pm
      .post(`/api/v1/projects/${p.id}/close`)
      .send({ version: p.version })
      .expect(409);
    expect(res.body).toMatchObject({
      code: 'PROJECT_HAS_OPEN_ITEMS',
      items: [{ kind: 'TRANSMITTAL', label: `TR-${p.code}-001` }],
    });
  });

  it('project numbering override and an inactive client cannot be used', async () => {
    const p = await newProject();
    const def = await pm.get(`/api/v1/projects/${p.id}/numbering-scheme`).expect(200);
    expect(def.body).toMatchObject({ isOverride: false, example: `${p.code}-PR-DWG-001` });
    const bad = await pm
      .put(`/api/v1/projects/${p.id}/numbering-scheme`)
      .send({ pattern: 'X-{FOO}' })
      .expect(422);
    expect(bad.body.code).toBe('NUMBERING_PATTERN_INVALID');
    const own = await pm
      .put(`/api/v1/projects/${p.id}/numbering-scheme`)
      .send({ pattern: '{PROJECT}-{DISCIPLINE}{SEQ:4}' })
      .expect(200);
    expect(own.body).toMatchObject({ isOverride: true, example: `${p.code}-PR0001` });
    const reset = await pm
      .put(`/api/v1/projects/${p.id}/numbering-scheme`)
      .send({ pattern: null })
      .expect(200);
    expect(reset.body.isOverride).toBe(false);

    const c = await pm.post('/api/v1/clients').send({ nameTh: 'ลูกค้าปิด' }).expect(201);
    await pm
      .patch(`/api/v1/clients/${c.body.id}`)
      .send({ version: c.body.version, isActive: false })
      .expect(200);
    const res = await pm
      .post('/api/v1/projects')
      .send({ name: 'x', type: 'DESIGN', clientId: c.body.id })
      .expect(422);
    expect(res.body.code).toBe('CLIENT_INACTIVE');
  });
});
