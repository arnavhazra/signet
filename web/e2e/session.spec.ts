import {
  acceptAdjustment,
  clickMatchingRow,
  expect,
  expectSessionAccepted,
  highDeltaRow,
  kernelTimeout,
  readyConsole,
  sessionIdFromUrl,
  switchRole,
  test,
} from './helpers';

test.describe('Session', () => {
  test('high-delta maker-checker writes remediation with two humans', async ({ page }) => {
    await readyConsole(page);
    await highDeltaRow(page).click();
    await acceptAdjustment(page);
    await expect(page.getByText(/Waiting on checker/)).toBeVisible();
    await switchRole(page, 'checker');
    await acceptAdjustment(page);
    await expectSessionAccepted(page);
    await expect(page.locator('[data-event-type="remediation.written"]')).toBeVisible();
    await expect(page.getByText('Decision · operator')).toBeVisible();
    await expect(page.getByText('Decision · checker')).toBeVisible();
  });

  test('operator on the checker node is 403 until checker approves', async ({ page }) => {
    await readyConsole(page);
    await highDeltaRow(page).click();
    await acceptAdjustment(page);
    await expect(page.getByText('Second control. Maker already accepted.')).toBeVisible();
    await acceptAdjustment(page);
    await expect(page.getByRole('alert')).toContainText(/checker role required/i);
    await expect(page.locator('[data-event-type="remediation.written"]')).toHaveCount(0);
    await switchRole(page, 'checker');
    await acceptAdjustment(page);
    await expectSessionAccepted(page);
    await expect(page.locator('[data-event-type="remediation.written"]')).toBeVisible();
  });

  test('low-delta accept is a single human', async ({ page }) => {
    await readyConsole(page);
    await clickMatchingRow(
      page,
      (row) =>
        row.workflow === 'exception-review' &&
        row.status === 'open' &&
        Number.isFinite(row.delta) &&
        row.delta !== 0 &&
        Math.abs(row.delta) < 100,
    );
    await acceptAdjustment(page);
    await expectSessionAccepted(page);
    await expect(page.getByText('Waiting on checker.')).toHaveCount(0);
    await expect(page.locator('[data-event-type="remediation.written"]')).toBeVisible();
    await expect(page.getByText('Decision · operator')).toBeVisible();
    await expect(page.getByText('Decision · checker')).toHaveCount(0);
  });

  test('reject closes with no remediation', async ({ page }) => {
    await readyConsole(page);
    await clickMatchingRow(
      page,
      (row) => row.workflow === 'exception-review' && row.status === 'open' && Math.abs(row.delta) < 100,
    );
    await page.getByTestId('action-reject').click();
    await expect(page.getByText(/Rejected. No remediation/)).toBeVisible();
    await expect(page.locator('[data-event-type="remediation.written"]')).toHaveCount(0);
  });

  test('header is account · CUSIP · workflow with UUID subtitle', async ({ page }) => {
    await readyConsole(page);
    await highDeltaRow(page).click();
    await expect(page.getByRole('heading', { name: 'A-214 · US5949181045 · exception-review' })).toBeVisible({
      timeout: kernelTimeout(),
    });
    const sessionId = sessionIdFromUrl(page);
    await expect(page.locator('.lede--mono')).toHaveText(sessionId);
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test('request more data parks the session', async ({ page }) => {
    await readyConsole(page);
    await clickMatchingRow(
      page,
      (row) => row.workflow === 'exception-review' && row.status === 'open' && Math.abs(row.delta) < 100,
    );
    await page.getByTestId('action-request_more_data').click();
    await expect(page.getByRole('status').filter({ hasText: /Parked for more data/ })).toBeVisible();
    await expect(page.locator('.pill').filter({ hasText: /More data|Done/ })).toBeVisible();
    await expect(page.locator('[data-event-type="remediation.written"]')).toHaveCount(0);
  });
});
