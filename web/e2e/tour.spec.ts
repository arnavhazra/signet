import {
  clickTourNext,
  completeHighDeltaTwoHumans,
  expect,
  goInbox,
  highDeltaRow,
  isRemote,
  kernelTimeout,
  readyConsole,
  startTour,
  test,
  waitTourTitle,
} from './helpers';

test.describe('Tour FSM', () => {
  test.describe.configure({ timeout: isRemote() ? 240_000 : 180_000 });

  test('walks inbox through propose-write Done', async ({ page }) => {
    await readyConsole(page);
    await startTour(page);
    await waitTourTitle(page, 'Inbox');
    await clickTourNext(page);

    await waitTourTitle(page, 'High-delta row');
    await clickTourNext(page);

    await waitTourTitle(page, 'Maker accept');
    await clickTourNext(page);

    await waitTourTitle(page, 'Switch role');
    await clickTourNext(page);

    await waitTourTitle(page, 'Checker approve');
    await clickTourNext(page);

    await waitTourTitle(page, 'Audit');
    await waitTourTitle(page, 'Replay');
    await waitTourTitle(page, 'Propose write');

    await expect(page.getByTestId('tour-next')).toHaveText('Propose write');
    await clickTourNext(page);
    await expect(page.getByTestId('agent-verdict')).toHaveAttribute('data-decision', 'requires_human', {
      timeout: kernelTimeout(),
    });
    await expect(page.getByTestId('tour-next')).toHaveText('Done');
    await clickTourNext(page);
    await expect(page.getByTestId('tour-dialog')).toHaveCount(0);
  });

  test('Skip dismisses the overlay', async ({ page }) => {
    await readyConsole(page);
    await startTour(page);
    await expect(page.getByTestId('tour-dialog')).toBeVisible();
    await page.getByTestId('tour-skip').click();
    await expect(page.getByTestId('tour-dialog')).toHaveCount(0);
    await expect(page.getByTestId('start-tour')).toBeVisible();
  });

  test('?tour=agent opens the last step', async ({ page }) => {
    await readyConsole(page);
    await page.goto('/agent?tour=agent');
    await waitTourTitle(page, 'Propose write');
    await expect(page.getByTestId('agent-chip-write')).toBeVisible();
    await expect(page.getByTestId('tour-back')).toBeEnabled();
    await page.getByTestId('tour-skip').click();
    await expect(page.getByTestId('tour-dialog')).toHaveCount(0);
  });

  test('reduced motion uses the static overlay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await readyConsole(page);
    await startTour(page);
    await expect(page.locator('.tour.tour--static')).toBeVisible();
    await page.getByTestId('tour-skip').click();
  });

  test('start tour reseeds after the high-delta row is spent', async ({ page }) => {
    await readyConsole(page);
    await completeHighDeltaTwoHumans(page);
    await goInbox(page);
    await expect(highDeltaRow(page)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Reset the demo to reseed/ })).toBeVisible();
    await startTour(page);
    await waitTourTitle(page, 'Inbox');
    await expect(highDeltaRow(page)).toBeVisible({ timeout: kernelTimeout() });
    await page.getByTestId('tour-skip').click();
  });
});
