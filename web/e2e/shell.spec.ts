import {
  acceptAdjustment,
  expect,
  highDeltaRow,
  kernelTimeout,
  readyConsole,
  switchRole,
  test,
  waitForKernel,
} from './helpers';

test.describe('Product shell', () => {
  test('landing does not call /v1/inbox before CTA', async ({ page }) => {
    await waitForKernel(page);
    let inboxHits = 0;
    await page.route('**/v1/inbox**', async (route) => {
      inboxHits += 1;
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Signet' })).toBeVisible();
    await expect(page.getByTestId('open-console')).toBeVisible();
    await expect(page.getByTestId('start-trial')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /sign in|log in/i })).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(inboxHits).toBe(0);
    await page.unroute('**/v1/inbox**');
  });

  test('pricing is contact-only with mailto', async ({ page }) => {
    await waitForKernel(page);
    await page.goto('/pricing');
    await expect(page.getByTestId('pricing-contact')).toBeVisible();
    await expect(page.getByTestId('pricing-mailto')).toHaveAttribute(
      'href',
      'mailto:work.arvhaz@gmail.com',
    );
    await expect(page.getByRole('link', { name: 'work.arvhaz@gmail.com', exact: true })).toBeVisible();
    await expect(page.getByText(/\$|Stripe|checkout|Simulated/i)).toHaveCount(0);
    await expect(page.getByTestId('checkout-modal')).toHaveCount(0);
  });

  test('settings plan flip is labeled simulated', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/settings');
    await expect(page.getByText(/Simulated\. No email is sent\. No card is charged\./)).toBeVisible({
      timeout: kernelTimeout(),
    });
    await page.getByTestId('settings-tab-billing').click();
    await expect(page.getByTestId('settings-billing')).toBeVisible();
    await expect(page.getByText(/No Stripe\. This portal only flips the plan enum\./)).toBeVisible();
    await page.getByTestId('settings-plan-desk').click();
    await expect(page.getByText(/Plan set to Desk\. Simulated\. No card is charged\./)).toBeVisible({
      timeout: kernelTimeout(),
    });
  });

  test('role-disabled buttons for auditor inject and operator checker accept', async ({ page }) => {
    await readyConsole(page);
    await switchRole(page, 'auditor');
    await expect(page.getByTestId('inbox-inject')).toBeDisabled();

    await switchRole(page, 'operator');
    await highDeltaRow(page).click();
    await acceptAdjustment(page);
    await expect(page.getByText(/Waiting on checker/)).toBeVisible({ timeout: kernelTimeout() });
    await expect(page.getByTestId('checker-accept-blocked')).toBeVisible();
    await expect(page.getByTestId('action-accept_adjustment')).toBeDisabled();
  });

  test('open console from landing reaches inbox', async ({ page }) => {
    await waitForKernel(page);
    await page.goto('/');
    await page.getByTestId('open-console').click();
    await expect(page.getByTestId('inbox-table')).toBeVisible({ timeout: kernelTimeout() });
  });
});
