import { uuidv7 } from '../src/common/ids/uuid';
import { makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin, type BearerClient } from './utils/http';

describe('P1-01 clients and sites (M02)', () => {
  let t: TestApp;
  let sales: BearerClient;
  let drafter: BearerClient;

  beforeAll(async () => {
    t = await createTestApp();
    sales = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['SALES_ADMIN'] })).email);
    drafter = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['DRAFTER'] })).email);
  });
  afterAll(() => t.close());

  const uniqueTaxId = () => {
    const base = String(Date.now()).slice(-12).padStart(12, '0');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(base[i]) * (13 - i);
    return base + String((11 - (sum % 11)) % 10);
  };

  it('creates a client with a proposed code; permissions apply (BR-CRM-001)', async () => {
    const res = await sales
      .post('/api/v1/clients')
      .send({ nameTh: 'บริษัท สยามวอเตอร์ซัพพลาย จำกัด', nameEn: 'Siam Water Supply Co., Ltd.' })
      .expect(201);
    expect(res.body.code).toMatch(/^SWS(-\d+)?$/);
    expect(res.body.allowedActions).toEqual(expect.arrayContaining(['edit', 'delete']));
    expect(res.body.warnings).toEqual([]);
    // DRAFTER has no client.read
    await drafter.get('/api/v1/clients').expect(403);
    // code cannot be changed later (not part of the update DTO)
    const upd = await sales
      .patch(`/api/v1/clients/${res.body.id}`)
      .send({ version: res.body.version, code: 'NEW' })
      .expect(400);
    expect(upd.body.code).toBe('VALIDATION_FAILED');
  });

  it('AT-CRM-01 BR-CRM-002 tax id with a wrong checksum → 400 on taxId', async () => {
    const res = await sales
      .post('/api/v1/clients')
      .send({ nameTh: 'ลูกค้าเลขภาษีผิด', taxId: '0105536092642' })
      .expect(400);
    expect(res.body.rule).toBe('BR-CRM-002');
    expect(res.body.errors).toEqual([{ field: 'taxId', code: 'TAX_ID_CHECKSUM' }]);
  });

  it('BR-CRM-002 duplicate tax id + branch is a warning, not an error', async () => {
    const taxId = uniqueTaxId();
    const a = await sales
      .post('/api/v1/clients')
      .send({ nameTh: 'ลูกค้า A', taxId, branchCode: '00000' })
      .expect(201);
    const b = await sales
      .post('/api/v1/clients')
      .send({ nameTh: 'ลูกค้า B', taxId, branchCode: '00000' })
      .expect(201);
    expect(b.body.warnings).toEqual([{ code: 'CLIENT_TAX_ID_EXISTS', clients: [a.body.code] }]);
  });

  it('AT-CRM-02 BR-CRM-003 deleting a client with a project → 409 CLIENT_IN_USE; deactivate instead', async () => {
    const c = await sales.post('/api/v1/clients').send({ nameTh: 'ลูกค้ามีโครงการ' }).expect(201);
    await t.prisma.project.create({
      data: {
        id: uuidv7(),
        code: `PT-${Date.now()}`,
        name: 'โครงการทดสอบ',
        clientId: c.body.id,
        type: 'DESIGN',
      },
    });
    const detail = await sales.get(`/api/v1/clients/${c.body.id}`).expect(200);
    expect(detail.body.blockedActions).toEqual([{ action: 'delete', code: 'CLIENT_IN_USE' }]);
    expect(detail.body.allowedActions).toContain('deactivate');
    expect(detail.body.openProjectCount).toBe(1);
    const del = await sales
      .delete(`/api/v1/clients/${c.body.id}?version=${detail.body.version}`)
      .expect(409);
    expect(del.body.code).toBe('CLIENT_IN_USE');
    const off = await sales
      .patch(`/api/v1/clients/${c.body.id}`)
      .send({ version: detail.body.version, isActive: false })
      .expect(200);
    expect(off.body.isActive).toBe(false);
    const list = await sales.get('/api/v1/clients?isActive=false&q=ลูกค้ามีโครงการ').expect(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(c.body.id);
    const summary = await sales.get(`/api/v1/clients/${c.body.id}/summary`).expect(200);
    expect(summary.body).toMatchObject({ projectCount: 1, openProjectCount: 1 });
  });

  it('deletes an unused client; stale version → 409', async () => {
    const c = await sales.post('/api/v1/clients').send({ nameTh: 'ลูกค้าลบได้' }).expect(201);
    await sales
      .patch(`/api/v1/clients/${c.body.id}`)
      .send({ version: 1, phone: '02-000-0000' })
      .expect(200);
    const stale = await sales
      .patch(`/api/v1/clients/${c.body.id}`)
      .send({ version: 1, phone: '02-111-1111' })
      .expect(409);
    expect(stale.body.code).toBe('CONFLICT_STALE_VERSION');
    await sales.delete(`/api/v1/clients/${c.body.id}?version=2`).expect(204);
    await sales.get(`/api/v1/clients/${c.body.id}`).expect(404);
  });

  it('BR-CRM-004 one primary contact; BR-CRM-007 anonymize', async () => {
    const c = await sales.post('/api/v1/clients').send({ nameTh: 'ลูกค้าผู้ติดต่อ' }).expect(201);
    const a = await sales
      .post(`/api/v1/clients/${c.body.id}/contacts`)
      .send({ name: 'คุณเอ', email: 'a@client.co.th', isPrimary: true })
      .expect(201);
    await sales
      .post(`/api/v1/clients/${c.body.id}/contacts`)
      .send({ name: 'คุณบี', email: 'b@client.co.th', isPrimary: true })
      .expect(201);
    const list = await sales.get(`/api/v1/clients/${c.body.id}/contacts`).expect(200);
    expect(list.body.filter((x: { isPrimary: boolean }) => x.isPrimary)).toHaveLength(1);
    expect(list.body[0].name).toBe('คุณบี');

    await sales.post(`/api/v1/contacts/${a.body.id}/anonymize`).expect(403);
    const admin = await bearerLogin(t.app, (await makeUser(t.prisma, { roles: ['ADMIN'] })).email);
    const anon = await admin.post(`/api/v1/contacts/${a.body.id}/anonymize`).expect(200);
    expect(anon.body).toMatchObject({ name: '', email: null, isAnonymized: true, isActive: false });
    const audit = await t.prisma.auditLog.findFirst({
      where: { entityId: a.body.id, action: 'client.contact.anonymize' },
    });
    expect(audit?.changes).toBeNull();
  });

  it('AT-CRM-03 BR-CRM-006 a class B building proposes BLD-2548-B; BR-CRM-005 rules', async () => {
    const c = await sales.post('/api/v1/clients').send({ nameTh: 'ลูกค้าอาคาร' }).expect(201);
    const site = await sales
      .post(`/api/v1/clients/${c.body.id}/sites`)
      .send({
        code: 'hq',
        name: 'อาคารสำนักงานใหญ่',
        siteType: 'BUILDING',
        buildingClass: 'B',
        latitude: 13.7563,
        longitude: 100.5018,
      })
      .expect(201);
    expect(site.body).toMatchObject({
      code: 'HQ',
      defaultStandard: { code: 'BLD-2548-B' },
      latitude: '13.7563',
    });
    const dup = await sales
      .post(`/api/v1/clients/${c.body.id}/sites`)
      .send({ code: 'HQ', name: 'ซ้ำ', siteType: 'OTHER' })
      .expect(409);
    expect(dup.body.rule).toBe('BR-CRM-005');
    const bad = await sales
      .post(`/api/v1/clients/${c.body.id}/sites`)
      .send({ code: 'F1', name: 'โรงงาน', siteType: 'FACTORY', buildingClass: 'A' })
      .expect(400);
    expect(bad.body.errors).toEqual([{ field: 'buildingClass', code: 'ONLY_FOR_BUILDING' }]);
    // changing the class re-proposes only while no standard is set; explicit null clears it
    const cleared = await sales
      .patch(`/api/v1/clients/${c.body.id}/sites/${site.body.id}`)
      .send({ version: site.body.version, defaultStandardId: null })
      .expect(200);
    expect(cleared.body.defaultStandard).toBeNull();
    const reclass = await sales
      .patch(`/api/v1/clients/${c.body.id}/sites/${site.body.id}`)
      .send({ version: cleared.body.version, buildingClass: 'C' })
      .expect(200);
    expect(reclass.body.defaultStandard.code).toBe('BLD-2548-C');
    await sales
      .delete(`/api/v1/clients/${c.body.id}/sites/${site.body.id}?version=${reclass.body.version}`)
      .expect(204);
  });
});
