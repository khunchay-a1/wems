import ExcelJS from 'exceljs';
import { DEFAULT_PASSWORD, makeUser } from './factories/users';
import { type DesignProject, makeDesignProject, stepsFor, uploadPdf } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { startFakeGotenberg } from './utils/fake-gotenberg';
import { bearerLogin } from './utils/http';

interface CommentBody {
  id: string;
  seq: number;
  status: string;
  version: number;
  allowedActions: string[];
  replies: { body: string }[];
  carriedFromRevLabel: string | null;
}

describe('P1-08 comments and CRS (M04 §6, docs/05-workflows.md §3)', () => {
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

  /** A drawing with Rev.A (FR) submitted for review; returns the ACTIVE CHECK step. */
  async function inReview(title: string) {
    const d = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/documents`)
        .send({ title, disciplineId: p.disciplines.PR, documentTypeId: p.types.DWG })
        .expect(201)
    ).body as { id: string };
    const rev = (
      await p.author.c
        .post(`/api/v1/documents/${d.id}/revisions`)
        .send({ purposeCode: 'FR' })
        .expect(201)
    ).body as { id: string };
    const pdf = await uploadPdf(t, p.author.c, `${title}.pdf`);
    const withPdf = (
      await p.author.c
        .post(`/api/v1/revisions/${rev.id}/files`)
        .send({ fileId: pdf, role: 'PDF_RENDITION' })
        .expect(201)
    ).body as { version: number };
    const submitted = (
      await p.author.c
        .post(`/api/v1/revisions/${rev.id}/submit`)
        .send({
          version: withPdf.version,
          steps: stepsFor(dca(), { CHECK: [p.checker.id], APPROVE: [p.approver.id] }),
        })
        .expect(200)
    ).body;
    const check = submitted.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');
    return {
      documentId: d.id,
      revisionId: rev.id,
      check: check as { id: string; version: number },
    };
  }

  const pin = (page: number, x: number, y: number) => ({ kind: 'PIN', page, x, y });

  it('AT-DOC-06 BR-DOC-035 the checker pins two comments, rejects; the preparer is notified and can upload again', async () => {
    const { revisionId, check } = await inReview('ผังท่อ');
    // BR-DOC-035: only the assignee of the ACTIVE step writes review comments
    const notAssignee = await p.approver.c
      .post('/api/v1/comments')
      .send({
        ownerType: 'DOCUMENT_REVISION',
        ownerId: revisionId,
        body: 'x',
        reviewStepId: check.id,
      })
      .expect(403);
    expect(notAssignee.body).toMatchObject({ code: 'DOC_NOT_ASSIGNEE', rule: 'BR-DOC-035' });
    // anchors are validated (RECT needs a size inside the page)
    await p.checker.c
      .post('/api/v1/comments')
      .send({
        ownerType: 'DOCUMENT_REVISION',
        ownerId: revisionId,
        body: 'x',
        reviewStepId: check.id,
        anchor: { kind: 'RECT', page: 1, x: 0.9, y: 0.9, w: 0.5, h: 0.5 },
      })
      .expect(400);

    const first = (
      await p.checker.c
        .post('/api/v1/comments')
        .send({
          ownerType: 'DOCUMENT_REVISION',
          ownerId: revisionId,
          body: 'ระยะห่างท่อไม่พอ',
          reviewStepId: check.id,
          anchor: pin(1, 0.2, 0.3),
          mentions: [p.author.id],
        })
        .expect(201)
    ).body as CommentBody;
    expect(first).toMatchObject({ seq: 1, status: 'OPEN' });
    expect(first.allowedActions).toEqual(expect.arrayContaining(['edit', 'delete', 'close']));
    await p.checker.c
      .post('/api/v1/comments')
      .send({
        ownerType: 'DOCUMENT_REVISION',
        ownerId: revisionId,
        body: 'ระบุระดับน้ำ',
        reviewStepId: check.id,
        anchor: { kind: 'RECT', page: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      })
      .expect(201);
    // a general note from a project member has no workflow
    const general = (
      await p.site.c
        .post('/api/v1/comments')
        .send({ ownerType: 'DOCUMENT_REVISION', ownerId: revisionId, body: 'หน้างานขอแบบขยาย' })
        .expect(201)
    ).body as CommentBody;
    expect(general).toMatchObject({ seq: 3, status: 'NONE' });
    expect(
      await t.prisma.outboxEvent.count({
        where: { type: 'comment.created', aggregateId: first.id },
      }),
    ).toBe(1);

    const rejected = await p.checker.c
      .post(`/api/v1/review-steps/${check.id}/decision`)
      .send({ version: check.version, decision: 'REJECTED' })
      .expect(200);
    expect(rejected.body.status).toBe('DRAFT');
    expect(rejected.body.allowedActions).toContain('upload');
    expect(
      await t.prisma.outboxEvent.count({
        where: { type: 'revision.rejected', aggregateId: revisionId },
      }),
    ).toBe(1);

    // the step decided → the checker can no longer edit the comment, but can still close it
    const list = (
      await p.checker.c
        .get(`/api/v1/comments?ownerType=DOCUMENT_REVISION&ownerId=${revisionId}`)
        .expect(200)
    ).body as CommentBody[];
    expect(list.map((c) => c.seq)).toEqual([1, 2, 3]);
    const c1 = list[0]!;
    expect(c1.allowedActions).not.toContain('edit');
    const frozen = await p.checker.c
      .patch(`/api/v1/comments/${c1.id}`)
      .send({ version: c1.version, body: 'แก้ไข' })
      .expect(409);
    expect(frozen.body.code).toBe('DOC_COMMENT_NOT_EDITABLE');
  });

  it('AT-DOC-07 the preparer answers, the checker reopens then closes; CRS lists the review comments', async () => {
    const { revisionId, check } = await inReview('ถังตกตะกอน');
    const c = (
      await p.checker.c
        .post('/api/v1/comments')
        .send({
          ownerType: 'DOCUMENT_REVISION',
          ownerId: revisionId,
          body: 'เพิ่มรายละเอียดฝาย',
          reviewStepId: check.id,
          anchor: pin(1, 0.5, 0.5),
        })
        .expect(201)
    ).body as CommentBody;
    // edit and delete are the author's
    await p.author.c
      .patch(`/api/v1/comments/${c.id}`)
      .send({ version: c.version, body: 'x' })
      .expect(403);
    const edited = (
      await p.checker.c
        .patch(`/api/v1/comments/${c.id}`)
        .send({ version: c.version, body: 'เพิ่มรายละเอียดฝายน้ำล้น' })
        .expect(200)
    ).body as CommentBody;
    const stale = await p.checker.c
      .patch(`/api/v1/comments/${c.id}`)
      .send({ version: c.version, body: 'ซ้ำ' })
      .expect(409);
    expect(stale.body.code).toBe('CONFLICT_STALE_VERSION');

    await p.checker.c
      .post(`/api/v1/review-steps/${check.id}/decision`)
      .send({ version: check.version, decision: 'REJECTED' })
      .expect(200);

    // only the preparer side may answer; the reviewer cannot answer their own comment
    await p.site.c
      .post(`/api/v1/comments/${c.id}/respond`)
      .send({ version: edited.version, responseNote: 'x' })
      .expect(403);
    const responded = (
      await p.author.c
        .post(`/api/v1/comments/${c.id}/respond`)
        .send({ version: edited.version, responseNote: 'เพิ่มแบบขยายแผ่นที่ 3 แล้ว' })
        .expect(200)
    ).body as CommentBody;
    expect(responded.status).toBe('RESPONDED');
    expect(
      await t.prisma.outboxEvent.count({ where: { type: 'comment.responded', aggregateId: c.id } }),
    ).toBe(1);
    // RESPONDED cannot be answered again
    const twice = await p.author.c
      .post(`/api/v1/comments/${c.id}/respond`)
      .send({ version: responded.version, responseNote: 'อีกครั้ง' })
      .expect(409);
    expect(twice.body.code).toBe('INVALID_STATE_TRANSITION');
    // only the comment author (or document.admin) closes/reopens
    await p.author.c
      .post(`/api/v1/comments/${c.id}/close`)
      .send({ version: responded.version })
      .expect(403);
    const reopened = (
      await p.checker.c
        .post(`/api/v1/comments/${c.id}/reopen`)
        .send({ version: responded.version, note: 'ยังไม่ครบ ระบุขนาดด้วย' })
        .expect(200)
    ).body as CommentBody;
    expect(reopened.status).toBe('OPEN');
    expect(reopened.replies.map((r) => r.body)).toEqual(['ยังไม่ครบ ระบุขนาดด้วย']);
    const again = (
      await p.author.c
        .post(`/api/v1/comments/${c.id}/respond`)
        .send({ version: reopened.version, responseNote: 'ระบุขนาด 300 มม.' })
        .expect(200)
    ).body as CommentBody;
    const closed = (
      await p.checker.c
        .post(`/api/v1/comments/${c.id}/close`)
        .send({ version: again.version })
        .expect(200)
    ).body as CommentBody & { resolvedBy: { id: string } };
    expect(closed).toMatchObject({ status: 'CLOSED', resolvedBy: { id: p.checker.id } });

    // a reply from anyone in the project
    await p.author.c
      .post('/api/v1/comments')
      .send({
        ownerType: 'DOCUMENT_REVISION',
        ownerId: revisionId,
        body: 'ขอบคุณครับ',
        parentId: c.id,
      })
      .expect(201);

    const xlsx = await p.site.c
      .get(`/api/v1/revisions/${revisionId}/crs?format=xlsx`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (x: Buffer) => chunks.push(x));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as ExcelJS.Buffer);
    const values = wb.worksheets[0]!.getSheetValues().flat().map(String);
    expect(values).toEqual(
      expect.arrayContaining(['#1', 'เพิ่มรายละเอียดฝายน้ำล้น', 'ระบุขนาด 300 มม.']),
    );

    const pdf = await p.site.c
      .get(`/api/v1/revisions/${revisionId}/crs?format=pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (x: Buffer) => chunks.push(x));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.headers['content-disposition']).toContain('CRS-');
  });

  it('AT-DOC-09 BR-DOC-034 open comments move to the next revision; the original closes with a note', async () => {
    const { documentId, revisionId, check } = await inReview('ถังเติมอากาศ');
    const c = (
      await p.checker.c
        .post('/api/v1/comments')
        .send({
          ownerType: 'DOCUMENT_REVISION',
          ownerId: revisionId,
          body: 'เพิ่ม DO probe',
          reviewStepId: check.id,
        })
        .expect(201)
    ).body as CommentBody;
    const checkStep = await t.prisma.reviewStep.findUniqueOrThrow({ where: { id: check.id } });
    await p.checker.c
      .post(`/api/v1/review-steps/${check.id}/decision`)
      .send({ version: checkStep.version, decision: 'APPROVED_WITH_COMMENTS' })
      .expect(200);
    const approveStep = await t.prisma.reviewStep.findFirstOrThrow({
      where: { cycle: { revisionId }, kind: 'APPROVE' },
    });
    await p.approver.c
      .post(`/api/v1/review-steps/${approveStep.id}/decision`)
      .send({
        version: approveStep.version,
        decision: 'APPROVED',
        signature: { method: 'PASSWORD', secret: DEFAULT_PASSWORD },
      })
      .expect(200);
    await p.author.c
      .post(`/api/v1/comments/${c.id}/respond`)
      .send({ version: c.version, responseNote: 'จะเพิ่มใน Rev.0' })
      .expect(200);

    const rev0 = (
      await p.author.c
        .post(`/api/v1/documents/${documentId}/revisions`)
        .send({ purposeCode: 'FC', description: 'ออกเพื่อก่อสร้าง' })
        .expect(201)
    ).body as { id: string; openCommentCount: number };
    expect(rev0.openCommentCount).toBe(1);
    const moved = (
      await p.author.c
        .get(`/api/v1/comments?ownerType=DOCUMENT_REVISION&ownerId=${rev0.id}`)
        .expect(200)
    ).body as CommentBody[];
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ status: 'OPEN', seq: 1, carriedFromRevLabel: 'A' });
    const original = (await p.author.c.get(`/api/v1/comments/${c.id}`).expect(200))
      .body as CommentBody;
    expect(original.status).toBe('CLOSED');
  });

  it('comments of another project are 404; unsupported owners are 404', async () => {
    const { revisionId } = await inReview('ลับ');
    const outsider = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email,
    );
    await outsider
      .get(`/api/v1/comments?ownerType=DOCUMENT_REVISION&ownerId=${revisionId}`)
      .expect(404);
    await outsider.get(`/api/v1/revisions/${revisionId}/crs`).expect(404);
    await p.author.c.get(`/api/v1/comments?ownerType=LAB_JOB&ownerId=${revisionId}`).expect(404);
  });
});
