import { expect, inboxRows, kernelTimeout, readyConsole, switchRole, test } from './helpers';

test.describe('Authz', () => {
  test('auditor can GET inbox and cannot ingest, advance, or propose write', async ({ page }) => {
    await readyConsole(page);
    const sessionId = await inboxRows(page).first().getAttribute('data-session-id');
    expect(sessionId).toBeTruthy();

    await switchRole(page, 'auditor');
    await expect(page.getByTestId('role-auditor')).toHaveClass(/btn--gold/);
    await expect(page.getByTestId('inbox-table')).toBeVisible();

    const ingest = await page.request.post('/v1/events/exceptions', {
      data: {
        accountId: 'A-AUD',
        securityId: 'US0000000000',
        bookQty: 10,
        custodianQty: 8,
        asOf: '2026-09-18',
        source: `e2e-auditor-${Date.now()}`,
      },
    });
    expect(ingest.status()).toBe(403);

    const advance = await page.request.post(`/v1/sessions/${sessionId}/advance`, {
      data: { inputs: { decision: 'reject' } },
    });
    expect(advance.status()).toBe(403);

    const propose = await page.request.post('/v1/agent/propose', {
      data: { intent: 'resolve_break', accountId: 'A-214' },
    });
    expect(propose.status()).toBe(403);

    await page.goto('/agent');
    await page.getByTestId('agent-chip-write').click();
    await expect(page.getByRole('alert')).toContainText(/Auditor role is read-only/i, {
      timeout: kernelTimeout(),
    });
  });
});
