import { expect, test } from '@playwright/test';
import { freshStart, runAndWait, setEditor, trackErrors } from './helpers';

test('home renders with modules and no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page);
  await expect(page.getByRole('heading', { name: /Watch the code run/ })).toBeVisible();
  await expect(page.getByTestId('module-dsa')).toBeVisible();
  await expect(page.getByTestId('module-cloud')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(page.getByTestId('node-binary-search')).toBeVisible();
  expect(errors).toEqual([]);
});

test('binary search unit: predict → watch → type ladder → debug → boss', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page, '/unit/binary-search/predict');

  // 1. predict
  await page.getByTestId('option-1').click();
  await expect(page.getByText('Correct.')).toBeVisible();
  await expect(page.getByTestId('xp')).toHaveText('10 XP');

  // 2. watch: step, then jump to end completes the step
  await page.getByTestId('step-watch').click();
  const caption = page.getByTestId('caption');
  await expect(caption).toContainText('Search space is the whole array');
  await page.getByTestId('step').click();
  await expect(caption).toContainText('candidates remain');
  await page.getByTestId('end').click();
  await expect(caption).toContainText('Found 23 at index 5');
  await expect(page.getByTestId('step-watch')).toHaveClass(/done/);

  // 3. type it: level 1 blanks (one wrong, then right)
  await page.getByTestId('step-type').click();
  const answers = ['len(nums) - 1', 'lo <= hi', '(lo + hi) // 2', 'mid', 'mid + 1', 'mid - 1'];
  for (const [i, a] of answers.entries()) await page.getByTestId(`blank-${i}`).fill(a);
  await page.getByTestId('check-blanks').click();
  await expect(page.getByTestId('results')).toHaveAttribute('data-status', 'pass');
  // promoted to level 2 automatically
  await expect(page.getByText('Level 2: Complete the body')).toBeVisible();
  await setEditor(
    page,
    `def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
  );
  let res = await runAndWait(page);
  await expect(res).toHaveAttribute('data-status', 'pass');
  await expect(page.getByTestId('step-type')).toHaveClass(/done/);

  // 4. debug: run the buggy code first (fails), then fix
  await page.getByTestId('step-debug').click();
  res = await runAndWait(page);
  await expect(res).toHaveAttribute('data-status', 'fail');
  await setEditor(
    page,
    `def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
  );
  res = await runAndWait(page);
  await expect(res).toHaveAttribute('data-status', 'pass');
  await expect(page.getByText(/Fixed — off-by-one/)).toBeVisible();

  // 5. boss with one hint
  await page.getByTestId('step-boss').click();
  await page.getByTestId('boss-hint').click();
  await expect(page.getByText(/Nudge:/)).toBeVisible();
  await setEditor(
    page,
    `def search_insert(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return lo`,
  );
  res = await runAndWait(page);
  await expect(res).toHaveAttribute('data-status', 'pass');
  await expect(page.getByText('Boss defeated.')).toBeVisible();
  await expect(page.getByText('Cleared')).toBeVisible();
  expect(errors).toEqual([]);
});

test('runaway code is stopped and the runner recovers', async ({ page }) => {
  await freshStart(page, '/unit/binary-search/debug');
  await setEditor(page, 'def binary_search(nums, target):\n    while True:\n        pass');
  let res = await runAndWait(page);
  await expect(res).toHaveAttribute('data-status', 'timeout');
  await setEditor(page, 'def binary_search(nums, target):\n    return nums.index(target) if target in nums else -1');
  await page.getByTestId('run').click();
  res = page.getByTestId('results');
  await expect(res).toHaveAttribute('data-status', 'pass', { timeout: 60_000 });
});

test('BFS visualizer with predict mode quiz', async ({ page }) => {
  const errors = trackErrors(page);
  await freshStart(page, '/lab/bfs');
  await expect(page.getByTestId('caption')).toContainText('Mark the start node A');
  await page.getByTestId('predict-toggle').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('step').click();
  await expect(page.getByRole('dialog', { name: 'Predict the next step' })).toBeVisible();
  await page.getByRole('dialog').locator('.opt').first().click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByTestId('end').click();
  await expect(page.getByTestId('caption')).toContainText('BFS order: A → B → C → D → E → F → G');
  expect(errors).toEqual([]);
});

test('progress export and import round-trip', async ({ page }) => {
  await freshStart(page, '/unit/bfs/predict');
  await page.getByTestId('option-0').click();
  await expect(page.getByTestId('xp')).toHaveText('10 XP');
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const path = await download.path();
  // wipe, then import the file back
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Reset everything/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('xp')).toHaveText('0 XP');
  await page.getByTestId('import-file').setInputFiles(path!);
  await expect(page.getByText(/Imported: 10 XP/)).toBeVisible();
  await expect(page.getByTestId('xp')).toHaveText('10 XP');
});

test('syntax gym: typing a snippet completes it', async ({ page }) => {
  await freshStart(page, '/gym');
  await page.getByTestId('gym-text').click();
  await page.keyboard.type('def greet(name, greeting="Hello"):');
  await page.keyboard.press('Enter');
  await page.keyboard.type('return f"{greeting}, {name}!"');
  await expect(page.getByTestId('gym-done')).toBeVisible();
});
