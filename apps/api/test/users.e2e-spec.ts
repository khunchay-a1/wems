import { DEFAULT_PASSWORD, makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin } from './utils/http';

describe('P0-06 users, roles and licenses', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  async function admin() {
    const u = await makeUser(t.prisma, { roles: ['ADMIN'] });
    return { user: u, c: await bearerLogin(t.app, u.email) };
  }

  it('admin creates a user with a temporary password; the user must change it first', async () => {
    const { c } = await admin();
    const created = await c
      .post('/api/v1/users')
      .send({
        email: '  New.Engineer@Company.co.th ',
        displayNameTh: 'วิศวกร ใหม่',
        roleCodes: ['ENGINEER'],
      })
      .expect(201);
    expect(created.body.user).toMatchObject({
      email: 'new.engineer@company.co.th',
      roles: ['ENGINEER'],
      mustChangePassword: true,
    });
    expect(created.body.temporaryPassword).toHaveLength(16);
    const nu = await bearerLogin(
      t.app,
      'new.engineer@company.co.th',
      created.body.temporaryPassword,
    );
    await nu.get('/api/v1/users/directory').expect(403);
    await nu
      .post('/api/v1/auth/change-password')
      .send({
        currentPassword: created.body.temporaryPassword,
        newPassword: 'ถังเติมอากาศ-ใหม่-2569',
      })
      .expect(204);
    await nu.get('/api/v1/users/directory').expect(200);
    // BR-PLT-001 duplicate email (case-insensitive)
    const dup = await c
      .post('/api/v1/users')
      .send({ email: 'NEW.ENGINEER@company.co.th', displayNameTh: 'x', roleCodes: [] })
      .expect(409);
    expect(dup.body.code).toBe('DUPLICATE');
  });

  it('non-admins cannot manage users (403) but can read the directory', async () => {
    const u = await makeUser(t.prisma, { roles: ['ENGINEER'] });
    const c = await bearerLogin(t.app, u.email);
    await c.get('/api/v1/users').expect(403);
    const dir = await c.get('/api/v1/users/directory').expect(200);
    expect(dir.body[0]).not.toHaveProperty('email');
  });

  it('AT-PLT-03 removing ADMIN from the last admin → 422 LAST_ADMIN', async () => {
    await t.prisma.userRole.deleteMany({ where: { role: { code: 'ADMIN' } } });
    const { user, c } = await admin();
    const detail = await c.get(`/api/v1/users/${user.id}`).expect(200);
    const res = await c
      .patch(`/api/v1/users/${user.id}`)
      .send({ version: detail.body.version, roleCodes: ['ENGINEER'] })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'LAST_ADMIN', rule: 'BR-PLT-002' });
    const res2 = await c
      .patch(`/api/v1/users/${user.id}`)
      .send({ version: detail.body.version, isActive: false })
      .expect(422);
    expect(res2.body.code).toBe('LAST_ADMIN');
    // with a second admin it is allowed
    const other = await makeUser(t.prisma, { roles: ['ADMIN'] });
    const d2 = await c.get(`/api/v1/users/${other.id}`).expect(200);
    await c
      .patch(`/api/v1/users/${other.id}`)
      .send({ version: d2.body.version, roleCodes: ['EXECUTIVE'] })
      .expect(200);
  });

  it('AT-PLT-06 removing a permission from a role applies on the very next request', async () => {
    const { c } = await admin();
    const role = await c
      .post('/api/v1/roles')
      .send({ code: 'HR_CLERK', nameTh: 'ธุรการบุคคล', permissions: ['user.manage'] })
      .expect(201);
    const clerk = await makeUser(t.prisma, { roles: ['HR_CLERK'] });
    const cc = await bearerLogin(t.app, clerk.email);
    await cc.get('/api/v1/users').expect(200);
    await c.patch(`/api/v1/roles/${role.body.id}`).send({ permissions: [] }).expect(200);
    await cc.get('/api/v1/users').expect(403);
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'role.update_permissions', entityId: role.body.id },
    });
    expect(audit?.changes).toMatchObject({
      before: { permissions: ['user.manage'] },
      after: { permissions: [] },
    });
  });

  it('BR-PLT-003 system roles cannot be deleted; ADMIN keeps user/role management', async () => {
    const { c } = await admin();
    const roles = await c.get('/api/v1/roles').expect(200);
    const adminRole = roles.body.find((r: { code: string }) => r.code === 'ADMIN');
    await c
      .delete(`/api/v1/roles/${adminRole.id}`)
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('ROLE_IS_SYSTEM'));
    await c
      .patch(`/api/v1/roles/${adminRole.id}`)
      .send({ permissions: ['audit.read'] })
      .expect(400);
    const perms = await c.get('/api/v1/permissions').expect(200);
    expect(perms.body).toHaveLength(48);
  });

  it('optimistic locking on users → 409 CONFLICT_STALE_VERSION', async () => {
    const { c } = await admin();
    const u = await makeUser(t.prisma, { roles: ['DRAFTER'] });
    await c
      .patch(`/api/v1/users/${u.id}`)
      .send({ version: 1, position: 'ช่างเขียนแบบอาวุโส' })
      .expect(200);
    const res = await c
      .patch(`/api/v1/users/${u.id}`)
      .send({ version: 1, position: 'x' })
      .expect(409);
    expect(res.body.code).toBe('CONFLICT_STALE_VERSION');
    expect(res.body.current.version).toBe(2);
  });

  it('deactivating a user revokes their sessions (BR-PLT-001)', async () => {
    const { c } = await admin();
    const u = await makeUser(t.prisma, { roles: ['DRAFTER'] });
    const uc = await bearerLogin(t.app, u.email);
    await c.patch(`/api/v1/users/${u.id}`).send({ version: 1, isActive: false }).expect(200);
    await uc.get('/api/v1/auth/me').expect(401);
    const sessions = await t.prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions.every((s) => s.revokedReason === 'deactivated')).toBe(true);
  });

  it('reset password and unlock', async () => {
    const { c } = await admin();
    const u = await makeUser(t.prisma);
    await t.prisma.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date('2099-01-01'), failedLoginCount: 3 },
    });
    await c.post(`/api/v1/users/${u.id}/unlock`).expect(204);
    await bearerLogin(t.app, u.email, DEFAULT_PASSWORD);
    const reset = await c.post(`/api/v1/users/${u.id}/reset-password`).expect(200);
    const login = await bearerLogin(t.app, u.email, reset.body.temporaryPassword);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('BR-PLT-004 self-added licenses are unverified until a manager verifies them', async () => {
    const { c } = await admin();
    const eng = await makeUser(t.prisma, { roles: ['ENGINEER'] });
    const ec = await bearerLogin(t.app, eng.email);
    const lic = await ec
      .post(`/api/v1/users/${eng.id}/licenses`)
      .send({
        type: 'ENGINEER',
        branch: 'CIVIL',
        level: 'PROFESSIONAL',
        licenseNo: 'สย.12345',
        expiresAt: '2030-12-31',
      })
      .expect(201);
    expect(lic.body).toMatchObject({ verifiedAt: null, isExpired: false });
    const stranger = await bearerLogin(t.app, (await makeUser(t.prisma)).email);
    await stranger.get(`/api/v1/users/${eng.id}/licenses`).expect(404);
    const verified = await c.post(`/api/v1/licenses/${lic.body.id}/verify`).expect(200);
    expect(verified.body.verifiedAt).toBeTruthy();
    expect(verified.body.verifiedBy.id).toBeTruthy();
    // a material self-edit resets verification
    const edited = await ec
      .patch(`/api/v1/users/${eng.id}/licenses/${lic.body.id}`)
      .send({ expiresAt: '2031-12-31' })
      .expect(200);
    expect(edited.body.verifiedAt).toBeNull();
  });

  it('own profile update and departments', async () => {
    const { c } = await admin();
    const dept = await c
      .post('/api/v1/departments')
      .send({ code: 'DES', nameTh: 'ฝ่ายออกแบบ' })
      .expect(201);
    const u = await makeUser(t.prisma);
    const uc = await bearerLogin(t.app, u.email);
    const me = await uc
      .patch('/api/v1/users/me')
      .send({ version: 1, phone: '081-234-5678', calendar: 'GREGORIAN' })
      .expect(200);
    expect(me.body).toMatchObject({ phone: '081-234-5678', calendar: 'GREGORIAN', version: 2 });
    await uc.patch('/api/v1/users/me').send({ version: 2, departmentId: dept.body.id }).expect(400);
    const list = await c.get('/api/v1/users?q=081&pageSize=5').expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 5 });
  });
});
