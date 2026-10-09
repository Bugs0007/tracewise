// Generates README screenshots: SHOTS=1 npx playwright test (after npm run build)
import { test } from '@playwright/test';

const shots: [string, string, string][] = [
  ['home', '/', 'Home dashboard'],
  ['map', '/map/dsa', 'World map'],
  ['watch', '/unit/dijkstra/watch', 'Visualizer'],
  ['watch-dp', '/unit/dp-lcs/watch', 'DP table'],
  ['type', '/unit/binary-search/debug', 'Fix the bug'],
  ['architect', '/lab/architect', 'Architecture lab'],
];

for (const theme of ['dark', 'light'] as const) {
  for (const [name, route] of shots) {
    test(`shot ${name} ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('tracewise:save', JSON.stringify({ schema: 1, xp: 340, streak: { count: 5, best: 9, lastDay: null }, settings: { theme: t, motion: 'reduced' } })), theme);
      await page.goto(`./#${route}`);
      await page.reload();
      await page.waitForTimeout(1200);
      if (name.startsWith('watch')) for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
      if (name === 'architect') {
        await page.getByRole('button', { name: 'Starter design' }).click();
        await page.getByTestId('run-traffic').click();
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `docs/screenshots/${name}-${theme}.png` });
    });
  }
}

test('mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const [name, route] of [['home', '/'], ['watch', '/unit/binary-search/watch']] as const) {
    await page.goto(`http://localhost:4173/#${route}`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/screenshots/mobile-${name}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`mobile ${name} horizontal overflow: ${overflow}px`);
  }
  await ctx.close();
});
