import { StorageService } from '../src/common/files/storage.service';
import { RealtimePublisher } from '../src/common/realtime/realtime.publisher';
import { FileProcessingHandler } from '../src/worker/handlers/file-processing.handler';
import { makeUser } from './factories/users';
import { makePdf } from './fixtures/pdf';
import { createTestApp, type TestApp } from './utils/app';
import { uploadFile } from './utils/files';
import { bearerLogin } from './utils/http';

describe('P0-09 files', () => {
  let t: TestApp;
  let processor: FileProcessingHandler;
  beforeAll(async () => {
    t = await createTestApp();
    await t.app.get(StorageService).ensureBucket();
    processor = new FileProcessingHandler(
      t.prisma,
      t.app.get(StorageService),
      t.clock,
      t.app.get(RealtimePublisher),
    );
  });
  afterAll(() => t.close());

  it('presigned upload → complete → worker → AVAILABLE with sha256, page count and preview', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    const pdf = makePdf(3);
    const id = await uploadFile(t.app, c, 'แบบ ถังตกตะกอน.pdf', pdf, { process: processor });
    const file = await c.get(`/api/v1/files/${id}`).expect(200);
    expect(file.body).toMatchObject({
      status: 'AVAILABLE',
      pageCount: 3,
      hasPreview: true,
      mimeType: 'application/pdf',
    });
    expect(file.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    const dl = await c.get(`/api/v1/files/${id}/download-url`).expect(200);
    const got = await fetch(dl.body.url);
    expect(got.status).toBe(200);
    expect(Buffer.from(await got.arrayBuffer()).equals(pdf)).toBe(true);
    expect(got.headers.get('content-disposition')).toContain(
      encodeURIComponent('แบบ ถังตกตะกอน.pdf'),
    );
    const pv = await c.get(`/api/v1/files/${id}/preview-url`).expect(200);
    const png = Buffer.from(await (await fetch(pv.body.url)).arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });

  it('AT-PLT-05 an .exe renamed to .pdf is REJECTED and cannot be used', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    const exe = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(2000, 1)]);
    const id = await uploadFile(t.app, c, 'drawing.pdf', exe, { process: processor });
    const file = await c.get(`/api/v1/files/${id}`).expect(200);
    expect(file.body).toMatchObject({ status: 'REJECTED', rejectReason: 'EXECUTABLE' });
    await c.get(`/api/v1/files/${id}/download-url`).expect(422);
  });

  it('rejects disallowed extensions and oversize uploads up front', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    await c
      .post('/api/v1/files/upload-url')
      .send({
        originalName: 'virus.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 10,
        purpose: 'ATTACHMENT',
      })
      .expect(415)
      .expect((r) => expect(r.body.code).toBe('UNSUPPORTED_FILE_TYPE'));
    await c
      .post('/api/v1/files/upload-url')
      .send({
        originalName: 'sig.png',
        mimeType: 'image/png',
        sizeBytes: 3 * 1024 * 1024,
        purpose: 'SIGNATURE_IMAGE',
      })
      .expect(413)
      .expect((r) => expect(r.body.code).toBe('FILE_TOO_LARGE'));
  });

  it('complete before the PUT → 409 FILE_NOT_UPLOADED; files are private to the uploader', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    const res = await c
      .post('/api/v1/files/upload-url')
      .send({
        originalName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        purpose: 'DOCUMENT_REVISION',
      })
      .expect(201);
    await c.post(`/api/v1/files/${res.body.fileId}/complete`).expect(409);
    const other = await bearerLogin(t.app, (await makeUser(t.prisma)).email);
    await other.get(`/api/v1/files/${res.body.fileId}`).expect(404);
  });

  it('a corrupt PDF is rejected', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    const id = await uploadFile(t.app, c, 'broken.pdf', Buffer.from('%PDF-1.4\ngarbage only'), {
      process: processor,
    });
    const file = await c.get(`/api/v1/files/${id}`).expect(200);
    expect(file.body).toMatchObject({ status: 'REJECTED', rejectReason: 'CORRUPT_PDF' });
  });

  it('attachments need a registered owner type', async () => {
    const u = await makeUser(t.prisma);
    const c = await bearerLogin(t.app, u.email);
    await c
      .get('/api/v1/attachments?ownerType=QUOTATION&ownerId=0190f0c4-0000-7000-8000-000000000001')
      .expect(400);
  });
});
