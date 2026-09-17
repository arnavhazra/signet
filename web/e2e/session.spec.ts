import {
  acceptAdjustment,
  clickMatchingRow,
  expect,
  expectSessionAccepted,
  highDeltaRow,
  readyConsole,
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

  test('request more data parks the session', async ({ page }) => {
    await readyConsole(page);
    await clickMatchingRow(
      page,
      (row) => row.workflow === 'exception-review' && row.status === 'open' && Math.abs(row.delta) < 100,
    );
    await page.getByTestId('action-request_more_data').click();
    await expect(page.getByRole('status').filter({ hasText: /Parked for more data/ })).toBeVisible();
    await expect(page.getByText('pending_more_data')).toBeVisible();
    await expect(page.locator('[data-event-type="remediation.written"]')).toHaveCount(0);
  });
});
