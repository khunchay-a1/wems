import { DEFAULT_PASSWORD, makeUser } from './factories/users';
import { type DesignProject, makeDesignProject, stepsFor, uploadPdf } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { startFakeGotenberg } from './utils/fake-gotenberg';
import { bearerLogin } from './utils/http';

describe('P1-04/06/07 documents, revisions and review workflow (M04)', () => {
  let t: TestApp;
  let p: DesignProject;
  let gotenberg: Awaited<ReturnType<typeof startFakeGotenberg>>;
  const dca = () => p.templates.find((x) => x.code === 'DRAW_CHECK_APPROVE')!;

  beforeAll(async () => {
    gotenberg = await startFakeGotenberg();
    process.env.GOTENBERG_URL = gotenberg.url;
    t = await createTestApp();
    p = await makeDesignProject(t);
  }, 60_000);
  afterAll(async () => {
    await t.close();
    await gotenberg.close();
  });

  async function newDwg(title = 'แผนผังระบบบำบัด') {
    const res = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents`)
      .send({
        title,
        disciplineId: p.disciplines.PR,
        documentTypeId: p.types.DWG,
        ownerId: p.author.id,
      })
      .expect(201);
    return res.body as { id: string; number: string; version: number };
  }

  it('AT-DOC-01 BR-DOC-010 two PR drawings get -PR-DWG-001 and -002; BR-DOC-013 duplicate title warns', async () => {
    const preview = await p.dc.c
      .get(
        `/api/v1/projects/${p.projectId}/documents/number-preview?disciplineId=${p.disciplines.PR}&documentTypeId=${p.types.DWG}`,
      )
      .expect(200);
    expect(preview.body.number).toBe(`${p.projectCode}-PR-DWG-001`);
    const a = await newDwg('แผนผังโรงบำบัด');
    const b = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents`)
      .send({
        title: 'แผนผังโรงบำบัด',
        disciplineId: p.disciplines.PR,
        documentTypeId: p.types.DWG,
      })
      .expect(201);
    expect(a.number).toBe(`${p.projectCode}-PR-DWG-001`);
    expect(b.body.number).toBe(`${p.projectCode}-PR-DWG-002`);
    expect(b.body.warnings).toEqual([{ code: 'DOC_TITLE_EXISTS', documents: [a.number] }]);
    const list = await p.site.c
      .get(`/api/v1/projects/${p.projectId}/documents?q=PR-DWG-00`)
      .expect(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2);
    // SITE_STAFF can read but not register
    await p.site.c
      .post(`/api/v1/projects/${p.projectId}/documents`)
      .send({ title: 'x', disciplineId: p.disciplines.PR, documentTypeId: p.types.DWG })
      .expect(403);
  });

  it('AT-DOC-14 a non-member gets 404 for the document URL', async () => {
    const d = await newDwg('เอกสารลับ');
    const outsider = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email,
    );
    await outsider.get(`/api/v1/documents/${d.id}`).expect(404);
    await outsider.get(`/api/v1/projects/${p.projectId}/documents`).expect(404);
  });

  it('AT-DOC-15 two users edit the same title → the second gets 409 CONFLICT_STALE_VERSION', async () => {
    const d = await newDwg('ชื่อเดิม');
    await p.dc.c
      .patch(`/api/v1/documents/${d.id}`)
      .send({ version: d.version, title: 'ชื่อใหม่ 1' })
      .expect(200);
    const second = await p.author.c
      .patch(`/api/v1/documents/${d.id}`)
      .send({ version: d.version, title: 'ชื่อใหม่ 2' })
      .expect(409);
    expect(second.body.code).toBe('CONFLICT_STALE_VERSION');
    expect(second.body.current.title).toBe('ชื่อใหม่ 1');
  });

  it('BR-DOC-011 discipline change before approval issues a new number; plans; hold/resume', async () => {
    const d = await newDwg('เปลี่ยนสาขา');
    const moved = await p.dc.c
      .patch(`/api/v1/documents/${d.id}`)
      .send({ version: d.version, disciplineId: p.disciplines.GE })
      .expect(200);
    expect(moved.body.number).toMatch(new RegExp(`^${p.projectCode}-GE-DWG-\\d{3}$`));
    const planned = await p.dc.c
      .put(`/api/v1/documents/${d.id}/plans`)
      .send({
        plans: [
          { purposeCode: 'FC', plannedDate: '2026-12-15' },
          { purposeCode: 'FA', plannedDate: '2026-11-01' },
        ],
      })
      .expect(200);
    expect(planned.body.plans.map((x: { purposeCode: string }) => x.purposeCode)).toEqual([
      'FA',
      'FC',
    ]);
    const held = await p.dc.c
      .post(`/api/v1/documents/${d.id}/hold`)
      .send({ version: planned.body.version })
      .expect(200);
    expect(held.body.blockedActions).toContainEqual({
      action: 'newRevision',
      code: 'DOC_NOT_ACTIVE',
    });
    await p.dc.c
      .post(`/api/v1/documents/${d.id}/resume`)
      .send({ version: held.body.version })
      .expect(200);
  });

  it('BR-DOC-021/025 one draft at a time; a never-submitted draft can be discarded and its label reused', async () => {
    const d = await newDwg('ทิ้งร่าง');
    const a = await p.author.c
      .post(`/api/v1/documents/${d.id}/revisions`)
      .send({ purposeCode: 'FR' })
      .expect(201);
    expect(a.body).toMatchObject({ revLabel: 'A', revIndex: 1, status: 'DRAFT' });
    expect(a.body.allowedActions).toContain('discard');
    const again = await p.author.c
      .post(`/api/v1/documents/${d.id}/revisions`)
      .send({ purposeCode: 'FA' })
      .expect(409);
    expect(again.body.code).toBe('DOC_REVISION_IN_PROGRESS');
    await p.author.c.delete(`/api/v1/revisions/${a.body.id}`).expect(204);
    const a2 = await p.author.c
      .post(`/api/v1/documents/${d.id}/revisions`)
      .send({ purposeCode: 'FA' })
      .expect(201);
    expect(a2.body.revLabel).toBe('A');
    const doc = await p.author.c.get(`/api/v1/documents/${d.id}`).expect(200);
    expect(doc.body.currentRevision.id).toBe(a2.body.id);
    // BR-DOC-024 override needs document.admin
    await p.author.c
      .post(`/api/v1/documents/${d.id}/revisions`)
      .send({ purposeCode: 'FR', revLabelOverride: 'C' })
      .expect(403);
  });

  it('AT-DOC-03..07, 09 full review cycle with comments, rejection, resubmission, signed approval and supersede', async () => {
    const d = await newDwg('แบบถังเติมอากาศ');
    const revA = await p.author.c
      .post(`/api/v1/documents/${d.id}/revisions`)
      .send({ purposeCode: 'FR' })
      .expect(201);
    const rid = revA.body.id as string;
    const steps = stepsFor(dca(), { CHECK: [p.checker.id], APPROVE: [p.approver.id] });

    // AT-DOC-03 no PDF yet
    const noPdf = await p.author.c
      .post(`/api/v1/revisions/${rid}/submit`)
      .send({ version: revA.body.version, steps })
      .expect(422);
    expect(noPdf.body).toMatchObject({ code: 'DOC_PDF_RENDITION_REQUIRED', rule: 'BR-DOC-030' });

    const pdf1 = await uploadPdf(t, p.author.c, 'A-v1.pdf');
    let rev = (
      await p.author.c
        .post(`/api/v1/revisions/${rid}/files`)
        .send({ fileId: pdf1, role: 'PDF_RENDITION' })
        .expect(201)
    ).body;
    expect(rev.allowedActions).toContain('submit');

    // a DWG cannot be the PDF rendition
    const dwg = await uploadPdf(t, p.author.c, 'A.dwg');
    await t.prisma.fileObject.update({
      where: { id: dwg },
      data: { mimeType: 'application/acad' },
    });
    const mismatch = await p.author.c
      .post(`/api/v1/revisions/${rid}/files`)
      .send({ fileId: dwg, role: 'PDF_RENDITION' })
      .expect(422);
    expect(mismatch.body.code).toBe('DOC_FILE_TYPE_MISMATCH');
    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${rid}/files`)
        .send({ fileId: dwg, role: 'NATIVE' })
        .expect(201)
    ).body;

    // eligible reviewers: the author is greyed out for CHECK (BR-DOC-042)
    const eligible = await p.author.c
      .get(`/api/v1/revisions/${rid}/eligible-reviewers`)
      .expect(200);
    const check = eligible.body.steps.find((s: { kind: string }) => s.kind === 'CHECK');
    expect(
      check.candidates.find((c: { userId: string }) => c.userId === p.author.id),
    ).toMatchObject({
      eligible: false,
      reason: 'DOC_SEPARATION_OF_DUTIES',
    });
    const approve = eligible.body.steps.find((s: { kind: string }) => s.kind === 'APPROVE');
    expect(approve.needsLicense).toBe(true);
    expect(
      approve.candidates.find((c: { userId: string }) => c.userId === p.approver.id),
    ).toMatchObject({
      eligible: true,
      license: { level: 'PROFESSIONAL' },
    });

    // AT-DOC-04 self as checker
    const self = await p.author.c
      .post(`/api/v1/revisions/${rid}/submit`)
      .send({
        version: rev.version,
        steps: stepsFor(dca(), { CHECK: [p.author.id], APPROVE: [p.approver.id] }),
      })
      .expect(422);
    expect(self.body).toMatchObject({ code: 'DOC_SEPARATION_OF_DUTIES', rule: 'BR-DOC-042' });
    const missing = await p.author.c
      .post(`/api/v1/revisions/${rid}/submit`)
      .send({ version: rev.version, steps: stepsFor(dca(), { CHECK: [p.checker.id] }) })
      .expect(422);
    expect(missing.body.code).toBe('DOC_ASSIGNEE_REQUIRED');

    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${rid}/submit`)
        .send({ version: rev.version, steps, note: 'รอบแรก' })
        .expect(200)
    ).body;
    expect(rev.status).toBe('IN_REVIEW');
    const cycle1 = rev.cycles[0];
    expect(cycle1).toMatchObject({ cycleNo: 1, reviewedFileId: pdf1 });
    const checkStep = cycle1.steps.find((s: { kind: string }) => s.kind === 'CHECK');
    expect(checkStep).toMatchObject({ status: 'ACTIVE', dueAt: expect.any(String) });
    expect(cycle1.steps.find((s: { kind: string }) => s.kind === 'APPROVE').status).toBe('PENDING');
    expect(
      await t.prisma.outboxEvent.count({
        where: { type: 'review.step.activated', aggregateId: checkStep.id },
      }),
    ).toBe(1);

    // BR-DOC-026 locked while in review
    const pdfLocked = await uploadPdf(t, p.author.c, 'A-late.pdf');
    const locked = await p.author.c
      .post(`/api/v1/revisions/${rid}/files`)
      .send({ fileId: pdfLocked, role: 'PDF_RENDITION' })
      .expect(409);
    expect(locked.body.code).toBe('DOC_REVISION_LOCKED');

    // inbox of the checker
    const inbox = await p.checker.c.get('/api/v1/review-steps').expect(200);
    expect(inbox.body.map((s: { id: string }) => s.id)).toContain(checkStep.id);

    // only the assignee decides
    const notMine = await p.approver.c
      .post(`/api/v1/review-steps/${checkStep.id}/decision`)
      .send({ version: checkStep.version, decision: 'APPROVED' })
      .expect(403);
    expect(notMine.body.code).toBe('DOC_NOT_ASSIGNEE');

    // AT-DOC-05 approved with comments but no comment
    const noComment = await p.checker.c
      .post(`/api/v1/review-steps/${checkStep.id}/decision`)
      .send({ version: checkStep.version, decision: 'APPROVED_WITH_COMMENTS' })
      .expect(422);
    expect(noComment.body).toMatchObject({ code: 'DOC_COMMENT_REQUIRED', rule: 'BR-DOC-033' });

    // AT-DOC-06 two pins, then reject → DRAFT, author notified, uploads allowed again
    for (const [i, body] of ['ระยะห่างท่อไม่พอ', 'ระบุระดับน้ำ'].entries()) {
      await t.prisma.comment.create({
        data: {
          ownerType: 'DOCUMENT_REVISION',
          ownerId: rid,
          authorId: p.checker.id,
          body,
          status: 'OPEN',
          reviewStepId: checkStep.id,
          anchor: { kind: 'PIN', page: 1, x: 0.2 + i / 10, y: 0.3 },
        },
      });
    }
    rev = (
      await p.checker.c
        .post(`/api/v1/review-steps/${checkStep.id}/decision`)
        .send({ version: checkStep.version, decision: 'REJECTED' })
        .expect(200)
    ).body;
    expect(rev).toMatchObject({ status: 'DRAFT', lastCycleOutcome: 'REJECTED', lockedAt: null });
    expect(rev.cycles[0].status).toBe('REJECTED');
    expect(rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'APPROVE').status).toBe(
      'CANCELLED',
    );
    expect(
      await t.prisma.outboxEvent.count({ where: { type: 'revision.rejected', aggregateId: rid } }),
    ).toBe(1);

    // AT-DOC-07 answer, new PDF, cycle 2, checker approves, approver signs with password
    await t.prisma.comment.updateMany({
      where: { ownerId: rid },
      data: { status: 'RESPONDED', responseNote: 'แก้ไขแล้ว' },
    });
    const pdf2 = await uploadPdf(t, p.author.c, 'A-v2.pdf', 3, 'v2');
    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${rid}/files`)
        .send({ fileId: pdf2, role: 'PDF_RENDITION' })
        .expect(201)
    ).body;
    expect(
      rev.files.filter(
        (f: { role: string; isCurrent: boolean }) => f.role === 'PDF_RENDITION' && f.isCurrent,
      ),
    ).toHaveLength(1);
    expect(rev.files.find((f: { file: { id: string } }) => f.file.id === pdf2).uploadVersion).toBe(
      2,
    );
    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${rid}/submit`)
        .send({ version: rev.version, steps })
        .expect(200)
    ).body;
    const cycle2 = rev.cycles[0];
    expect(cycle2).toMatchObject({ cycleNo: 2, reviewedFileId: pdf2 });
    await t.prisma.comment.updateMany({ where: { ownerId: rid }, data: { status: 'CLOSED' } });
    const check2 = cycle2.steps.find((s: { kind: string }) => s.kind === 'CHECK');
    rev = (
      await p.checker.c
        .post(`/api/v1/review-steps/${check2.id}/decision`)
        .send({ version: check2.version, decision: 'APPROVED' })
        .expect(200)
    ).body;
    const approve2 = rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'APPROVE');
    expect(approve2.status).toBe('ACTIVE');
    const noSig = await p.approver.c
      .post(`/api/v1/review-steps/${approve2.id}/decision`)
      .send({ version: approve2.version, decision: 'APPROVED' })
      .expect(422);
    expect(noSig.body.code).toBe('DOC_SIGNATURE_REQUIRED');
    const badSig = await p.approver.c
      .post(`/api/v1/review-steps/${approve2.id}/decision`)
      .send({
        version: approve2.version,
        decision: 'APPROVED',
        signature: { method: 'PASSWORD', secret: 'wrong' },
      })
      .expect(401);
    expect(badSig.body.code).toBe('DOC_SIGNATURE_INVALID');
    rev = (
      await p.approver.c
        .post(`/api/v1/review-steps/${approve2.id}/decision`)
        .send({
          version: approve2.version,
          decision: 'APPROVED',
          signature: { method: 'PASSWORD', secret: DEFAULT_PASSWORD },
        })
        .expect(200)
    ).body;
    expect(rev).toMatchObject({
      status: 'APPROVED',
      isLatestApproved: true,
      approvedBy: { id: p.approver.id },
      checkedBy: { id: p.checker.id },
    });
    const sig = await t.prisma.signatureEvent.findFirstOrThrow({
      where: { entityId: approve2.id },
    });
    const f2 = await t.prisma.fileObject.findUniqueOrThrow({ where: { id: pdf2 } });
    expect(sig).toMatchObject({
      method: 'PASSWORD',
      fileSha256: f2.sha256,
      purpose: 'review.approve',
    });
    expect(sig.licenseId).toBeTruthy();
    const doc = await p.dc.c.get(`/api/v1/documents/${d.id}`).expect(200);
    expect(doc.body.latestApprovedRevision).toMatchObject({
      id: rid,
      revLabel: 'A',
      status: 'APPROVED',
    });

    // download: APPROVED FR → "PRELIMINARY" box stamp; unstamped needs document.edit
    const dl = await p.site.c.get(`/api/v1/revisions/${rid}/download`).expect(200);
    expect(dl.body.url).toContain('stamps');
    await p.site.c.get(`/api/v1/revisions/${rid}/download?stamp=false`).expect(403);

    // AT-DOC-09 Rev.0 (FC) carries a RESPONDED comment of Rev.A; approving it supersedes Rev.A
    await t.prisma.comment.create({
      data: {
        ownerType: 'DOCUMENT_REVISION',
        ownerId: rid,
        authorId: p.checker.id,
        body: 'ค้างตอบ',
        status: 'RESPONDED',
        responseNote: 'จะแก้ใน Rev.0',
      },
    });
    const rev0 = (
      await p.author.c
        .post(`/api/v1/documents/${d.id}/revisions`)
        .send({ purposeCode: 'FC', description: 'ออกเพื่อก่อสร้าง' })
        .expect(201)
    ).body;
    expect(rev0.revLabel).toBe('0');
    const carried = await t.prisma.comment.findMany({ where: { ownerId: rev0.id } });
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({ status: 'OPEN', body: 'ค้างตอบ' });
    const original = await t.prisma.comment.findUniqueOrThrow({
      where: { id: carried[0]!.carriedFromCommentId! },
    });
    expect(original.status).toBe('CLOSED');
    const pdf0 = await uploadPdf(t, p.author.c, '0.pdf');
    let r0 = (
      await p.author.c
        .post(`/api/v1/revisions/${rev0.id}/files`)
        .send({ fileId: pdf0, role: 'PDF_RENDITION' })
        .expect(201)
    ).body;
    r0 = (
      await p.author.c
        .post(`/api/v1/revisions/${rev0.id}/submit`)
        .send({ version: r0.version, steps })
        .expect(200)
    ).body;
    const c0 = r0.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');
    await t.prisma.comment.updateMany({ where: { ownerId: rev0.id }, data: { status: 'CLOSED' } });
    r0 = (
      await p.checker.c
        .post(`/api/v1/review-steps/${c0.id}/decision`)
        .send({ version: c0.version, decision: 'APPROVED' })
        .expect(200)
    ).body;
    const a0 = r0.cycles[0].steps.find((s: { kind: string }) => s.kind === 'APPROVE');
    r0 = (
      await p.approver.c
        .post(`/api/v1/review-steps/${a0.id}/decision`)
        .send({
          version: a0.version,
          decision: 'APPROVED',
          signature: { method: 'SIGNING_PIN', secret: '246810' },
        })
        .expect(200)
    ).body;
    expect(r0.status).toBe('APPROVED');
    const oldA = await p.dc.c.get(`/api/v1/revisions/${rid}`).expect(200);
    expect(oldA.body.status).toBe('SUPERSEDED');
    expect(
      await t.prisma.outboxEvent.count({
        where: { type: 'revision.superseded', aggregateId: rid },
      }),
    ).toBe(1);
    // SUPERSEDED watermark is Thai → rendered through (fake) Gotenberg
    const before = gotenberg.requests;
    const dlOld = await p.site.c.get(`/api/v1/revisions/${rid}/download`).expect(200);
    expect(dlOld.body.url).toContain('stamps');
    expect(gotenberg.requests).toBeGreaterThan(before);
  }, 60_000);

  it('AT-DOC-08 an approver whose licence expired yesterday cannot approve', async () => {
    const d = await newDwg('ใบอนุญาตหมดอายุ');
    const r = (
      await p.author.c
        .post(`/api/v1/documents/${d.id}/revisions`)
        .send({ purposeCode: 'FA' })
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
          steps: stepsFor(dca(), { CHECK: [p.checker.id], APPROVE: [p.approver.id] }),
        })
        .expect(200)
    ).body;
    const c1 = rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');
    rev = (
      await p.checker.c
        .post(`/api/v1/review-steps/${c1.id}/decision`)
        .send({ version: c1.version, decision: 'APPROVED' })
        .expect(200)
    ).body;
    const a1 = rev.cycles[0].steps.find((s: { kind: string }) => s.kind === 'APPROVE');
    // the test clock is 2026-09-28 (Bangkok) → expire yesterday
    const original = await t.prisma.professionalLicense.findFirstOrThrow({
      where: { userId: p.approver.id },
    });
    await t.prisma.professionalLicense.update({
      where: { id: original.id },
      data: { expiresAt: new Date('2026-09-27T00:00:00Z') },
    });
    const res = await p.approver.c
      .post(`/api/v1/review-steps/${a1.id}/decision`)
      .send({
        version: a1.version,
        decision: 'APPROVED',
        signature: { method: 'SIGNING_PIN', secret: '246810' },
      })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'DOC_LICENSE_EXPIRED', rule: 'BR-DOC-040' });
    await t.prisma.professionalLicense.update({
      where: { id: original.id },
      data: { expiresAt: original.expiresAt },
    });

    // BR-DOC-037 the PM reassigns the approval; separation still applies
    const sod = await p.pm.c
      .post(`/api/v1/review-steps/${a1.id}/reassign`)
      .send({ version: a1.version, assigneeId: p.checker.id, reason: 'ผู้อนุมัติลา' })
      .expect(422);
    expect(sod.body.code).toBe('DOC_ASSIGNEE_NOT_ELIGIBLE');
    // cancel the review and void the draft
    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${r.id}/cancel-review`)
        .send({ version: rev.version, reason: 'ยกเลิกเพื่อแก้ไข' })
        .expect(200)
    ).body;
    expect(rev.status).toBe('DRAFT');
    expect(rev.allowedActions).toContain('void');
    rev = (
      await p.author.c
        .post(`/api/v1/revisions/${r.id}/void`)
        .send({ version: rev.version, reason: 'ไม่ใช้แล้ว' })
        .expect(200)
    ).body;
    expect(rev.status).toBe('VOID');
    // BR-DOC-023 the VOID label stays used
    const next = await p.author.c
      .post(`/api/v1/documents/${d.id}/revisions`)
      .send({ purposeCode: 'FA' })
      .expect(201);
    expect(next.body.revLabel).toBe('B');
  }, 60_000);
});
