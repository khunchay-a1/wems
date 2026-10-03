import { ReviewReminderTask } from '../src/worker/tasks/review-reminder.task';
import { type DesignProject, makeDesignProject, stepsFor, uploadPdf } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { startSmtpSink, waitFor } from './utils/smtp-sink';
import { startWorker } from './utils/worker';

describe('AT-DOC-13 review reminders (BR-DOC-038)', () => {
  let t: TestApp;
  let p: DesignProject;
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  let worker: Awaited<ReturnType<typeof startWorker>>;

  beforeAll(async () => {
    sink = await startSmtpSink();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(sink.port);
    // Monday 2026-09-28 09:00 Bangkok
    t = await createTestApp();
    worker = await startWorker(t.clock);
    p = await makeDesignProject(t, 'เตือนงานตรวจ');
  }, 60_000);
  afterAll(async () => {
    await worker.close();
    await t.close();
    await sink.close();
  });

  it('daily overdue emails to the reviewer; the PM is told on the 2nd working day late', async () => {
    const dca = p.templates.find((x) => x.code === 'DRAW_CHECK_APPROVE')!;
    const d = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents`)
      .send({ title: 'แบบเตือน', disciplineId: p.disciplines.PR, documentTypeId: p.types.DWG })
      .expect(201);
    const r = (
      await p.author.c
        .post(`/api/v1/documents/${d.body.id}/revisions`)
        .send({ purposeCode: 'FR' })
        .expect(201)
    ).body;
    const pdf = await uploadPdf(t, p.author.c);
    let rev = (
      await p.author.c
        .post(`/api/v1/revisions/${r.id}/files`)
        .send({ fileId: pdf, role: 'PDF_RENDITION' })
        .expect(201)
    ).body;
    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${r.id}/submit`)
        .send({
          version: rev.version,
          steps: stepsFor(dca, { CHECK: [p.checker.id], APPROVE: [p.approver.id] }),
        })
        .expect(200)
    ).body;
    const step = rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');
    // CHECK has 3 working days → due Thu 2026-10-01 17:00
    expect(step.dueAt).toBe('2026-10-01T10:00:00.000Z');
    await worker.relay();
    const task = worker.app.get(ReviewReminderTask);

    const runAt = async (iso: string) => {
      t.clock.set(new Date(iso));
      const n = await task.run();
      await worker.relay();
      return n;
    };
    expect(await runAt('2026-09-30T01:30:00.000Z')).toBe(1); // Wed: due soon
    expect(await runAt('2026-09-30T01:31:00.000Z')).toBe(0); // once per day
    expect(await runAt('2026-10-02T01:30:00.000Z')).toBe(1); // Fri: 1 working day late
    expect(await runAt('2026-10-03T01:30:00.000Z')).toBe(0); // Sat
    expect(await runAt('2026-10-05T01:30:00.000Z')).toBe(1); // Mon: 2 working days late

    // BullMQ consumers run asynchronously — wait until every reminder became a notification
    await waitFor(async () =>
      (await t.prisma.notification.count({ where: { entityId: step.id } })) >= 5 ? true : undefined,
    );
    const types = await t.prisma.notification.findMany({
      where: { entityId: step.id },
      orderBy: { createdAt: 'asc' },
      select: { type: true, userId: true },
    });
    expect(types.filter((x) => x.userId === p.checker.id).map((x) => x.type)).toEqual([
      'review.step.activated',
      'review.step.due_soon',
      'review.step.overdue',
      'review.step.overdue',
    ]);
    expect(types.filter((x) => x.userId === p.pm.id).map((x) => x.type)).toEqual([
      'review.step.overdue',
    ]);
    const mail = await waitFor(() =>
      sink.mails.filter((m) => m.to.includes(p.checker.email) && m.subject.includes('เลยกำหนด'))
        .length >= 2
        ? sink.mails
        : undefined,
    );
    expect(mail.length).toBeGreaterThan(0);
  }, 60_000);
});
