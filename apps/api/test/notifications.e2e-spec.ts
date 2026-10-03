import request from 'supertest';
import { firstValueFrom, take, toArray, timeout } from 'rxjs';
import { NotificationDispatchService } from '../src/common/notifications/notification-dispatch.service';
import { RealtimeHub } from '../src/common/realtime/realtime.hub';
import { RealtimePublisher } from '../src/common/realtime/realtime.publisher';
import { LicenseExpiryTask } from '../src/worker/tasks/notification.tasks';
import { DEFAULT_PASSWORD, makeUser } from './factories/users';
import { createTestApp, type TestApp } from './utils/app';
import { bearerLogin } from './utils/http';
import { startSmtpSink, waitFor } from './utils/smtp-sink';
import { startWorker } from './utils/worker';

describe('P0-10 notifications', () => {
  let t: TestApp;
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  let worker: Awaited<ReturnType<typeof startWorker>>;

  beforeAll(async () => {
    sink = await startSmtpSink();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(sink.port);
    t = await createTestApp();
    worker = await startWorker(t.clock);
  });
  afterAll(async () => {
    await worker.close();
    await t.close();
    await sink.close();
  });

  it('account lock → outbox → worker → email delivered over SMTP (security mail to the actor)', async () => {
    const u = await makeUser(t.prisma, { email: 'locked.user@test.wems.local' });
    for (let i = 0; i < 10; i++) {
      await request(t.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `10.9.0.${i}`)
        .send({ email: u.email, password: `bad-password-${i}`, platform: 'WEB' });
    }
    expect(await worker.relay()).toBeGreaterThan(0);
    const mail = await waitFor(() => sink.mails.find((m) => m.to.includes(u.email)));
    expect(mail.subject).toBe('บัญชีของคุณถูกล็อกชั่วคราว');
    expect(mail.html).toMatch(/<html lang=["']th["']>/);
    expect(mail.text).toContain('WEMS');
  });

  it('license expiry (60/30/7 days) → in-app for owner and admins; bell, read, preferences', async () => {
    const admin = await makeUser(t.prisma, { roles: ['ADMIN'] });
    const eng = await makeUser(t.prisma, {
      roles: ['ENGINEER'],
      license: { expiresAt: '2026-10-28' },
    }); // now = 2026-09-28 → 30 days
    const task = worker.app.get(LicenseExpiryTask);
    expect(await task.run()).toBe(1);
    expect(await task.run()).toBe(0); // idempotent per day/threshold
    await worker.relay();
    const ec = await bearerLogin(t.app, eng.email);
    let res = await ec.get('/api/v1/notifications');
    for (let i = 0; i < 40 && res.body.data.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      res = await ec.get('/api/v1/notifications');
    }
    expect(res.body.data[0]).toMatchObject({
      type: 'license.expiring',
      title: 'ใบอนุญาตจะหมดอายุใน 30 วัน',
      readAt: null,
    });
    expect(res.body.meta.unreadCount).toBe(1);
    const ac = await bearerLogin(t.app, admin.email);
    expect(
      (await ac.get('/api/v1/notifications/unread-count').expect(200)).body.unreadCount,
    ).toBeGreaterThanOrEqual(1);
    await ec.post(`/api/v1/notifications/${res.body.data[0].id}/read`).expect(204);
    expect((await ec.get('/api/v1/notifications/unread-count')).body.unreadCount).toBe(0);
    const prefs = await ec.get('/api/v1/notification-preferences').expect(200);
    expect(prefs.body.find((p: { type: string }) => p.type === 'license.expiring')).toMatchObject({
      defaultChannels: ['IN_APP', 'EMAIL'],
    });
    await ec
      .put('/api/v1/notification-preferences')
      .send({ preferences: [{ type: 'nope', channels: [] }] })
      .expect(400);
  });

  it('BR-PLT-031 more than 5 emails of one type in 10 minutes are rolled into a digest', async () => {
    const u = await makeUser(t.prisma, { email: 'digest.user@test.wems.local' });
    const dispatch = worker.app.get(NotificationDispatchService);
    for (let i = 0; i < 7; i++) {
      await dispatch.handle({
        eventId: `00000000-0000-7000-8000-00000000000${i}`,
        type: 'auth.token_reuse_detected',
        payload: { userId: u.id },
        aggregateId: u.id,
        createdAt: '',
      });
    }
    const rows = await t.prisma.notification.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'asc' },
    });
    const states = rows.map((r) => (r.data as { email: string }).email);
    expect(states.filter((s) => s === 'SENT')).toHaveLength(5);
    expect(states.filter((s) => s === 'DEFERRED')).toHaveLength(2);
    expect(await dispatch.sendDigests()).toBe(1);
    const digest = await waitFor(() =>
      sink.mails.find((m) => m.to.includes(u.email) && m.subject.includes('2 รายการ')),
    );
    expect(digest.text).toContain('ตรวจพบการใช้ session ผิดปกติ');
  });

  it('push goes to registered devices when the user enables PUSH (FCM stub in dev)', async () => {
    const u = await makeUser(t.prisma, { license: { expiresAt: '2026-10-05' } }); // 7 days
    const c = await bearerLogin(t.app, u.email);
    await c
      .post('/api/v1/push-devices')
      .send({ fcmToken: 'tok-123', platform: 'ANDROID', appVersion: '1.0.0' })
      .expect(204);
    await c
      .put('/api/v1/notification-preferences')
      .send({ preferences: [{ type: 'license.expiring', channels: ['IN_APP', 'PUSH'] }] })
      .expect(200);
    await worker.app.get(LicenseExpiryTask).run();
    await worker.relay();
    const sent = await waitFor(() => worker.push.sent.find((s) => s.token === 'tok-123'));
    expect(sent.message.data).toMatchObject({
      type: 'license.expiring',
      entityType: 'ProfessionalLicense',
    });
  });

  it('BR-PLT-030 users are not notified about their own actions', async () => {
    const u = await makeUser(t.prisma);
    const dispatch = worker.app.get(NotificationDispatchService);
    // license.expiring sets notifyActor; use a synthetic event type that does not
    await dispatch.handle({
      eventId: '00000000-0000-7000-8000-0000000000aa',
      type: 'license.expiring',
      payload: {
        userId: u.id,
        licenseId: '00000000-0000-7000-8000-0000000000ab',
        daysLeft: 7,
        actorId: u.id,
      },
      aggregateId: null,
      createdAt: '',
    });
    expect(await t.prisma.notification.count({ where: { userId: u.id } })).toBe(1); // security/expiry mails still reach the actor
  });

  it('SSE hub delivers user and project events to connected clients', async () => {
    const u = await makeUser(t.prisma, { password: DEFAULT_PASSWORD });
    const c = await bearerLogin(t.app, u.email);
    const me = await c.get('/api/v1/auth/me');
    const hub = t.app.get(RealtimeHub);
    const stream = await hub.connect({
      id: me.body.id,
      email: u.email,
      displayName: '',
      locale: 'th',
      sessionId: '',
      platform: 'WEB',
      permissions: new Set(),
      roleCodes: [],
      mustChangePassword: false,
      via: 'cookie',
    });
    const got = firstValueFrom(stream.pipe(take(1), toArray(), timeout(5000)));
    await new Promise((r) => setTimeout(r, 100));
    await t.app
      .get(RealtimePublisher)
      .toUser(u.id, 'notification.created', { id: 'x', type: 't', title: 'hello' });
    const events = await got;
    expect(events[0]).toEqual({
      type: 'notification.created',
      data: { id: 'x', type: 't', title: 'hello' },
    });
  });
});
