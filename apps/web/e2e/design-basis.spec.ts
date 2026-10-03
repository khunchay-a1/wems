import { expect, test } from '@playwright/test';
import { designProject, USER_PASSWORD } from './api';
import { login, logout } from './helpers';

test.describe('P1-11 design basis on the web (docs/07-web-ui.md §6.7)', () => {
  test.setTimeout(120_000);

  test('BR-DOC-082 BR-DOC-083 the engineer fills a draft; the PM approves with a signature', async ({
    page,
    request,
  }) => {
    const p = await designProject(request);
    await login(page, p.author.email, USER_PASSWORD);
    await page.goto(`/projects/${p.projectId}/design-basis`);
    await page.getByTestId('dbs-create').click();
    await expect(page.getByTestId('dbs-status')).toContainText(/ร่าง|Draft/);
    await page.getByTestId('dbs-flow').fill('1500.25');
    await page.getByTestId('dbs-add-item').click();
    const param = page.getByTestId('dbs-param-0');
    const value = await param.locator('option', { hasText: /^BOD5 ·/ }).getAttribute('value');
    await param.selectOption(value!);
    await page.getByTestId('dbs-influent-0').fill('250');
    await page.getByTestId('dbs-target-0').fill('20');
    await page.getByTestId('dbs-source-0').selectOption('MEASURED');
    await page.getByTestId('dbs-save').click();
    // BR-DOC-082: measured values need a source
    await expect(page.getByTestId('problem-alert')).toBeVisible();
    await page.getByTestId('dbs-note-0').fill('ผลแล็บ 3 ครั้ง');
    await page.getByTestId('dbs-save').click();
    await expect(page.getByTestId('problem-alert')).toHaveCount(0);
    await logout(page);

    await login(page, p.pm.email, USER_PASSWORD);
    await page.goto(`/projects/${p.projectId}/design-basis`);
    await page.getByTestId('dbs-approve').click();
    await page.getByTestId('signature-secret').fill(USER_PASSWORD);
    await page.getByTestId('signature-confirm').click();
    await expect(page.getByTestId('dbs-status')).toContainText(/อนุมัติ|Approved/);
    await expect(page.getByTestId('dbs-new')).toBeEnabled();
  });
});
