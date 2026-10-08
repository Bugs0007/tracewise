import { expect, type Page } from '@playwright/test';

/** Replace the CodeMirror document (select-all + insertText avoids auto-indent on Enter). */
export async function setEditor(page: Page, code: string, index = 0) {
  const ed = page.locator('.cm-content').nth(index);
  await ed.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
}

export async function runAndWait(page: Page) {
  await page.getByTestId('run').click();
  const res = page.getByTestId('results');
  await expect(res).toBeVisible({ timeout: 60_000 });
  return res;
}

/** Collect uncaught page errors so tests can assert none happened. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

export async function freshStart(page: Page, path = '/') {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`./#${path}`);
}
