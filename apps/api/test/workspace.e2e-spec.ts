import ExcelJS from 'exceljs';
import { makeUser } from './factories/users';
import { type DesignProject, makeDesignProject, stepsFor, uploadPdf } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { startFakeGotenberg } from './utils/fake-gotenberg';
import { bearerLogin } from './utils/http';

describe('P1-12 my work, search, statistics and MDL (M04 §9, docs/07-web-ui.md §6.1)', () => {
  let t: TestApp;
  let p: DesignProject;
  let gotenberg: Awaited<ReturnType<typeof startFakeGotenberg>>;

  beforeAll(async () => {
    gotenberg = await startFakeGotenberg();
    process.env.GOTENBERG_URL = gotenberg.url;
    t = await createTestApp();
    p = await makeDesignProject(t, 'งานของฉัน');
  }, 60_000);
  afterAll(async () => {
    await t.close();
    await gotenberg.close();
  });

  it('my work shows the review inbox, comments to answer and returned drawings; search and stats respect access', async () => {
    const dca = p.templates.find((x) => x.code === 'DRAW_CHECK_APPROVE')!;
    const d = (
      await p.dc.c
        .post(`/api/v1/projects/${p.projectId}/documents`)
        .send({
          title: 'ผังบ่อเติมอากาศ',
          disciplineId: p.disciplines.PR,
          documentTypeId: p.types.DWG,
          ownerId: p.author.id,
          plans: [
            { purposeCode: 'FA', plannedDate: '2026-09-15' },
            { purposeCode: 'FC', plannedDate: '2026-11-30' },
          ],
        })
        .expect(201)
    ).body;
    const rev = (
      await p.author.c
        .post(`/api/v1/documents/${d.id}/revisions`)
        .send({ purposeCode: 'FA' })
        .expect(201)
    ).body;
    const pdf = await uploadPdf(t, p.author.c);
    let r = (
      await p.author.c
        .post(`/api/v1/revisions/${rev.id}/files`)
        .send({ fileId: pdf, role: 'PDF_RENDITION' })
        .expect(201)
    ).body;
    r = (
      await p.author.c
        .post(`/api/v1/revisions/${rev.id}/submit`)
        .send({
          version: r.version,
          steps: stepsFor(dca, { CHECK: [p.checker.id], APPROVE: [p.approver.id] }),
        })
        .expect(200)
    ).body;
    const check = r.cycles[0].steps.find((s: { kind: string }) => s.kind === 'CHECK');

    const checkerWork = (await p.checker.c.get('/api/v1/my-work').expect(200)).body;
    expect(checkerWork.reviewCount).toBe(1);
    expect(checkerWork.reviews[0]).toMatchObject({ id: check.id, documentNumber: d.number });

    await p.checker.c
      .post('/api/v1/comments')
      .send({
        ownerType: 'DOCUMENT_REVISION',
        ownerId: rev.id,
        body: 'ระบุขนาดเครื่องเติมอากาศ',
        reviewStepId: check.id,
      })
      .expect(201);
    await p.checker.c
      .post(`/api/v1/review-steps/${check.id}/decision`)
      .send({ version: check.version, decision: 'REJECTED' })
      .expect(200);

    const authorWork = (await p.author.c.get('/api/v1/my-work').expect(200)).body;
    expect(authorWork.commentsToAnswerCount).toBe(1);
    expect(authorWork.commentsToAnswer[0]).toMatchObject({
      documentNumber: d.number,
      revLabel: 'A',
    });
    expect(authorWork.returned.map((x: { revisionId: string }) => x.revisionId)).toEqual([rev.id]);
    expect((await p.checker.c.get('/api/v1/my-work').expect(200)).body.reviewCount).toBe(0);

    // search finds the document for members only
    const found = (
      await p.site.c.get(`/api/v1/search?q=${encodeURIComponent('บ่อเติมอากาศ')}`).expect(200)
    ).body;
    expect(found.documents.map((x: { id: string }) => x.id)).toEqual([d.id]);
    const byCode = (await p.site.c.get(`/api/v1/search?q=${p.projectCode}`).expect(200)).body;
    expect(byCode.projects.map((x: { id: string }) => x.id)).toContain(p.projectId);
    const outsider = await bearerLogin(
      t.app,
      (await makeUser(t.prisma, { roles: ['ENGINEER'] })).email,
    );
    const none = (await outsider.get(`/api/v1/search?q=${p.projectCode}`).expect(200)).body;
    expect(none).toMatchObject({ documents: [], projects: [] });
    await outsider.get('/api/v1/search?q=x').expect(400);

    const stats = (await p.pm.c.get(`/api/v1/projects/${p.projectId}/documents/stats`).expect(200))
      .body;
    expect(stats).toMatchObject({
      documentCount: 1,
      openComments: 1,
      byRevisionStatus: { DRAFT: 1 },
    });
    expect(stats.monthly).toEqual([
      { month: '2026-09', planned: 1, actual: 0 },
      { month: '2026-11', planned: 1, actual: 0 },
    ]);
    await outsider.get(`/api/v1/projects/${p.projectId}/documents/stats`).expect(404);

    // MDL: report.export (PM) — xlsx and PDF; FA planned 2026-09-15 and not delivered → delayed
    const xlsx = await p.pm.c
      .get(`/api/v1/projects/${p.projectId}/reports/mdl?format=xlsx`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (x: Buffer) => chunks.push(x));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as ExcelJS.Buffer);
    const row = wb.worksheets[0]!.getRow(5).values as unknown[];
    expect(row).toContain(d.number);
    expect(row[row.length - 1]).toBeGreaterThan(0);
    const pdfRes = await p.pm.c
      .get(`/api/v1/projects/${p.projectId}/reports/mdl?format=pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (x: Buffer) => chunks.push(x));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((pdfRes.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await p.site.c.get(`/api/v1/projects/${p.projectId}/reports/mdl`).expect(403);
  });
});
