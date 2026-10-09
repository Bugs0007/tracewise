// Smoke test: every visualizer renders, steps and reaches its last frame without page errors.
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ids = readdirSync('src/content/units').flatMap((d) => readdirSync(`src/content/units/${d}`).map((f) => f.replace(/\.ts$/, '')));
const CHUNK = 70;

for (let c = 0; c * CHUNK < ids.length; c++) {
  const part = ids.slice(c * CHUNK, (c + 1) * CHUNK);
  test(`visualizers ${c * CHUNK + 1}–${c * CHUNK + part.length} render and play to the end`, async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('./#/lab');
    const bad: string[] = [];
    for (const id of part) {
      errors.length = 0;
      await page.evaluate((h) => (location.hash = h), `/lab/${id}`);
      const caption = page.getByTestId('caption');
      try {
        await caption.waitFor({ timeout: 6000 });
        await page.getByTestId('step').click({ timeout: 3000 });
        await page.getByTestId('end').click({ timeout: 3000 });
        await expect(caption).not.toBeEmpty({ timeout: 2000 });
      } catch (e) {
        bad.push(`${id}: ${(e as Error).message.split('\n')[0]}`);
      }
      if (errors.length) bad.push(`${id}: page errors: ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
}
