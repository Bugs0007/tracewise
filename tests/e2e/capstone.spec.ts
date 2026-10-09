import { expect, test } from '@playwright/test';
import tm from '../../src/content/capstone/task-manager';
import { setEditor } from './helpers';

test('capstone: first milestone via the UI, then the finished app runs in the live preview', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./#/capstone/task-manager');

  // milestone 1 through the real editor + Pyodide
  await setEditor(page, tm.milestones[0].reveal);
  await page.getByTestId('check-milestone').click();
  await expect(page.getByTestId('results')).toHaveAttribute('data-status', 'pass', { timeout: 90_000 });

  // jump to the end state: final backend + frontend saved, all milestones done
  const b = tm.milestones.filter((m) => m.part === 'backend').at(-1)!.reveal;
  const f = tm.milestones.filter((m) => m.part === 'frontend').at(-1)!.reveal;
  await page.evaluate(
    ([backend, frontend, n]) => {
      const s = JSON.parse(localStorage.getItem('tracewise:save') || '{}');
      s.capstone = { 'task-manager': { milestone: n, backend, frontend, done: new Date().toISOString() } };
      // write after the app's own beforeunload save
      window.addEventListener('beforeunload', () => localStorage.setItem('tracewise:save', JSON.stringify(s)));
    },
    [b, f, tm.milestones.length] as const,
  );
  await page.reload();
  await expect(page.getByTestId('milestone-f7')).toBeVisible();

  const app = page.frameLocator('iframe[title="App preview"]');
  await app.getByPlaceholder('Username').fill('demo');
  await app.getByPlaceholder('Password').fill('demo123');
  await app.getByRole('button', { name: 'Log in' }).click();
  await expect(app.getByText('0 of 0 done')).toBeVisible({ timeout: 60_000 });
  await app.getByPlaceholder('New task').fill('Celebrate');
  await app.getByRole('button', { name: 'Add' }).click();
  await expect(app.getByText('Celebrate')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/POST \/api\/tasks\/ → 201/)).toBeVisible();

  await page.goto('./#/certificate');
  await expect(page.getByTestId('certificate')).toContainText('Task manager');
});
