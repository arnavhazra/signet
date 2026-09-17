import {
  completeHighDeltaTwoHumans,
  expect,
  goInbox,
  highDeltaRow,
  inboxRows,
  kernelTimeout,
  readyConsole,
  resetDemo,
  test,
} from './helpers';

test.describe('Inbox', () => {
  test('seeds mixed rows with a unique A-214 tour account', async ({ page }) => {
    await readyConsole(page);
    await expect(page.getByRole('heading', { name: 'Exception review' })).toBeVisible();
    await expect(page.locator('.frame')).toContainText('What this kernel does');
    await expect(page.locator('.thesis')).toContainText('Ingest.');
    await expect(page.locator('.thesis')).toContainText('Halt.');
    await expect(page.locator('.thesis')).toContainText('Audited write.');

    const rows = inboxRows(page);
    await expect(rows).toHaveCount(4);
    const accounts = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-account') || ''),
    );
    expect(accounts.filter((id) => id === 'A-214')).toHaveLength(1);
    expect(new Set(accounts).size).toBe(accounts.length);

    const tour = highDeltaRow(page);
    await expect(tour).toHaveAttribute('data-account', 'A-214');
    await expect(tour).toHaveAttribute('data-workflow', 'exception-review');
    await expect(page.locator('[data-testid="inbox-row"][data-workflow="nav-signoff"]')).toHaveCount(1);
  });

  test('spent high-delta queue shows a reset CTA that reseeds', async ({ page }) => {
    await readyConsole(page);
    await completeHighDeltaTwoHumans(page);
    await goInbox(page);
    await expect(highDeltaRow(page)).toHaveCount(0);
    const cta = page.getByRole('status').filter({ hasText: /Reset the demo to reseed/ });
    await expect(cta).toBeVisible();
    await cta.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.getByTestId('reset-confirm')).toBeVisible();
    await page.getByTestId('reset-confirm').click();
    await expect(highDeltaRow(page)).toBeVisible({ timeout: kernelTimeout() });
    await expect(highDeltaRow(page)).toHaveAttribute('data-account', 'A-214');
  });

  test('rail reset confirm reseeds without a native dialog', async ({ page }) => {
    await readyConsole(page);
    await resetDemo(page);
    await expect(highDeltaRow(page)).toHaveAttribute('data-account', 'A-214');
  });
});
