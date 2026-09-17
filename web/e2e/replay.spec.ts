import { clickMatchingRow, expect, kernelTimeout, readyConsole, test } from './helpers';

test.describe('Replay', () => {
  test('stripped JSON has no binding keys', async ({ page }) => {
    await readyConsole(page);
    await clickMatchingRow(page, (row) => row.workflow === 'exception-review');
    await page.getByTestId('replay-link').click();
    const stripped = page.getByTestId('replay-stripped');
    await expect(stripped).toBeVisible({ timeout: kernelTimeout() });
    const text = await stripped.innerText();
    expect(text).toContain('checker_approval');
    expect(text).not.toContain('"binding"');
    expect(text).not.toContain('filter_value');
    await expect(stripped).toHaveAttribute('data-has-binding', '0');
  });
});
