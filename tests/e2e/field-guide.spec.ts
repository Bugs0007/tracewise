import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { freshStart, trackErrors } from './helpers';

test('discover, choose a route, search and open a story', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page);
  await page.getByTestId('ai-guide-link').click();
  await expect(page.getByRole('heading', { name: 'Understand it. See it. Explain it.' })).toBeVisible();
  await expect(page.locator('.fg-chapter li')).toHaveCount(44);
  await page.getByRole('button', { name: 'Two-day interview path' }).click();
  await expect(page.getByRole('heading', { name: 'Day 1 · Understand and ground' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search concepts' }).fill('LoRA');
  await expect(page.getByRole('heading', { name: 'No matching lessons in this path' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all concepts' }).click();
  await page.getByRole('searchbox', { name: 'Search concepts' }).fill('cosine');
  await expect(page.locator('.fg-chapter li')).toHaveCount(1);
  await page.locator('.fg-chapter li a').click();
  await expect(page.getByRole('heading', { name: 'Embeddings: addresses in meaning space', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous scene' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next scene' }).click();
  await expect(page.locator('.fg-story-stage h2')).toHaveText('Encode the query');
  expect(errors).toEqual([]);
});

test('quiz feedback, spoken rubric, notes, reload and recall round-trip', async ({ page }) => {
  await freshStart(page, '/ai-stories/ai-map?activity=interview');
  await expect(page.getByRole('tab', { name: /Explain it/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Save as practiced' })).toBeDisabled();
  await page.getByRole('button', { name: /Train a language model from scratch/ }).click();
  await page.getByRole('button', { name: 'Check my choice' }).click();
  await expect(page.getByText('Consider the mechanism.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: /Use a deterministic lookup/ }).click();
  await page.getByRole('button', { name: 'Check my choice' }).click();
  await page.getByRole('textbox', { name: 'Your explanation / notes' }).fill('Start with the task and a measurable baseline.');
  await page.getByRole('button', { name: 'Reveal answer rubric' }).click();
  for (const checkbox of await page.locator('.fg-rubric input').all()) await checkbox.check();
  await page.getByRole('button', { name: 'Save as practiced' }).click();
  await expect(page.getByText('Practice saved.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('.fg-practiced')).toHaveText('✓ Practiced');
  await expect(page.getByRole('textbox', { name: 'Your explanation / notes' })).toHaveValue('Start with the task and a measurable baseline.');
  await page.locator('.fg-nav').getByRole('link', { name: /^Recall/ }).click();
  await expect(page.locator('.fg-recall-list article')).toHaveCount(1);
  await page.getByRole('link', { name: 'Practice and check' }).click();
  await expect(page.getByRole('tab', { name: /Explain it/ })).toHaveAttribute('aria-selected', 'true');
});

test('sampling and retrieval controls demonstrate actual consequences', async ({ page }) => {
  await freshStart(page, '/ai-stories/sampling');
  await page.getByRole('tab', { name: /Experiment/ }).click();
  await page.getByRole('slider', { name: 'Temperature', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.fg-bars > div').first()).toContainText('100.0%');
  await page.goto('/#/ai-stories/rag-pipeline');
  await page.getByRole('tab', { name: /Experiment/ }).click();
  await page.getByRole('checkbox', { name: 'Index contains exception' }).uncheck();
  await page.getByRole('slider', { name: 'Passages sent to model' }).focus();
  await page.keyboard.press('End');
  await expect(page.locator('.fg-insight:visible')).toContainText('More k or reranking cannot recover it');
  await expect(page.locator('.fg-stat').filter({ hasText: 'Recall' })).toContainText('50%');
});

test('refund simulation enforces authority even with injection', async ({ page }) => {
  await freshStart(page, '/ai-stories/tool-calling');
  await page.getByRole('tab', { name: /Experiment/ }).click();
  await page.getByRole('checkbox', { name: 'Tool result contains injection' }).check();
  const advance = page.getByRole('button', { name: 'Advance workflow' });
  await advance.click(); await advance.click(); await advance.click();
  await expect(page.locator('.fg-insight:visible')).toContainText('Paused: explicit approval');
  await page.getByRole('checkbox', { name: 'User approved $42' }).check();
  await page.getByRole('checkbox', { name: 'User owns order' }).uncheck();
  await advance.click(); await advance.click(); await advance.click();
  await expect(page.locator('.fg-insight:visible')).toContainText('Blocked: authenticated user');
  await page.getByRole('checkbox', { name: 'User owns order' }).check();
  for (let i = 0; i < 4; i++) await advance.click();
  await expect(page.locator('.fg-insight:visible')).toContainText('Simulated completion');
  await expect(advance).toBeDisabled();
});

test('mock interview completes with honest self-assessment and concept links', async ({ page }) => {
  await freshStart(page, '/ai-stories/interview');
  await page.getByRole('button', { name: 'Start mock interview' }).click();
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause timer' }).click();
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: 'Reveal self-check' }).click();
    await expect(page.locator('.fg-rubric input')).toHaveCount(3);
    await page.locator('.fg-rubric input').first().check();
    await page.getByRole('button', { name: i === 7 ? 'Finish and review' : 'Next scenario' }).click();
  }
  await expect(page.locator('.fg-recall-list article')).toHaveCount(8);
  await expect(page.locator('.fg-recall-list article').first()).toContainText('1 of 3 rubric points');
});

test('desktop/light and mobile/dark views are accessible and fit the viewport', async ({ page }) => {
  await freshStart(page, '/ai-stories');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  let audit = await new AxeBuilder({ page }).include('.fg-page').analyze();
  expect(audit.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/ai-stories/attention');
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.getByRole('tab', { name: /The story/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Experiment/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'The', exact: true }).click();
  await expect(page.locator('.fg-attention-cells .masked')).toHaveCount(4);
  expect(await page.locator('.fg-page').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  audit = await new AxeBuilder({ page }).include('.fg-page').analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('tab', { name: /Explain it/ }).click();
  audit = await new AxeBuilder({ page }).include('.fg-page').analyze();
  expect(audit.violations).toEqual([]);
});
