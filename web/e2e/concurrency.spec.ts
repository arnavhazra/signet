import { acceptAdjustment, expect, highDeltaRow, kernelTimeout, readyConsole, test } from './helpers';

test.describe('Concurrency', () => {
  test('stale expectedUpdatedAt surfaces the 409 copy', async ({ page, context }) => {
    await readyConsole(page);
    await highDeltaRow(page).click();
    await expect(page.getByTestId('action-accept_adjustment')).toBeVisible();

    const other = await context.newPage();
    await other.goto(page.url());
    await expect(other.getByTestId('action-accept_adjustment')).toBeVisible({ timeout: kernelTimeout() });

    await acceptAdjustment(page);
    await expect(page.getByText(/Waiting on checker/)).toBeVisible();

    await other.getByTestId('action-accept_adjustment').click();
    await expect(other.getByRole('alert')).toContainText(
      'Conflict. This session changed — reloaded latest state. Retry if needed.',
    );
    await other.close();
  });
});
