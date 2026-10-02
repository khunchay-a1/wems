import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { PdfService } from '../src/common/pdf/pdf.service';
import { StampService } from '../src/common/pdf/stamp.service';
import { makePdf } from './fixtures/pdf';
import { createTestApp, type TestApp } from './utils/app';
import { startFakeGotenberg } from './utils/fake-gotenberg';

const THAI = [
  'ระบบบำบัดน้ำเสียแบบตะกอนเร่งชนิดเติมอากาศขยายเวลา ออกแบบให้รองรับอัตราการไหลเฉลี่ยวันละห้าร้อยลูกบาศก์เมตร โดยมีถังปรับสภาพการไหล ถังเติมอากาศ ถังตกตะกอน และถังฆ่าเชื้อโรคด้วยคลอรีน',
  'ผู้รับจ้างต้องตรวจสอบระดับท่อระบายน้ำทิ้งกับแบบก่อสร้างจริงก่อนติดตั้งเครื่องสูบน้ำ และต้องจัดทำรายงานผลการทดสอบคุณภาพน้ำทิ้งตามประกาศกระทรวงอุตสาหกรรมทุกเดือนตลอดระยะเวลารับประกันผลงาน',
];

function pdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  writeFileSync(join(dir, 'x.pdf'), pdf);
  return execFileSync('pdftotext', ['-enc', 'UTF-8', join(dir, 'x.pdf'), '-']).toString('utf8');
}
const squash = (s: string) => s.replace(/\s+/g, '');

describe('P0-11 PDF', () => {
  let t: TestApp;
  let gotenberg: Awaited<ReturnType<typeof startFakeGotenberg>>;
  beforeAll(async () => {
    gotenberg = await startFakeGotenberg();
    process.env.GOTENBERG_URL = gotenberg.url;
    t = await createTestApp();
  }, 60_000);
  afterAll(async () => {
    await t.close();
    await gotenberg.close();
  });

  it('long Thai paragraphs render with Sarabun and extract back exactly (word-wrap keeps every character)', async () => {
    const pdf = await t.app.get(PdfService).render(
      'test-document',
      {
        title: 'ทดสอบการตัดคำภาษาไทย',
        companyName: 'บริษัท ตัวอย่าง วิศวกรรมน้ำ จำกัด',
        date: '28 ก.ย. 2569',
        paragraphs: Array(12).fill(THAI).flat(),
      },
      { footerLeft: 'TEST-001' },
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const text = pdfText(pdf);
    for (const p of THAI) expect(squash(text)).toContain(squash(p));
    expect(text).toContain('TEST-001');
    expect(text).toMatch(/\b1\s*\/\s*\d+\b/);
  }, 60_000);

  it('BR-DOC-070 stamps: Latin box via pdf-lib, Thai watermark via Chromium snippet — original untouched', async () => {
    const stamps = t.app.get(StampService);
    const original = makePdf(2, 'drawing');
    const boxed = await stamps.stamp(original, {
      kind: 'box',
      lines: ['APPROVED FOR CONSTRUCTION · Rev.0', '28/09/2569 · Somchai J. · Ref 0190f0c4'],
      color: 'green',
    });
    expect(pdfText(boxed)).toContain('APPROVED FOR CONSTRUCTION');
    const before = gotenberg.requests;
    const superseded = await stamps.stamp(original, {
      kind: 'watermark',
      text: 'SUPERSEDED – ฉบับเก่า ห้ามใช้',
      color: 'red',
    });
    expect(gotenberg.requests).toBe(before + 1);
    expect(squash(pdfText(superseded))).toContain(squash('ฉบับเก่า ห้ามใช้'));
    expect((await PDFDocument.load(superseded)).getPageCount()).toBe(2);
    expect(pdfText(original)).not.toContain('SUPERSEDED');
  }, 60_000);
});
