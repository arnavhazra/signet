import { expect, test as base, type Page } from '@playwright/test';

const REMOTE = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const KERNEL_TIMEOUT_MS = REMOTE ? 90_000 : 45_000;

export { expect };

export function isRemote(): boolean {
  return REMOTE;
}

export function kernelTimeout(): number {
  return KERNEL_TIMEOUT_MS;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    let nativeDialog: string | null = null;
    page.on('dialog', (dialog) => {
      nativeDialog = `${dialog.type()}: ${dialog.message()}`;
      void dialog.dismiss();
    });
    await use(page);
    expect(nativeDialog, 'in-app reset must not use window.confirm').toBeNull();
  },
});

/** Poll `/health`, then the SPA inbox. 90s on PLAYWRIGHT_BASE_URL (Hobby cold start). */
export async function waitForKernel(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const res = await page.request.get('/health', { timeout: 60_000 });
          return res.ok();
        } catch {
          return false;
        }
      },
      {
        timeout: KERNEL_TIMEOUT_MS,
        intervals: [1_000, 1_500, 2_000],
        message: 'kernel /health did not become ready',
      },
    )
    .toBe(true);
}

export async function openInbox(page: Page): Promise<void> {
  await waitForKernel(page);
  await page.goto('/');
  await expect(page.getByTestId('reset-demo')).toBeEnabled({ timeout: KERNEL_TIMEOUT_MS });
  await expect(page.getByTestId('inbox-table')).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
}

export function inboxRows(page: Page) {
  return page.getByTestId('inbox-row');
}

export function highDeltaRow(page: Page) {
  return page.locator('[data-testid="inbox-row"][data-tour="high-delta"]');
}

export async function expectHighDeltaOpen(page: Page): Promise<void> {
  const row = highDeltaRow(page);
  await expect(row).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
  await expect(row).toHaveAttribute('data-workflow', 'exception-review');
  await expect(row).toHaveAttribute('data-status', 'open');
  const delta = Number(await row.getAttribute('data-delta'));
  expect(Math.abs(delta)).toBeGreaterThanOrEqual(100);
}

/** In-app confirm only — never `window.confirm`. */
export async function resetDemo(page: Page): Promise<void> {
  if (!(await page.getByTestId('reset-demo').count())) {
    await openInbox(page);
  }
  await expect(page.getByTestId('reset-demo')).toBeEnabled({ timeout: KERNEL_TIMEOUT_MS });
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('reset-confirm')).toBeVisible();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('reset-confirm')).toHaveCount(0, { timeout: KERNEL_TIMEOUT_MS });
  await expect(page.getByTestId('inbox-table')).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
  await expectHighDeltaOpen(page);
}

export async function readyConsole(page: Page): Promise<void> {
  await openInbox(page);
  await resetDemo(page);
}

export async function switchRole(
  page: Page,
  role: 'operator' | 'checker' | 'auditor' | 'admin',
): Promise<void> {
  const btn = page.getByTestId(`role-${role}`);
  await expect(btn).toBeEnabled({ timeout: KERNEL_TIMEOUT_MS });
  await btn.click();
  await expect(btn).toHaveClass(/btn--gold/, { timeout: KERNEL_TIMEOUT_MS });
}

export async function goInbox(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Inbox' }).click();
  await expect(page.getByTestId('inbox-table')).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
}

export async function clickMatchingRow(
  page: Page,
  predicate: (row: { delta: number; status: string; account: string; workflow: string }) => boolean,
): Promise<void> {
  const rows = inboxRows(page);
  await expect(rows.first()).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const delta = Number(await row.getAttribute('data-delta'));
    const status = (await row.getAttribute('data-status')) || '';
    const account = (await row.getAttribute('data-account')) || '';
    const workflow = (await row.getAttribute('data-workflow')) || '';
    if (predicate({ delta, status, account, workflow })) {
      await row.click();
      return;
    }
  }
  throw new Error('No matching inbox row');
}

export function sessionIdFromUrl(page: Page): string {
  const match = page.url().match(/\/sessions\/([^/?#]+)/);
  if (!match) throw new Error(`No session id in ${page.url()}`);
  return decodeURIComponent(match[1]);
}

export async function waitTourTitle(page: Page, title: string): Promise<void> {
  await expect(page.getByTestId('tour-dialog').locator('#tour-title')).toHaveText(title, {
    timeout: KERNEL_TIMEOUT_MS,
  });
}

export async function clickTourNext(page: Page): Promise<void> {
  const next = page.getByTestId('tour-next');
  await expect(next).toBeEnabled({ timeout: KERNEL_TIMEOUT_MS });
  await next.click();
}

/** Click Next; if the title does not advance, click the highlighted control directly. */
export async function clickTourNextUntil(
  page: Page,
  title: string,
  fallbackTestId?: string,
): Promise<void> {
  const heading = page.getByTestId('tour-dialog').locator('#tour-title');
  await clickTourNext(page);
  const firstWait = REMOTE ? 45_000 : 12_000;
  try {
    await expect(heading).toHaveText(title, { timeout: firstWait });
  } catch {
    const limited = page.getByRole('alert').filter({ hasText: /Rate limited/ });
    if (await limited.isVisible().catch(() => false)) {
      await expect(limited).toHaveCount(0, { timeout: 20_000 }).catch(() => undefined);
    }
    if (fallbackTestId) {
      const target = page.getByTestId(fallbackTestId).first();
      if (await target.count()) {
        await target.click({ force: true });
      }
    } else {
      const next = page.getByTestId('tour-next');
      if (await next.isEnabled()) await next.click();
    }
    await expect(heading).toHaveText(title, { timeout: KERNEL_TIMEOUT_MS });
  }
}

export async function startTour(page: Page): Promise<void> {
  await expect(page.getByTestId('start-tour')).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
  await page.getByTestId('start-tour').click();
  await expect(page.getByTestId('tour-dialog')).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
  await expect(page.getByTestId('reset-demo')).toBeEnabled({ timeout: KERNEL_TIMEOUT_MS });
  await expectHighDeltaOpen(page);
}

export async function acceptAdjustment(page: Page): Promise<void> {
  const btn = page.getByTestId('action-accept_adjustment');
  await expect(btn).toBeVisible({ timeout: KERNEL_TIMEOUT_MS });
  await btn.click();
}

export async function expectSessionAccepted(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /Accepted/ })).toBeVisible();
}

export async function completeHighDeltaTwoHumans(page: Page): Promise<string> {
  await highDeltaRow(page).click();
  await acceptAdjustment(page);
  await expect(page.getByText(/Waiting on checker/)).toBeVisible();
  await switchRole(page, 'checker');
  await acceptAdjustment(page);
  await expectSessionAccepted(page);
  return sessionIdFromUrl(page);
}
