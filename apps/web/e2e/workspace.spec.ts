import { expect, test } from '@playwright/test';
import { approvedDrawing, designProject, USER_PASSWORD } from './api';
import { login } from './helpers';

test.describe('P1-12 my work, search and reports (docs/07-web-ui.md §6.1)', () => {
  test.setTimeout(120_000);

  test('search finds the drawing; the overview exports the MDL; my work and reviews render', async ({
    page,
    request,
  }) => {
    const p = await designProject(request);
    const a = await approvedDrawing(request, p, 'ผังสถานีสูบน้ำดิบ', 'FA');

    await login(page, p.pm.email, USER_PASSWORD);
    await expect(page.getByTestId('work-reviews')).toBeVisible();
    await page.getByTestId('global-search').fill('สถานีสูบน้ำดิบ');
    await page.getByTestId('global-search').press('Enter');
    await page.getByTestId(`search-doc-${a.number}`).click();
    await expect(page.getByTestId('document-number')).toHaveText(a.number);

    await page.goto(`/projects/${p.projectId}`);
    await expect(page.getByTestId('delivery-card')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByTestId('mdl-xlsx').click();
    expect((await download).suggestedFilename()).toMatch(/^MDL-.*\.xlsx$/);

    await page.goto('/reviews');
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});
