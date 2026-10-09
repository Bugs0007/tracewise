import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';

async function audit(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const detail = serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target?.join(' ')}`).join('\n');
  expect(serious, `${label}\n${detail}`).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // runs before every page load, ahead of the app's own save-on-unload
      await page.addInitScript((t) => localStorage.setItem('tracewise:save', JSON.stringify({ schema: 1, settings: { theme: t } })), theme);
    });
    for (const [name, route] of [
      ['home', '/'],
      ['map', '/map/dsa'],
      ['unit predict', '/unit/binary-search/predict'],
      ['unit watch', '/unit/binary-search/watch'],
      ['unit type', '/unit/binary-search/type'],
      ['settings', '/settings'],
      ['gym', '/gym'],
    ] as const) {
      test(`${name} has no serious a11y violations`, async ({ page }) => {
        await page.goto(`./#${route}`);
        await page.waitForTimeout(800);
        await audit(page, `${name} (${theme})`);
      });
    }
  });
}

test('keyboard: skip link, step shortcuts and focus order work', async ({ page }) => {
  await freshStart(page, '/lab/bfs');
  const caption = page.getByTestId('caption');
  const first = await caption.textContent();
  await page.locator('body').click({ position: { x: 700, y: 300 } });
  await page.keyboard.press('ArrowRight');
  await expect(caption).not.toHaveText(first!);
  await page.keyboard.press('ArrowLeft');
  await expect(caption).toHaveText(first!);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('reduced motion setting is applied to the document', async ({ page }) => {
  await freshStart(page, '/settings');
  await page.getByRole('button', { name: 'Reduced' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});
