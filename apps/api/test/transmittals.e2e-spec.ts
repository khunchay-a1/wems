import request from 'supertest';
import { type DesignProject, makeDesignProject, stepsFor, uploadPdf } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { startFakeGotenberg } from './utils/fake-gotenberg';
import { startSmtpSink, waitFor } from './utils/smtp-sink';
import { startWorker } from './utils/worker';

describe('P1-10 transmittals (M04 §3.5, §7; docs/05-workflows.md §4)', () => {
  let t: TestApp;
  let p: DesignProject;
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  let gotenberg: Awaited<ReturnType<typeof startFakeGotenberg>>;
  let worker: Awaited<ReturnType<typeof startWorker>>;
  const dca = () => p.templates.find((x) => x.code === 'DRAW_CHECK_APPROVE')!;

  beforeAll(async () => {
    sink = await startSmtpSink();
    gotenberg = await startFakeGotenberg();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(sink.port);
    process.env.GOTENBERG_URL = gotenberg.url;
    t = await createTestApp();
    worker = await startWorker(t.clock);
    p = await makeDesignProject(t, 'ระบบประปา');
  }, 90_000);
  afterAll(async () => {
    await worker.close();
    await t.close();
    await gotenberg.close();
    await sink.close();
  });

  /** A drawing whose revision went through review and was approved (signed with the PIN). */
  async function approved(title: string, purposeCode: 'FC' | 'FA' = 'FC', sizeBytes?: number) {
    const d = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/documents`)
        .send({
          title,
          disciplineId: p.disciplines.PR,
          documentTypeId: p.types.DWG,
          ownerId: p.author.id,
          plans: [{ purposeCode, plannedDate: '2026-12-01' }],
        })
        .expect(201)
    ).body as { id: string; number: string };
    const r = (
      await p.author.c.post(`/api/v1/documents/${d.id}/revisions`).send({ purposeCode }).expect(201)
    ).body as { id: string };
    const pdf = await uploadPdf(t, p.author.c, `${title}.pdf`);
    if (sizeBytes) {
      await t.prisma.fileObject.update({
        where: { id: pdf },
        data: { sizeBytes: BigInt(sizeBytes) },
      });
    }
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
          steps: stepsFor(dca(), { CHECK: [p.checker.id], APPROVE: [p.approver.id] }),
        })
        .expect(200)
    ).body;
    const check = rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');
    rev = (
      await p.checker.c
        .post(`/api/v1/review-steps/${check.id}/decision`)
        .send({ version: check.version, decision: 'APPROVED' })
        .expect(200)
    ).body;
    const approve = rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'APPROVE');
    await p.approver.c
      .post(`/api/v1/review-steps/${approve.id}/decision`)
      .send({
        version: approve.version,
        decision: 'APPROVED',
        signature: { method: 'SIGNING_PIN', secret: '246810' },
      })
      .expect(200);
    return { documentId: d.id, number: d.number, revisionId: r.id };
  }

  it('AT-DOC-10 BR-DOC-060/063 a FC transmittal by email: number, cover sheet + attachment, ISSUED, plan actual date', async () => {
    const a = await approved('แผนผังโรงกรองน้ำ', 'FC', 5 * 1024 * 1024);
    // BR-DOC-060: drafts and internal documents cannot be sent
    const draftDoc = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/documents`)
        .send({
          title: 'ร่าง',
          disciplineId: p.disciplines.PR,
          documentTypeId: p.types.DWG,
          firstRevision: { purposeCode: 'FR' },
        })
        .expect(201)
    ).body;
    const created = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/transmittals`)
      .send({
        subject: 'ส่งแบบเพื่อก่อสร้าง',
        purposeCode: 'FC',
        deliveryMethod: 'EMAIL_ATTACHMENT',
        recipientName: 'การประปาส่วนภูมิภาค',
        recipientEmails: ['Client@Example.co.th'],
        items: [{ revisionId: a.revisionId, copies: 2 }],
      })
      .expect(201);
    const tr = created.body;
    expect(tr.number).toBe(`TR-${p.projectCode}-001`);
    expect(tr.recipientEmails).toEqual(['client@example.co.th']);
    expect(tr.allowedActions).toContain('send');
    const notApproved = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/items`)
      .send({ revisionId: draftDoc.currentRevision.id })
      .expect(422);
    expect(notApproved.body).toMatchObject({ code: 'TRN_ITEM_NOT_APPROVED', rule: 'BR-DOC-060' });
    const dup = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/items`)
      .send({ revisionId: a.revisionId })
      .expect(422);
    expect(dup.body.code).toBe('TRN_DUPLICATE_ITEM');
    // engineers cannot send transmittals
    await p.author.c
      .post(`/api/v1/transmittals/${tr.id}/send`)
      .send({ version: tr.version })
      .expect(403);

    const sent = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/send`)
      .send({ version: tr.version })
      .expect(200);
    expect(sent.body).toMatchObject({
      status: 'SENT',
      deliveryMethod: 'EMAIL_ATTACHMENT',
      warnings: [],
    });
    expect(sent.body.items[0].revisionStatus).toBe('ISSUED');
    const doc = await p.dc.c.get(`/api/v1/documents/${a.documentId}`).expect(200);
    expect(
      doc.body.plans.find((x: { purposeCode: string }) => x.purposeCode === 'FC').actualDate,
    ).toBe(t.clock.now().toISOString().slice(0, 10));
    // BR-DOC-066 frozen after sending
    const frozen = await p.dc.c
      .patch(`/api/v1/transmittals/${tr.id}`)
      .send({ version: sent.body.version, subject: 'แก้' })
      .expect(409);
    expect(frozen.body.code).toBe('TRN_NOT_EDITABLE');

    await worker.relay();
    const mail = await waitFor(() => sink.mails.find((m) => m.subject.includes(tr.number)), 30_000);
    expect(mail.to).toEqual(['client@example.co.th']);
    expect(mail.attachments.map((x) => x.filename)).toEqual([
      `${tr.number}.pdf`,
      `${a.number}_Rev0.pdf`,
    ]);
    const after = await p.dc.c.get(`/api/v1/transmittals/${tr.id}`).expect(200);
    expect(after.body.coverSheetFileId).toBeTruthy();
    await p.site.c.get(`/api/v1/transmittals/${tr.id}/cover-sheet`).expect(200);

    // acknowledgement date must not be before sending
    await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/acknowledge`)
      .send({ version: after.body.version, acknowledgedAt: '2020-01-01' })
      .expect(400);
    const ack = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/acknowledge`)
      .send({
        version: after.body.version,
        acknowledgedAt: t.clock.now().toISOString().slice(0, 10),
      })
      .expect(200);
    expect(ack.body.status).toBe('ACKNOWLEDGED');
  });

  it('AT-DOC-11 BR-DOC-062/065 a 150 MB transmittal switches to a link; downloads are recorded; revoked → 410', async () => {
    const a = await approved('แบบขยายถังน้ำใส', 'FC', 150 * 1024 * 1024);
    const tr = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/transmittals`)
        .send({
          subject: 'แบบขนาดใหญ่',
          purposeCode: 'FC',
          deliveryMethod: 'EMAIL_ATTACHMENT',
          recipientName: 'ลูกค้า',
          recipientEmails: ['big@example.co.th'],
          items: [{ revisionId: a.revisionId }],
        })
        .expect(201)
    ).body;
    expect(tr.willSendLink).toBe(true);
    const sent = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/send`)
      .send({ version: tr.version })
      .expect(200);
    expect(sent.body).toMatchObject({
      deliveryMethod: 'EMAIL_LINK',
      warnings: ['SWITCHED_TO_LINK'],
    });
    expect(sent.body.publicUrl).toMatch(/\/t\/[\w-]+$/);
    const token = (sent.body.publicUrl as string).split('/t/')[1]!;

    await worker.relay();
    const mail = await waitFor(() => sink.mails.find((m) => m.subject.includes(tr.number)), 30_000);
    expect(mail.attachments.map((x) => x.filename)).toEqual([`${tr.number}.pdf`]);
    expect(mail.html).toContain(`/t/${token}`);

    // public page — no login
    const anon = request(t.app.getHttpServer());
    const page = await anon.get(`/api/v1/public/transmittals/${token}`).expect(200);
    expect(page.body).toMatchObject({ number: tr.number, hasPackage: true });
    const item = page.body.items[0];
    const dl = await anon
      .get(`/api/v1/public/transmittals/${token}/items/${item.id}/download`)
      .expect(200);
    expect(dl.body.url).toContain('stamps');
    await anon.get(`/api/v1/public/transmittals/${token}/package`).expect(200);
    expect(await t.prisma.transmittalDownload.count({ where: { transmittalId: tr.id } })).toBe(2);
    const staff = await p.dc.c.get(`/api/v1/transmittals/${tr.id}`).expect(200);
    expect(staff.body.downloads).toHaveLength(2);
    expect(staff.body.publicUrl).toBe(sent.body.publicUrl);
    await anon.get('/api/v1/public/transmittals/not-a-real-token').expect(404);

    const revoked = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/revoke-link`)
      .send({ version: staff.body.version })
      .expect(200);
    const gone = await anon.get(`/api/v1/public/transmittals/${token}`).expect(410);
    expect(gone.body.code).toBe('TRN_LINK_EXPIRED');
    await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/extend-link`)
      .send({ version: revoked.body.version, days: 7 })
      .expect(200);
    await anon.get(`/api/v1/public/transmittals/${token}`).expect(200);
    // expiry
    t.clock.advance(8 * 86_400_000);
    await anon.get(`/api/v1/public/transmittals/${token}`).expect(410);
    t.clock.advance(-8 * 86_400_000);
  });

  it('AT-DOC-12 BR-DOC-064 CODE_3 notifies the owner and the PM and flags the register', async () => {
    const a = await approved('แบบสถานีสูบน้ำ', 'FA');
    const tr = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/transmittals`)
        .send({
          subject: 'ส่งเพื่ออนุมัติ',
          purposeCode: 'FA',
          deliveryMethod: 'HARD_COPY',
          recipientName: 'ลูกค้า',
          items: [{ revisionId: a.revisionId, format: 'HARD_COPY' }],
        })
        .expect(201)
    ).body;
    const sent = await p.dc.c
      .post(`/api/v1/transmittals/${tr.id}/send`)
      .send({ version: tr.version })
      .expect(200);
    const itemId = sent.body.items[0].id;
    await p.author.c
      .post(`/api/v1/transmittal-items/${itemId}/client-response`)
      .send({ code: 'CODE_3', returnedAt: '2026-10-05' })
      .expect(403);
    const res = await p.dc.c
      .post(`/api/v1/transmittal-items/${itemId}/client-response`)
      .send({ code: 'CODE_3', returnedAt: '2026-10-05', note: 'แก้ระดับท่อ' })
      .expect(200);
    expect(res.body.items[0]).toMatchObject({
      clientReturnCode: 'CODE_3',
      clientReturnedAt: '2026-10-05',
    });
    const doc = await p.dc.c.get(`/api/v1/documents/${a.documentId}`).expect(200);
    expect(doc.body.needsNewRevision).toBe(true);
    await worker.relay();
    const pm = await t.prisma.project.findUniqueOrThrow({ where: { id: p.projectId } });
    const notified = await waitFor(async () => {
      const rows = await t.prisma.notification.findMany({
        where: { type: 'transmittal.client_response_recorded', entityId: a.revisionId },
      });
      return rows.length >= 2 ? rows : false;
    }, 15_000);
    expect(notified.map((n) => n.userId).sort()).toEqual([p.author.id, pm.projectManagerId].sort());
    // a cancelled draft cannot be sent
    const draft = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/transmittals`)
        .send({ subject: 'ยกเลิก', purposeCode: 'FI', deliveryMethod: 'OTHER', recipientName: 'x' })
        .expect(201)
    ).body;
    expect(draft.blockedActions).toContainEqual({ action: 'send', code: 'TRN_NO_ITEMS' });
    const cancelled = await p.dc.c
      .post(`/api/v1/transmittals/${draft.id}/cancel`)
      .send({ version: draft.version, reason: 'ออกผิด' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    await p.dc.c
      .post(`/api/v1/transmittals/${draft.id}/send`)
      .send({ version: cancelled.body.version })
      .expect(409);
  });
});
