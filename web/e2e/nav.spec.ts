import {
  expect,
  kernelTimeout,
  openCommandPalette,
  readyConsole,
  test,
  waitForKernel,
} from './helpers';

test.describe('Nav and kernel surfaces', () => {
  test('system card and role buttons render', async ({ page }) => {
    await readyConsole(page);
    await expect(page.getByTestId('system-card')).toBeVisible();
    await expect(page.getByTestId('system-card')).toContainText(/Kernel reachable|Kernel warming/);
    const roles = page.getByRole('radiogroup', { name: 'Role' });
    await expect(roles).toBeVisible();
    await expect(roles.getByRole('radio')).toHaveCount(4);
    await expect(roles.getByRole('radio', { name: 'operator' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('role-checker')).toBeVisible();
    await expect(page.getByTestId('role-auditor')).toBeVisible();
    await expect(page.getByTestId('role-admin')).toBeVisible();
    await expect(page.getByTestId('reset-demo')).toBeVisible();
  });

  test('command palette jumps to Agent', async ({ page }) => {
    await readyConsole(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette')).toHaveCount(0);
    await openCommandPalette(page);
    await page.getByTestId('command-palette-input').fill('Agent');
    await page.getByRole('option', { name: 'Agent' }).click();
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole('heading', { name: 'Propose' })).toBeVisible();
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

  test('MCP resources/list and tools/list accept visitor JWT', async ({ page }) => {
    await readyConsole(page);
    const minted = await page.request.get('/v1/auth/demo');
    expect(minted.ok()).toBeTruthy();
    const body = (await minted.json()) as { accessToken?: string };
    expect(body.accessToken?.split('.').length).toBe(3);

    const listed = await page.request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 10, method: 'resources/list' },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.accessToken}`,
      },
    });
    expect(listed.ok()).toBeTruthy();
    const resources = (await listed.json()).result?.resources ?? [];
    const uris = new Set(resources.map((row: { uri: string }) => row.uri));
    expect(uris.has('signet://inbox')).toBeTruthy();

    const tools = await page.request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 11, method: 'tools/list' },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.accessToken}`,
      },
    });
    expect(tools.ok()).toBeTruthy();
    const names = new Set(
      ((await tools.json()).result?.tools ?? []).map((tool: { name: string }) => tool.name),
    );
    expect(names).toEqual(new Set(['list_exceptions', 'propose_remediation', 'get_session', 'get_audit']));
  });
});
