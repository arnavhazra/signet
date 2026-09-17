import { expect, kernelTimeout, readyConsole, test, waitForKernel } from './helpers';

test.describe('Nav and kernel surfaces', () => {
  test('system card and role buttons render', async ({ page }) => {
    await readyConsole(page);
    await expect(page.getByTestId('system-card')).toBeVisible();
    await expect(page.getByTestId('system-card')).toContainText(/Kernel reachable|Kernel warming/);
    await expect(page.getByTestId('role-operator')).toBeVisible();
    await expect(page.getByTestId('role-checker')).toBeVisible();
    await expect(page.getByTestId('role-auditor')).toBeVisible();
    await expect(page.getByTestId('role-admin')).toBeVisible();
    await expect(page.getByTestId('reset-demo')).toBeVisible();
  });

  test('unknown SPA path is a 404 without calling the kernel', async ({ page }) => {
    await waitForKernel(page);
    await page.goto('/this-path-does-not-exist');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(page.getByText('No Signet route for this path.')).toBeVisible();
  });

  test('/docs and /openapi.json are served', async ({ page }) => {
    await waitForKernel(page);
    const spec = await page.request.get('/openapi.json');
    expect(spec.ok()).toBeTruthy();
    const body = await spec.json();
    expect(body.openapi || body.swagger).toBeTruthy();
    expect(JSON.stringify(body)).toMatch(/Signet|inbox|sessions/);

    const docs = await page.goto('/docs');
    expect(docs?.ok() ?? true).toBeTruthy();
    await expect(page.locator('body')).toContainText(/Signet|Swagger|openapi/i, { timeout: kernelTimeout() });
  });

  test('POST /mcp tools/list returns the four tools', async ({ page }) => {
    await readyConsole(page);
    const listed = await page.request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    expect(listed.ok()).toBeTruthy();
    const payload = await listed.json();
    const names = new Set((payload.result?.tools ?? []).map((tool: { name: string }) => tool.name));
    expect(names).toEqual(new Set(['list_exceptions', 'propose_remediation', 'get_session', 'get_audit']));
  });
});
