import { expect, kernelTimeout, readyConsole, sessionIdFromUrl, switchRole, test } from './helpers';

test.describe('Audit', () => {
  test('same session shows agent proposed, two humans, and remediation written', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/agent');
    await page.getByTestId('agent-chip-write').click();
    await expect(page.getByTestId('agent-verdict')).toHaveAttribute('data-decision', 'requires_human', {
      timeout: kernelTimeout(),
    });
    await page.getByRole('link', { name: 'Open session' }).click();
    await page.getByTestId('action-accept_adjustment').click();
    await expect(page.getByText(/Waiting on checker/)).toBeVisible();
    await switchRole(page, 'checker');
    await page.getByTestId('action-accept_adjustment').click();
    await expect(page.getByRole('status').filter({ hasText: /Accepted/ })).toBeVisible();
    const sessionId = sessionIdFromUrl(page);

    await page.goto(`/audit?session=${encodeURIComponent(sessionId)}`);
    await expect(page.getByTestId('audit-search')).toBeVisible();
    await expect(page.getByText('Agent proposed')).toBeVisible({ timeout: kernelTimeout() });
    await expect(page.getByText('Decision · operator')).toBeVisible();
    await expect(page.getByText('Decision · checker')).toBeVisible();
    await expect(page.getByText('Remediation written')).toBeVisible();

    await page.getByTestId('audit-filter-agent').click();
    await expect(page.getByText('Agent proposed')).toBeVisible();
    await expect(page.getByText('Remediation written')).toHaveCount(0);

    await page.getByTestId('audit-filter-human').click();
    await expect(page.getByText('Decision · operator')).toBeVisible();
    await expect(page.getByText('Decision · checker')).toBeVisible();

    await page.getByTestId('audit-filter-write').click();
    await expect(page.getByText('Remediation written')).toBeVisible();
    await expect(page.getByText('Agent proposed')).toHaveCount(0);
  });
});
