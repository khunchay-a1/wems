import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { type DesignProject, makeDesignProject } from './factories/projects';
import { createTestApp, type TestApp } from './utils/app';
import { uploadFile } from './utils/files';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function workbook(rows: Record<string, string>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('documents');
  const cols = ['number', 'title', 'discipline', 'type', 'ownerEmail', 'tags', 'planFA', 'planFC'];
  ws.columns = cols.map((c) => ({ header: c, key: c }));
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('P1-05 Excel import and export of the register', () => {
  let t: TestApp;
  let p: DesignProject;
  beforeAll(async () => {
    t = await createTestApp();
    p = await makeDesignProject(t, 'นำเข้า Excel');
  }, 60_000);
  afterAll(() => t.close());

  async function upload(body: Buffer) {
    const id = await uploadFile(t.app, p.dc.c, 'mdl.xlsx', body, {
      purpose: 'IMPORT',
      mimeType: XLSX,
    });
    await t.prisma.fileObject.update({
      where: { id },
      data: { status: 'AVAILABLE', sha256: createHash('sha256').update(body).digest('hex') },
    });
    return id;
  }

  it('AT-DOC-02 BR-DOC-015 50 rows with one bad discipline code → nothing saved, the bad row is reported', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      title: `แบบนำเข้า ${i + 1}`,
      discipline: i === 37 ? 'ZZ' : 'PR',
      type: 'DWG',
    }));
    const fileId = await upload(await workbook(rows));
    const res = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents/import`)
      .send({ fileId, dryRun: false })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'IMPORT_INVALID_ROWS', rule: 'BR-DOC-015' });
    expect(res.body.errors).toEqual([
      { field: 'discipline', column: 'discipline', row: 39, code: 'UNKNOWN_CODE' },
    ]);
    expect(await t.prisma.document.count({ where: { projectId: p.projectId } })).toBe(0);
  });

  it('dry-run then commit; owners must be members; plans saved', async () => {
    const body = await workbook([
      {
        title: 'ผังบริเวณ',
        discipline: 'PR',
        type: 'DWG',
        ownerEmail: p.author.email,
        planFA: '2026-11-01',
        planFC: '2026-12-01',
        tags: 'layout, site',
      },
      { title: 'รายการคำนวณ', discipline: 'PR', type: 'RPT' },
    ]);
    const fileId = await upload(body);
    const dry = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents/import`)
      .send({ fileId, dryRun: true })
      .expect(200);
    expect(dry.body).toMatchObject({ dryRun: true, count: 2 });
    expect(await t.prisma.document.count({ where: { projectId: p.projectId } })).toBe(0);
    const done = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents/import`)
      .send({ fileId, dryRun: false })
      .expect(200);
    expect(done.body.rows.map((r: { number: string }) => r.number)).toEqual([
      `${p.projectCode}-PR-DWG-001`,
      `${p.projectCode}-PR-RPT-001`,
    ]);
    const doc = await t.prisma.document.findFirstOrThrow({
      where: { number: `${p.projectCode}-PR-DWG-001` },
      include: { plans: true },
    });
    expect(doc).toMatchObject({ ownerId: p.author.id, tags: ['layout', 'site'] });
    expect(doc.plans).toHaveLength(2);
  });

  it('BR-DOC-016 explicit numbers need document.admin', async () => {
    const fileId = await upload(
      await workbook([{ number: 'OLD-001', title: 'แบบเดิม', discipline: 'PR', type: 'DWG' }]),
    );
    const res = await p.dc.c
      .post(`/api/v1/projects/${p.projectId}/documents/import`)
      .send({ fileId, dryRun: true })
      .expect(422);
    expect(res.body.errors[0]).toMatchObject({ column: 'number', code: 'DOCUMENT_ADMIN_REQUIRED' });
  });

  it('export and template are .xlsx', async () => {
    const exp = await p.pm.c
      .get(`/api/v1/projects/${p.projectId}/documents/export`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(exp.headers['content-type']).toContain(XLSX);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exp.body as ExcelJS.Buffer);
    expect(wb.worksheets[0]!.rowCount).toBe(3);
    // DOCUMENT_CONTROLLER has report.export; SITE_STAFF does not
    await p.site.c.get(`/api/v1/projects/${p.projectId}/documents/export`).expect(403);
    await p.dc.c.get(`/api/v1/projects/${p.projectId}/documents/import-template`).expect(200);
  });
});
