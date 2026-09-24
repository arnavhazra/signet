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

  test('queue chips filter by workflow and status', async ({ page }) => {
    await readyConsole(page);
    const chips = page.getByRole('group', { name: 'Queue filters' });
    await expect(chips.getByTestId('inbox-filter-all')).toHaveAttribute('aria-pressed', 'true');

    await chips.getByTestId('inbox-filter-exception-review').click();
    const exceptionRows = inboxRows(page);
    await expect(exceptionRows).toHaveCount(3);
    const exceptionWorkflows = await exceptionRows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-workflow') || ''),
    );
    expect(new Set(exceptionWorkflows)).toEqual(new Set(['exception-review']));
    await expect(highDeltaRow(page)).toBeVisible();
    await expect(page.locator('[data-testid="inbox-row"][data-account="A-NAV"]')).toHaveCount(0);

    await chips.getByTestId('inbox-filter-nav-signoff').click();
    await expect(inboxRows(page)).toHaveCount(1);
    await expect(inboxRows(page)).toHaveAttribute('data-workflow', 'nav-signoff');
    await expect(inboxRows(page)).toHaveAttribute('data-account', 'A-NAV');

    await chips.getByTestId('inbox-filter-open').click();
    const openRows = inboxRows(page);
    await expect(openRows).toHaveCount(4);
    const statuses = await openRows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-status') || ''));
    expect(new Set(statuses)).toEqual(new Set(['open']));

    await chips.getByTestId('inbox-filter-done').click();
    await expect(page.getByText('No rows for this filter.')).toBeVisible();
  });

  test('New mismatch injects a unique session', async ({ page }) => {
    await readyConsole(page);
    await expect(inboxRows(page)).toHaveCount(4);
    await page.getByTestId('inbox-inject').click();
    await expect(page.getByRole('heading', { name: /A-[0-9A-F]+ · US0378331005/ })).toBeVisible({
      timeout: kernelTimeout(),
    });
    const heading = await page.getByRole('heading').first().innerText();
    const account = heading.split(' · ')[0];
    await goInbox(page);
    await expect(inboxRows(page)).toHaveCount(5);
    await expect(page.locator(`[data-testid="inbox-row"][data-account="${account}"]`)).toHaveCount(1);
  });
});
