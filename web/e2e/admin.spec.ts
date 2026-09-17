import { expect, kernelTimeout, readyConsole, switchRole, test } from './helpers';

test.describe('Admin', () => {
  test('stripped runtime contract has no binding keys', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/admin');
    await switchRole(page, 'admin');
    await page.getByTestId('workflow-exception-review').click();
    await page.getByTestId('fetch-stripped').click();
    const contract = page.getByTestId('stripped-contract');
    await expect(contract).toBeVisible({ timeout: kernelTimeout() });
    const text = await contract.innerText();
    expect(text).not.toContain('"binding"');
    expect(text).not.toContain('filter_value');
  });

  test('nav-signoff is numeric then approval, not a tour row', async ({ page }) => {
    await readyConsole(page);
    await page.locator('[data-testid="inbox-row"][data-workflow="nav-signoff"]').click();
    await expect(page.getByRole('heading', { name: 'NAV override' })).toBeVisible();
    await page.locator('input[type="number"]').fill('105.5');
    await page.getByRole('button', { name: 'Advance' }).click();
    await expect(page.getByTestId('action-accept_adjustment')).toBeVisible({ timeout: kernelTimeout() });
    await page.getByTestId('action-accept_adjustment').click();
    await expect(page.getByRole('status').filter({ hasText: /Accepted/ })).toBeVisible();
  });
});
