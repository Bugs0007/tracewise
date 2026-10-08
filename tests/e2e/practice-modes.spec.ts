import { expect, test } from '@playwright/test';
import { freshStart, setEditor, trackErrors } from './helpers';

test('a wrong prediction lands in the review queue and can be reviewed', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page, '/unit/binary-search/predict');
  await page.getByTestId('option-0').click();
  await expect(page.getByText('Not quite.')).toBeVisible();
  // the item is due tomorrow: move the browser clock two days ahead
  await page.waitForTimeout(400);
  await page.clock.install({ time: new Date(Date.now() + 2 * 86_400_000) });
  await page.goto('./#/review');
  await page.reload();
  await page.getByTestId('start-review').click();
  await page.getByTestId('option-1').click();
  await expect(page.getByText('Correct.')).toBeVisible();
  await page.getByTestId('next-item').click();
  await expect(page.getByTestId('session-done')).toBeVisible();
  expect(errors).toEqual([]);
});

test('quick 10 session runs with a timer', async ({ page }) => {
  await freshStart(page, '/review?quick=1');
  await expect(page.getByLabel('Time left')).toBeVisible();
  await expect(page.getByText(/1\/\d+/)).toBeVisible();
});

test('interview mode: solve, finish, report', async ({ page }) => {
  await freshStart(page, '/interview');
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByTestId('start-interview').click();
  await expect(page.getByTestId('interview-timer')).toBeVisible();
  await page.getByTestId('finish-interview').click();
  await expect(page.getByTestId('interview-report')).toContainText('0/2');
  await page.goto('./#/review');
  await expect(page.getByText('Coming up')).toBeVisible();
});

test('trace your own python code', async ({ page }) => {
  await freshStart(page, '/lab/trace');
  await setEditor(page, 'def f(n):\n    total = 0\n    for i in range(n):\n        total += i\n    return total');
  await page.getByTestId('trace-fn').fill('f');
  await page.getByTestId('trace-args').fill('[3]');
  await page.getByTestId('trace-run').click();
  await expect(page.getByTestId('caption')).toContainText('Call f(n=3)', { timeout: 60_000 });
  await page.getByTestId('end').click();
  await expect(page.getByTestId('caption')).toContainText('f returns 3');
});
