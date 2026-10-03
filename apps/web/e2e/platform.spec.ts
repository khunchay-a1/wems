import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, login, logout, uniq } from './helpers';

test.describe('M01 platform', () => {
  // Roadmap P0-13 acceptance flow (docs/10-roadmap.md)
  test('P0-13 admin creates a user; the user signs in with the temporary password and must change it', async ({
    page,
  }) => {
    const email = `e2e.${uniq()}@example.co.th`;
    const newPassword = 'river-sediment-basin-2569';

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.getByTestId('nav-users').click();
    await page.getByTestId('new-user').click();
    await page.getByTestId('new-user-email').fill(email);
    await page.getByTestId('new-user-name').fill('ผู้ทดสอบ อัตโนมัติ');
    await page.getByTestId('new-user-role-ENGINEER').click();
    await page.getByTestId('new-user-submit').click();
    const temp = (await page.getByTestId('temp-password').innerText()).trim();
    expect(temp.length).toBeGreaterThanOrEqual(12);
    await page.getByTestId('temp-password-close').click();
    // many users exist after repeated runs: filter the list
    await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
    await expect(page.getByTestId(`user-row-${email}`)).toBeVisible();
    await logout(page);

    await login(page, email, temp);
    await expect(page).toHaveURL(/\/profile\/password/);
    await page.getByTestId('current-password').fill(temp);
    await page.getByTestId('new-password').fill(newPassword);
    await page.getByTestId('confirm-password').fill(newPassword);
    await page.getByTestId('change-password-submit').click();
    await expect(page).toHaveURL(/\/$/);
    await logout(page);

    await login(page, email, newPassword);
    await expect(page).not.toHaveURL(/\/profile\/password/);
  });

  test('P0-13 wrong password shows a problem message', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(ADMIN_EMAIL);
    await page.getByTestId('login-password').fill('definitely-not-the-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('problem-alert')).toBeVisible();
  });
});
