import { expect, test } from '@playwright/test';
import { runAndWait, setEditor } from './helpers';

test('works offline after one online visit (service worker + cached Pyodide)', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.goto('./#/unit/binary-search/debug');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // warm every runtime we want offline: Python runs once online
  await setEditor(page, 'def binary_search(nums, target):\n    return nums.index(target) if target in nums else -1');
  await expect((await runAndWait(page)).first()).toHaveAttribute('data-status', 'pass', { timeout: 120_000 });
  // reload once so the SW (now controlling) caches the lazy chunks that were loaded
  await page.reload();
  await page.getByTestId('run').waitFor();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Binary search' })).toBeVisible();
  await setEditor(page, 'def binary_search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1');
  const res = await runAndWait(page);
  await expect(res.first()).toHaveAttribute('data-status', 'pass', { timeout: 120_000 });
  await context.setOffline(false);
});
