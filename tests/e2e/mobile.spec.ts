// Phone widths: nothing scrolls sideways, the top bar fits, and the controls are big enough to tap.
import { expect, test } from '@playwright/test';

const routes = [
  '/', '/map', '/map/dsa', '/unit/binary-search/predict', '/unit/binary-search/watch', '/unit/binary-search/type', '/unit/binary-search/debug', '/unit/binary-search/boss',
  '/lab', '/lab/trace', '/lab/architect', '/gym', '/practice', '/review', '/review?quick=1', '/interview', '/capstone', '/capstone/task-manager', '/certificate', '/settings',
  '/dsa', '/dsa/arrays-hashing', '/dsa/arrays-hashing/two-sum', '/dsa/arrays-hashing/valid-sudoku', '/dsa/gallery',
];

for (const width of [390, 320]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true });
    for (const route of routes) {
      test(`${route} fits and is tappable`, async ({ page }) => {
        await page.goto(`./#${route}`);
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const w = window.innerWidth;
          const small: string[] = [];
          document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, summary').forEach((e) => {
            const el = e as HTMLElement;
            const b = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (!b.width || cs.visibility === 'hidden' || cs.display === 'none') return;
            if (el.closest('.cm-editor') || el.classList.contains('skip-link') || el.classList.contains('gym-hidden') || el.classList.contains('toggle') || el.classList.contains('blank')) return;
            if (el.tagName === 'A' && cs.display === 'inline') return; // links inside sentences
            if (b.height < 40 || b.width < 40) small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
          });
          const bar = document.querySelector('.topbar')!;
          const barOverflow = [...bar.children].filter((c) => c.getBoundingClientRect().right > w + 0.5).length;
          return { overflow: document.documentElement.scrollWidth - w, barOverflow, small: small.slice(0, 5) };
        });
        expect(r.overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
        expect(r.barOverflow, 'top bar items fit').toBe(0);
        expect(r.small, 'controls under 40px').toEqual([]);
      });
    }
  });
}

test('the toast sits above the bottom tab bar on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('./#/unit/binary-search/predict');
  await page.getByTestId('option-1').click();
  const toast = page.locator('.toast').first();
  await expect(toast).toBeVisible();
  const [t, tab] = await Promise.all([toast.boundingBox(), page.locator('.tabbar').boundingBox()]);
  expect(t!.y + t!.height).toBeLessThanOrEqual(tab!.y + 1);
});
