import { expect, test } from '@playwright/test';
import { approvedDrawing, designProject, USER_PASSWORD } from './api';
import { login } from './helpers';

test.describe('P1-10 transmittals on the web (docs/07-web-ui.md §6.6, §7)', () => {
  test.setTimeout(180_000);

  test('AT-DOC-10 AT-DOC-11 create, add an approved drawing, send as a link, download from /t/<token>, revoke', async ({
    page,
    browser,
    request,
  }) => {
    const p = await designProject(request);
    const a = await approvedDrawing(request, p, 'แผนผังโรงกรองน้ำ');
    page.on('dialog', (d) => void d.accept());

    await login(page, p.pm.email, USER_PASSWORD);
    await page.goto(`/projects/${p.projectId}/transmittals`);
    await page.getByTestId('new-transmittal').click();
    await page.getByTestId('trn-subject').fill('ส่งแบบเพื่อก่อสร้าง');
    await page.getByTestId('trn-purpose').selectOption('FC');
    await page.getByTestId('trn-method').selectOption('EMAIL_LINK');
    await page.getByTestId('trn-emails').fill('client@example.co.th');
    await page.getByTestId('trn-create').click();
    await expect(page.getByTestId('trn-number')).toHaveText(`TR-${p.projectCode}-001`);
    await expect(page.getByTestId('trn-send')).toBeDisabled();

    await page.getByTestId('trn-add-items').click();
    await page.getByTestId(`trn-pick-${a.number}-0`).click();
    await page.getByTestId('trn-pick-confirm').click();
    await expect(page.getByTestId(`trn-item-${a.number}`)).toBeVisible();
    await page.getByTestId('trn-send').click();
    await expect(page.getByTestId('trn-status')).toContainText(/ส่งแล้ว|Sent/);
    const url = (await page.getByTestId('trn-public-url').innerText()).trim();
    expect(url).toMatch(/\/t\/[\w-]+$/);
    // the worker builds the cover sheet and the ZIP
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('trn-cover')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    // the client opens the link without logging in
    const anon = await browser.newContext();
    const client = await anon.newPage();
    const publicPath = new URL(url).pathname;
    await client.goto(publicPath);
    await expect(client.getByTestId('public-number')).toHaveText(`TR-${p.projectCode}-001`);
    await expect(client.getByTestId('public-download-all')).toBeVisible();
    const req = client.waitForRequest(
      (r) => r.url().includes('/download') && r.url().includes('/api/v1/public/'),
    );
    await client.getByTestId(`public-download-${a.number}`).click();
    await req;
    await page.reload();
    await expect(page.getByTestId('trn-downloads')).toContainText('.pdf');

    // revoke → the page says the link expired and whom to contact
    await page.getByTestId('trn-revoke').click();
    await expect(page.getByText(/เพิกถอนแล้ว|Revoked/)).toBeVisible();
    await client.goto(publicPath);
    await expect(client.getByTestId('public-expired')).toContainText(p.pm.email);
    await anon.close();
  });
});
