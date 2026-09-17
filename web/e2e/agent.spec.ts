import { expect, kernelTimeout, readyConsole, test } from './helpers';

test.describe('Agent propose', () => {
  test('write requires_human and links a session', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/agent');
    await page.getByTestId('agent-chip-write').click();
    const verdict = page.getByTestId('agent-verdict');
    await expect(verdict).toHaveAttribute('data-decision', 'requires_human', { timeout: kernelTimeout() });
    await expect(verdict).toContainText('Requires human');
    await expect(page.getByRole('link', { name: 'Open session' })).toBeVisible();
  });

  test('read auto_executed', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/agent');
    await page.getByTestId('agent-chip-read').click();
    await expect(page.getByTestId('agent-verdict')).toHaveAttribute('data-decision', 'auto_executed', {
      timeout: kernelTimeout(),
    });
    await expect(page.getByTestId('agent-verdict')).toContainText('Auto executed');
  });

  test('unknown intent is denied with no session', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/agent');
    await page.getByTestId('agent-chip-deny').click();
    await expect(page.getByTestId('agent-verdict')).toHaveAttribute('data-decision', 'denied', {
      timeout: kernelTimeout(),
    });
    await expect(page.getByTestId('agent-verdict')).toContainText('Denied');
    await expect(page.getByRole('link', { name: 'Open session' })).toHaveCount(0);
  });

  test('contract tab shows curl and MCP against the live origin', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/agent');
    await page.getByRole('tab', { name: 'Contract' }).click();
    const curl = page.getByTestId('agent-curl');
    await expect(curl).toBeVisible();
    await expect(curl).toContainText("curl -sS");
    await expect(curl).toContainText('https://signet-pearl-iota.vercel.app/v1/agent/propose');
    const mcp = page.getByTestId('agent-mcp');
    await expect(mcp).toContainText('https://signet-pearl-iota.vercel.app/mcp');
    await expect(mcp).toContainText('"type": "http"');
  });
});
