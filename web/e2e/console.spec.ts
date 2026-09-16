import { expect, test, type Page } from '@playwright/test';

async function clickRow(page: Page, predicate: (delta: number, status: string) => boolean) {
  await page.goto('/');
  await expect(page.getByTestId('inbox-table')).toBeVisible();
  const rows = page.getByTestId('inbox-row');
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const delta = Number(await row.getAttribute('data-delta'));
    const status = (await row.getAttribute('data-status')) || '';
    if (predicate(delta, status)) {
      await row.click();
      return row;
    }
  }
  throw new Error('No matching inbox row');
}

test.describe('Signet console', () => {
  test('high-delta maker-checker writes remediation with two humans', async ({ page }) => {
    await clickRow(page, (delta, status) => Math.abs(delta) >= 100 && status === 'open');
    await expect(page.getByTestId('action-accept_adjustment')).toBeVisible();
    await page.getByTestId('action-accept_adjustment').click();
    await expect(page.getByText('Waiting on checker.')).toBeVisible();
    await page.getByTestId('role-checker').click();
    await expect(page.getByTestId('action-accept_adjustment')).toBeVisible();
    await page.getByTestId('action-accept_adjustment').click();
    await expect(page.getByText(/Accepted|Session completed/)).toBeVisible();

    const sessionUrl = page.url();
    const sessionId = sessionUrl.split('/sessions/')[1]?.split('/')[0];
    expect(sessionId).toBeTruthy();

    await page.goto('/audit');
    await page.getByLabel('Session').fill(sessionId!);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('Remediation written')).toBeVisible();
    await expect(page.getByText(/Decision · checker/)).toBeVisible();
  });

  test('low-delta accept is a single step', async ({ page }) => {
    await clickRow(page, (delta, status) => Math.abs(delta) < 100 && delta !== 0 && status === 'open');
    await expect(page.getByTestId('action-accept_adjustment')).toBeVisible();
    await page.getByTestId('action-accept_adjustment').click();
    await expect(page.getByText(/Accepted|Session completed/)).toBeVisible();
    await expect(page.getByText('Waiting on checker.')).toHaveCount(0);
  });

  test('replay shows stripped version JSON', async ({ page }) => {
    await clickRow(page, (_delta, status) => status === 'open' || status === 'done' || status === 'awaiting_checker');
    await page.getByRole('link', { name: 'Replay' }).click();
    await expect(page.getByTestId('replay-stripped')).toBeVisible();
    const text = await page.getByTestId('replay-stripped').innerText();
    expect(text).toContain('exception-review');
    expect(text).not.toContain('"binding"');
  });

  test('admin stripped contract has no binding keys', async ({ page }) => {
    await page.goto('/admin');
    await page.getByTestId('role-admin').click();
    await page.getByTestId('workflow-exception-review').click();
    await page.getByTestId('fetch-stripped').click();
    const contract = page.getByTestId('stripped-contract');
    await expect(contract).toBeVisible();
    const text = await contract.innerText();
    expect(text).not.toContain('"binding"');
    expect(text).not.toContain('filter_value');
  });
});
