import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.co.th';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'wems-admin-dev-2569';

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('user-menu')).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
}

/** Unique suffix so reruns against the same database do not collide. */
export function uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}
