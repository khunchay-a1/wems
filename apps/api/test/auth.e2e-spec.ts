import request from 'supertest';
import { totp } from '../src/common/crypto/totp';
import { DEFAULT_PASSWORD, makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin, cookieLogin } from './utils/http';

describe('P0-05 authentication', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  const http = () => request(t.app.getHttpServer());

  it('bearer login returns tokens and /auth/me with permissions', async () => {
    const u = await makeUser(t.prisma, { roles: ['ENGINEER'] });
    const c = await bearerLogin(t.app, u.email);
    expect(c.body).toMatchObject({ mfaRequired: false, expiresIn: 900 });
    expect(c.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = await c.get('/api/v1/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: u.email,
      roles: ['ENGINEER'],
      mustChangePassword: false,
    });
    expect(me.body.permissions).toContain('document.edit');
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('wrong password and unknown email return the same INVALID_CREDENTIALS', async () => {
    const u = await makeUser(t.prisma);
    const a = await http()
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'nope-nope-nope', platform: 'WEB' });
    const b = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@x.co', password: 'nope-nope-nope', platform: 'WEB' });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
    expect(b.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('AT-PLT-01 ten failed logins lock the account; the 11th attempt gets 423 + audit + email event', async () => {
    const u = await makeUser(t.prisma);
    for (let i = 0; i < 10; i++) {
      // distinct IP per attempt so the per-IP rate limit (10/min) does not interfere
      await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i + 1}`)
        .send({ email: u.email, password: `wrong-password-${i}`, platform: 'WEB' })
        .expect(401);
    }
    const res = await http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.0.1.1')
      .send({ email: u.email, password: DEFAULT_PASSWORD, platform: 'WEB' })
      .expect(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    const audits = await t.prisma.auditLog.findMany({
      where: { entityId: u.id },
      orderBy: { id: 'asc' },
    });
    expect(audits.filter((a) => a.action === 'auth.login_failed')).toHaveLength(10);
    expect(audits.some((a) => a.action === 'auth.account_locked')).toBe(true);
    const events = await t.prisma.outboxEvent.findMany({
      where: { type: 'auth.account_locked', aggregateId: u.id },
    });
    expect(events).toHaveLength(1);
    // after 15 minutes the lock expires
    t.clock.advance(16 * 60_000);
    await http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.0.2.1')
      .send({ email: u.email, password: DEFAULT_PASSWORD, platform: 'WEB' })
      .expect(200);
  });

  it('AT-PLT-02 reusing a rotated refresh token revokes the whole family (bearer)', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    const r1 = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: c.refreshToken })
      .expect(200);
    const newAccess = r1.body.accessToken as string;
    await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${newAccess}`).expect(200);
    // reuse the old token → theft detected
    await http().post('/api/v1/auth/refresh').send({ refreshToken: c.refreshToken }).expect(401);
    await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${newAccess}`).expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken })
      .expect(401);
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.token_reuse_detected', entityId: u.id },
    });
    expect(audit).not.toBeNull();
  });

  it('AT-PLT-02 web cookie flow: refresh rotates cookies; reuse after the grace window revokes', async () => {
    const u = await makeUser(t.prisma);
    const { agent, cookies } = await cookieLogin(t.app, u.email);
    expect(cookies.join(';')).toMatch(/wems_at=.*HttpOnly/);
    expect(cookies.join(';')).toMatch(/wems_rt=.*Path=\/api\/v1\/auth/);
    const oldRt = /wems_rt=([^;]+)/.exec(cookies.join(';'))![1];
    await agent.get('/api/v1/auth/me').expect(200);
    await agent.post('/api/v1/auth/refresh').send({}).expect(200);
    t.clock.advance(6_000);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', `wems_rt=${oldRt}`)
      .send({})
      .expect(401);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('cookie requests that change data need a matching X-CSRF-Token', async () => {
    const u = await makeUser(t.prisma);
    const { agent, csrf } = await cookieLogin(t.app, u.email);
    await agent
      .post('/api/v1/auth/signing-pin')
      .send({ password: DEFAULT_PASSWORD, pin: '482913' })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('CSRF_INVALID'));
    await agent
      .post('/api/v1/auth/signing-pin')
      .set('X-CSRF-Token', csrf)
      .send({ password: DEFAULT_PASSWORD, pin: '482913' })
      .expect(204);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.hasSigningPin).toBe(true);
  });

  it('expired access token → 401 TOKEN_EXPIRED; refresh keeps the user signed in', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    t.clock.advance(16 * 60_000);
    const res = await c.get('/api/v1/auth/me').expect(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    await http().post('/api/v1/auth/refresh').send({ refreshToken: c.refreshToken }).expect(200);
  });

  it('logout revokes the session', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    await c.post('/api/v1/auth/logout').send({ refreshToken: c.refreshToken }).expect(204);
    await c.get('/api/v1/auth/me').expect(401);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: c.refreshToken }).expect(401);
  });

  it('mustChangePassword blocks other endpoints until the password is changed; other sessions end', async () => {
    const u = await makeUser(t.prisma, { mustChangePassword: true });
    const other = await bearerLogin(t.app, u.email);
    const c = await bearerLogin(t.app, u.email);
    await c
      .get('/api/v1/auth/sessions')
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('PASSWORD_CHANGE_REQUIRED'));
    await c
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'short' })
      .expect(422)
      .expect((r) =>
        expect(r.body.errors[0]).toMatchObject({ field: 'newPassword', code: 'TOO_SHORT' }),
      );
    await c
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'ระบบบำบัดน้ำเสีย-รอบใหม่-2569' })
      .expect(204);
    await c.get('/api/v1/auth/sessions').expect(200);
    await other.get('/api/v1/auth/me').expect(401);
  });

  it('MFA: setup → enable → login requires a TOTP code', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    const setup = await c
      .post('/api/v1/auth/mfa/setup')
      .send({ password: DEFAULT_PASSWORD })
      .expect(200);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
    const now = () => t.clock.now().getTime();
    await c.post('/api/v1/auth/mfa/enable').send({ code: '000000' }).expect(401);
    await c
      .post('/api/v1/auth/mfa/enable')
      .send({ code: totp(setup.body.secret, now()) })
      .expect(204);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: DEFAULT_PASSWORD, platform: 'IOS' })
      .expect(200);
    expect(login.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    await http()
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: '123456' })
      .expect(401);
    const ok = await http()
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: totp(setup.body.secret, now()) })
      .expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    const secret = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(secret.mfaSecretEnc).not.toContain(setup.body.secret);
  });

  it('ADMIN without MFA is told to set it up (security.requireMfaRoles)', async () => {
    const u = await makeUser(t.prisma, { roles: ['ADMIN'] });
    const c = await bearerLogin(t.app, u.email);
    expect(c.body.user.mfaSetupRequired).toBe(true);
  });

  it('sessions can be listed and revoked by their owner only', async () => {
    const u = await makeUser(t.prisma);
    const a = await bearerLogin(t.app, u.email);
    const b = await bearerLogin(t.app, u.email);
    const list = await a.get('/api/v1/auth/sessions').expect(200);
    expect(list.body).toHaveLength(2);
    const otherId = list.body.find((s: { current: boolean }) => !s.current).id;
    const stranger = await bearerLogin(t.app, (await makeUser(t.prisma)).email);
    await stranger.delete(`/api/v1/auth/sessions/${otherId}`).expect(404);
    await a.delete(`/api/v1/auth/sessions/${otherId}`).expect(204);
    await b.get('/api/v1/auth/me').expect(401);
  });

  it('deactivated users are rejected immediately', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    await t.prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    await c.get('/api/v1/auth/me').expect(401);
  });
});
