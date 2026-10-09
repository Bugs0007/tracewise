import { test } from '@playwright/test';
const out = 'C:/Users/Bhagath/AppData/Local/Temp/claude/ds';
const pages: [string, string, number][] = [
  ['home', '/', 0], ['map', '/map/dsa', 0], ['watch', '/unit/binary-search/watch', 6], ['type', '/unit/binary-search/type', 0],
  ['debug', '/unit/binary-search/debug', 0], ['boss', '/unit/binary-search/boss', 0], ['review', '/review', 0], ['interview', '/interview', 0],
  ['capstone', '/capstone/task-manager', 0], ['settings', '/settings', 0], ['gym', '/gym', 0],
  ['p-array', '/lab/binary-search', 5], ['p-grid', '/lab/dp-lcs', 12], ['p-graph', '/lab/dijkstra', 14], ['p-list', '/lab/stack-basics', 8],
  ['p-buckets', '/lab/hash-chaining', 8], ['p-sequence', '/lab/be-oauth2', 6], ['p-timeline', '/lab/js-debounce', 8], ['p-chart', '/lab/big-o', 4],
  ['p-log', '/lab/be-n-plus-one', 8], ['p-kv', '/lab/aws-iam', 6],
];
for (const theme of ['dark', 'light'] as const) {
  test(`before ${theme}`, async ({ page }) => {
    test.setTimeout(300000);
    await page.addInitScript((t) => localStorage.setItem('tracewise:save', JSON.stringify({ schema: 1, settings: { theme: t } })), theme);
    for (const [name, route, steps] of pages) {
      if (theme === 'light' && !['home', 'watch', 'p-graph'].includes(name)) continue;
      await page.goto(`./#${route}`);
      await page.reload();
      await page.waitForTimeout(700);
      for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/${name}-${theme}.png` });
    }
  });
}
test('before mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const [name, route] of [['m-home', '/'], ['m-watch', '/unit/binary-search/watch']] as const) {
    await page.goto(`http://localhost:4173/#${route}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
});
