import { expect, type Page, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { designProject, makePdf, USER_PASSWORD } from './api';
import { login, logout } from './helpers';

/** E2E_SCREENSHOTS=<dir> saves screens for the docs (docs/samples). */
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SCREENSHOTS)
    await page.screenshot({ path: join(process.env.E2E_SCREENSHOTS, `${name}.png`) });
};

const dir = mkdtempSync(join(tmpdir(), 'wems-e2e-'));
const pdfFile = (name: string, pages: number) => {
  const p = join(dir, name);
  writeFileSync(p, makePdf(pages, name.replace(/\W/g, '')));
  return p;
};

/** selectOption by visible text (Playwright matches labels exactly). */
async function choose(page: Page, testId: string, text: string | RegExp) {
  const select = page.getByTestId(testId);
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value!);
}

async function uploadPdf(page: Page, file: string) {
  await page.getByTestId('file-role').selectOption('PDF_RENDITION');
  await page.getByTestId('revision-uploader-input').setInputFiles(file);
  // processed by the worker → AVAILABLE, then attached to the revision
  await expect(page.getByTestId('upload-item').last()).toHaveAttribute('data-state', 'done', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('revision-files')).toContainText(file.split('/').pop()!);
}

async function pinComment(page: Page, x: number, y: number, body: string) {
  await page.getByTestId('add-mode').click();
  const layer = page.getByTestId('pdf-layer');
  const box = (await layer.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.getByTestId('comment-body').fill(body);
  await page.getByTestId('comment-save').click();
  await expect(page.getByTestId('comment-list')).toContainText(body);
}

test.describe('P1-09 documents on the web (M04, docs/07-web-ui.md §6.2–6.5)', () => {
  test.setTimeout(240_000);

  test('AT-DOC-06 AT-DOC-07 register, upload, submit, pin comments, reject, answer, resubmit and sign the approval', async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const p = await designProject(request);
    const docs = `/projects/${p.projectId}/documents`;

    // ── author registers a drawing with Rev.A (FR) and uploads the PDF ──
    await login(page, p.author.email, USER_PASSWORD);
    await page.goto(docs);
    await page.getByTestId('new-document').click();
    await choose(page, 'doc-discipline', /^PR ·/);
    await choose(page, 'doc-type', /^DWG ·/);
    await expect(page.getByTestId('number-preview')).toHaveText(`${p.projectCode}-PR-DWG-001`);
    await page.getByTestId('doc-title').fill('แผนผังระบบบำบัด');
    await page.getByTestId('doc-with-revision').click();
    await page.getByTestId('doc-submit').click();
    await expect(page.getByTestId('document-number')).toHaveText(`${p.projectCode}-PR-DWG-001`);
    await expect(page.getByTestId('revision-label')).toHaveText('Rev.A');
    // AT-DOC-03 in the UI: submit is blocked until there is a PDF
    await expect(page.getByTestId('submit-review')).toBeDisabled();
    await uploadPdf(page, pdfFile('A-v1.pdf', 2));
    await expect(page.getByTestId('submit-review')).toBeEnabled();

    // ── submit: the author is greyed out for CHECK (separation of duties) ──
    await page.getByTestId('submit-review').click();
    const check = page.getByTestId('assignee-CHECK');
    await expect(check.locator('option', { hasText: p.author.name })).toBeDisabled();
    await choose(page, 'assignee-CHECK', p.checker.name);
    await choose(page, 'assignee-APPROVE', p.approver.name);
    await page.getByTestId('submit-confirm').click();
    await expect(page.getByTestId('revision-status')).toContainText(
      /IN_REVIEW|กำลังตรวจ|In review/,
    );
    const docUrl = page.url();
    await logout(page);

    // ── AT-DOC-06 checker pins two comments and returns the drawing ──
    await login(page, p.checker.email, USER_PASSWORD);
    await page.goto(docUrl);
    await page.getByTestId('open-review').click();
    await expect(page.getByTestId('my-step')).toBeVisible();
    await expect(page.getByTestId('pdf-layer')).toBeVisible({ timeout: 30_000 });
    await pinComment(page, 0.3, 0.3, 'ระยะห่างท่อไม่พอ');
    await page.getByTestId('thumb-2').click();
    await expect(page.getByTestId('pdf-page')).toContainText('2');
    await pinComment(page, 0.6, 0.5, 'ระบุระดับน้ำ');
    await expect(page.getByTestId('comment-1')).toHaveAttribute('data-status', 'OPEN');
    await shot(page, 'web-review');
    await page.getByTestId('decide-REJECTED').click();
    await page.getByTestId('decision-confirm').click();
    await expect(page.getByTestId('revision-status')).toContainText(/DRAFT|ร่าง|Draft/);
    await logout(page);

    // ── AT-DOC-07 author answers both comments, uploads v2 and resubmits ──
    await login(page, p.author.email, USER_PASSWORD);
    await page.goto(docUrl);
    await page.getByTestId('open-review').click();
    for (const n of [1, 2]) {
      const card = page.getByTestId(`comment-${n}`);
      await card.getByTestId('comment-respond').click();
      await card.getByTestId('comment-action-text').fill(`แก้ไขข้อ ${n} แล้ว`);
      await card.getByTestId('comment-action-confirm').click();
      await expect(card).toHaveAttribute('data-status', 'RESPONDED');
    }
    await page.goto(docUrl);
    await uploadPdf(page, pdfFile('A-v2.pdf', 3));
    await page.getByTestId('submit-review').click();
    await choose(page, 'assignee-CHECK', p.checker.name);
    await choose(page, 'assignee-APPROVE', p.approver.name);
    await page.getByTestId('submit-confirm').click();
    await expect(page.getByTestId('cycle-2')).toBeVisible();
    await logout(page);

    // ── checker accepts the answers and passes the drawing ──
    await login(page, p.checker.email, USER_PASSWORD);
    await page.goto(docUrl);
    await page.getByTestId('open-review').click();
    for (const n of [1, 2]) {
      const card = page.getByTestId(`comment-${n}`);
      await card.getByTestId('comment-close').click();
      await card.getByTestId('comment-action-confirm').click();
      await expect(card).toHaveAttribute('data-status', 'CLOSED');
    }
    await page.getByTestId('decide-APPROVED').click();
    await page.getByTestId('decision-confirm').click();
    await expect(page.getByTestId('cycle-2').getByTestId('step-APPROVE')).toContainText(
      /ACTIVE|กำลังดำเนินการ|Active|รอ/,
    );
    await logout(page);

    // ── approver signs with the PIN ──
    await login(page, p.approver.email, USER_PASSWORD);
    await page.goto(docUrl);
    await page.getByTestId('open-review').click();
    await page.getByTestId('decide-APPROVED').click();
    await page.getByTestId('decision-confirm').click();
    await page.getByTestId('signature-secret').fill('246810');
    await page.getByTestId('signature-confirm').click();
    await expect(page.getByTestId('revision-status')).toContainText(/APPROVED|อนุมัติ|Approved/);
    await expect(page.getByTestId('cycle-2').getByTestId('step-APPROVE')).toContainText(
      /ลงนามแล้ว|Signed/,
    );
    await shot(page, 'web-document');
    await page.goto(docs);
    await expect(page.getByTestId(`document-row-${p.projectCode}-PR-DWG-001`)).toBeVisible();
    await shot(page, 'web-register');
    expect(errors).toEqual([]);
  });
});
