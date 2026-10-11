// Large code: wrapped lines, the expand sheet for the read-only code, and the full screen editor.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { freshStart, runAndWait, setEditor } from './helpers';

const sudoku = '/dsa/arrays-hashing/valid-sudoku';

async function open(page: Page, route = sudoku) {
  await freshStart(page, route);
  await page.getByTestId('skip-pattern').click();
}

const sideways = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => e.scrollWidth - e.clientWidth);

test('long lines wrap by default and can be switched back to scrolling', async ({ page }) => {
  await open(page);
  const code = '.codeview[role=region]:not(.sheet)';
  expect(await sideways(page, code), 'wrapped: nothing to scroll sideways').toBeLessThanOrEqual(0);
  await page.getByTestId('wrap-toggle').first().click();
  expect(await sideways(page, code), 'unwrapped: the long line scrolls').toBeGreaterThan(0);
  await page.reload();
  // the choice is remembered on this device
  await page.getByTestId('skip-pattern').click().catch(() => undefined);
  await expect(page.getByTestId('wrap-toggle').first()).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('wrap-toggle').first().click();
  await expect(page.getByTestId('wrap-toggle').first()).toHaveAttribute('aria-pressed', 'true');
});

test('a wrapped continuation line is indented under its own line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const ln = page.locator('.codeview .ln', { hasText: 'if d in rows[r]' }).first();
  const lineBox = await ln.locator('.ln-t').boundingBox();
  const lineHeight = await ln.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(lineBox!.height, 'the long line wraps onto more than one row').toBeGreaterThan(lineHeight * 1.5);
});

test('expand opens the code full size; stepping inside follows the trace; Escape closes it', async ({ page }) => {
  await open(page);
  await page.getByTestId('code-expand').click();
  const sheet = page.getByTestId('code-sheet');
  await expect(sheet).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await sheet.boundingBox())!;
  expect(box.height).toBeGreaterThan(vp.height * 0.8);
  const cur = sheet.locator('.ln.cur');
  const first = await cur.textContent();
  await page.getByTestId('sheet-step').click();
  await page.getByTestId('sheet-step').click();
  await expect(sheet.locator('.sheet-steps .caption')).not.toBeEmpty();
  expect(await sheet.locator('.ln.cur').textContent()).not.toBe(first);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('code-expand')).toBeFocused();
});

test('a prediction checkpoint closes the expanded sheet so it can be answered', async ({ page }) => {
  await freshStart(page, '/dsa/arrays-hashing/two-sum');
  await page.getByTestId('skip-pattern').click();
  await page.getByTestId('predict-toggle').click();
  await page.getByTestId('code-expand').click();
  await expect(page.getByTestId('code-sheet')).toBeVisible();
  await page.getByTestId('sheet-step').click();
  await page.getByTestId('sheet-step').click(); // the second step hits the first checkpoint
  await expect(page.getByTestId('code-sheet')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Predict the next step' })).toBeVisible();
});

test('on a phone the sheet fills the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  await page.getByTestId('code-expand').click();
  const box = (await page.getByTestId('code-sheet').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(389);
  expect(box.height).toBeGreaterThanOrEqual(799);
  const body = (await page.locator('.code-sheet .codeview').boundingBox())!;
  expect(body.height).toBeGreaterThan(400);
  await page.getByTestId('code-collapse').click();
  await expect(page.getByTestId('code-sheet')).toHaveCount(0);
});

for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 800 }]) {
  test(`full screen editor at ${vp.width}px: big, run bar stays reachable, works`, async ({ page }) => {
    await page.setViewportSize(vp);
    await freshStart(page, '/dsa/arrays-hashing/longest-consecutive-sequence');
    await page.getByTestId('skip-pattern').click();
    const inline = (await page.locator('.cm-editor').first().boundingBox())!;
    await page.getByTestId('editor-full').click();
    const runner = page.locator('.task-full');
    await expect(runner).toBeVisible();
    const box = (await page.locator('.cm-editor').first().boundingBox())!;
    expect(box.height, 'the editor grew').toBeGreaterThan(Math.max(inline.height, vp.height * 0.55));
    await setEditor(page, readFileSync('src/dsa/problems/arrays-hashing/longest-consecutive-sequence.py', 'utf8'));
    // scroll the page content down; the run bar is pinned
    await runner.evaluate((e) => e.scrollTo(0, 99999));
    await expect(page.getByTestId('run')).toBeInViewport();
    const res = await runAndWait(page);
    await expect(res).toHaveAttribute('data-status', 'pass');
    await page.getByTestId('editor-full').click();
    await expect(page.locator('.task-full')).toHaveCount(0);
  });
}

test('full screen leaves with Escape when the editor is not focused', async ({ page }) => {
  await freshStart(page, '/dsa/arrays-hashing/two-sum');
  await page.getByTestId('skip-pattern').click();
  await page.getByTestId('editor-full').click();
  await expect(page.locator('.task-full')).toBeVisible();
  await page.getByTestId('run').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.task-full')).toHaveCount(0);
});

test('long lines in the editor wrap instead of scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await freshStart(page, '/dsa/arrays-hashing/two-sum');
  await page.getByTestId('skip-pattern').click();
  await setEditor(page, `def two_sum(nums, target):\n    # ${'a very long comment that keeps going '.repeat(8)}\n    pass\n`);
  const over = await page.locator('.cm-scroller').first().evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
