import { makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin } from './utils/http';

describe('P1-03 document master data', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('everyone reads active master data; masterdata.manage maintains it', async () => {
    const eng = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email);
    const dc = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['DOCUMENT_CONTROLLER'] })).email,
    );
    const disciplines = await eng.get('/api/v1/disciplines').expect(200);
    expect(disciplines.body.map((d: { code: string }) => d.code)).toContain('PR');
    const types = await eng.get('/api/v1/document-types').expect(200);
    const dwg = types.body.find((x: { code: string }) => x.code === 'DWG');
    expect(dwg).toMatchObject({ requiresPdfRendition: true, requiresLicensedApprover: true });
    const templates = await eng.get('/api/v1/workflow-templates').expect(200);
    const dca = templates.body.find((x: { code: string }) => x.code === 'DRAW_CHECK_APPROVE');
    expect(dca.steps.map((s: { kind: string }) => s.kind)).toEqual(['CHECK', 'APPROVE']);
    expect(dwg.defaultWorkflowTemplateId).toBe(dca.id);

    await eng
      .post('/api/v1/disciplines')
      .send({ code: 'XX', nameTh: 'x', nameEn: 'x' })
      .expect(403);
    const created = await dc
      .post('/api/v1/disciplines')
      .send({ code: 'hy', nameTh: 'อุทกวิทยา', nameEn: 'Hydrology', sortOrder: 99 })
      .expect(201);
    expect(created.body.code).toBe('HY');
    await dc.post('/api/v1/disciplines').send({ code: 'HY', nameTh: 'x', nameEn: 'x' }).expect(409);
    await dc.patch(`/api/v1/disciplines/${created.body.id}`).send({ isActive: false }).expect(200);
    const after = await eng.get('/api/v1/disciplines').expect(200);
    expect(after.body.map((d: { code: string }) => d.code)).not.toContain('HY');
    const all = await dc.get('/api/v1/disciplines?includeInactive=true').expect(200);
    expect(all.body.map((d: { code: string }) => d.code)).toContain('HY');
    expect(
      await t.prisma.changeLog.count({ where: { scopeKey: 'global', entityId: created.body.id } }),
    ).toBe(2);
  });

  it('BR-DOC-031 templates: parallel groups, no gaps, a mandatory APPROVE step', async () => {
    const dc = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['DOCUMENT_CONTROLLER'] })).email,
    );
    const bad = await dc
      .post('/api/v1/workflow-templates')
      .send({
        code: 'BAD_GAP',
        name: 'x',
        steps: [
          { stepOrder: 1, kind: 'CHECK', name: 'a' },
          { stepOrder: 3, kind: 'APPROVE', name: 'b' },
        ],
      })
      .expect(400);
    expect(bad.body.errors).toEqual([{ field: 'steps', code: 'STEP_ORDER_GAP' }]);
    const ok = await dc
      .post('/api/v1/workflow-templates')
      .send({
        code: 'two_checks',
        name: 'ตรวจสองสาขาพร้อมกัน → อนุมัติ',
        steps: [
          { stepOrder: 1, kind: 'CHECK', name: 'โยธา', allowedProjectRoles: ['ENGINEER'] },
          { stepOrder: 1, kind: 'CHECK', name: 'ไฟฟ้า', allowedProjectRoles: ['ENGINEER'] },
          { stepOrder: 2, kind: 'APPROVE', name: 'อนุมัติ', requiresSignature: true },
        ],
      })
      .expect(201);
    expect(ok.body.code).toBe('TWO_CHECKS');
    expect(ok.body.steps.filter((s: { stepOrder: number }) => s.stepOrder === 1)).toHaveLength(2);
    const upd = await dc
      .patch(`/api/v1/workflow-templates/${ok.body.id}`)
      .send({ steps: [{ stepOrder: 1, kind: 'APPROVE', name: 'อนุมัติเท่านั้น', dueDays: 1 }] })
      .expect(200);
    expect(upd.body.steps).toHaveLength(1);
  });
});
