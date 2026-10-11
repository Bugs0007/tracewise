// AI help beside the editor. Groq is mocked at the network layer: a fake key, no real requests.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { freshStart, runAndWait, setEditor } from './helpers';

const KEY = 'gsk_fake_key_for_e2e_0123456789';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-expose-headers': 'retry-after' };
const REPLY = 'Think about **what you have already seen**. What could you store as you walk the list?';

interface Mock {
  chats: { auth: string | null; body: { model: string; stream: boolean; messages: { role: string; content: string }[] } }[];
  mode: 'ok' | 'rate' | 'auth' | 'slow';
}

async function mockGroq(page: Page): Promise<Mock> {
  const m: Mock = { chats: [], mode: 'ok' };
  await page.route('https://api.groq.com/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const auth = req.headers()['authorization'] ?? null;
    if (req.url().endsWith('/models')) {
      if (auth !== `Bearer ${KEY}`) return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: 'Invalid API Key' } }) });
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'llama-3.3-70b-versatile' }, { id: 'meta-llama/llama-guard-4-12b' }] }) });
    }
    m.chats.push({ auth, body: JSON.parse(req.postData() ?? '{}') });
    if (m.mode === 'rate') return route.fulfill({ status: 429, headers: { ...CORS, 'content-type': 'application/json', 'retry-after': '7' }, body: JSON.stringify({ error: { message: 'slow down' } }) });
    if (m.mode === 'auth') return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: 'bad key' } }) });
    if (m.mode === 'slow') await new Promise((r) => setTimeout(r, 4000));
    const parts = REPLY.match(/.{1,25}/g)!;
    const body = parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body }).catch(() => undefined);
  });
  return m;
}

async function openProblem(page: Page, slug = 'two-sum') {
  await freshStart(page, `/dsa/arrays-hashing/${slug}`);
  await page.getByTestId('skip-pattern').click();
}

async function connect(page: Page, key = KEY) {
  await page.getByTestId('ai-key-input').fill(key);
  await page.getByTestId('ai-connect').click();
}

test.describe('docked beside the editor (wide screen)', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('connect with a key, ask for a hint, and see what was sent', async ({ page }) => {
    const mock = await mockGroq(page);
    await openProblem(page);
    const panel = page.getByTestId('ai-panel');
    await expect(panel).toBeVisible();
    // the panel sits to the right of the editor
    const [ed, ai] = await Promise.all([page.locator('.cm-editor').first().boundingBox(), panel.boundingBox()]);
    expect(ai!.x).toBeGreaterThan(ed!.x + ed!.width - 2);
    await expect(page.getByTestId('ai-setup')).toBeVisible();

    // a wrong key is rejected with a plain message and nothing is stored
    await connect(page, 'gsk_wrong_key');
    await expect(page.getByTestId('ai-key-error')).toContainText('did not accept');
    expect(await page.evaluate(() => localStorage.getItem('tracewise:ai'))).toBeNull();

    await connect(page);
    await expect(page.getByTestId('ai-input')).toBeVisible(); // connected: straight to the conversation
    await page.getByTestId('ai-settings').click(); // the key and model controls
    await expect(page.getByTestId('ai-connected')).toBeVisible();
    await expect(page.getByTestId('ai-key-mask')).not.toContainText('fake_key');
    await expect(page.getByTestId('ai-model')).toHaveValue('llama-3.3-70b-versatile');
    await expect(page.getByTestId('ai-model').locator('option')).toHaveText(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']); // no whisper or guard models
    await page.getByTestId('ai-settings').click();

    await setEditor(page, 'def two_sum(nums, target):\n    return [0, 0]\n');
    await page.getByTestId('ai-action-hint').click();
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('what you have already seen');
    await expect(page.getByTestId('ai-turn-user').first()).toHaveText('Give me a hint');

    // what went over the wire
    expect(mock.chats).toHaveLength(1);
    const sent = mock.chats[0];
    expect(sent.auth).toBe(`Bearer ${KEY}`);
    expect(sent.body.stream).toBe(true);
    expect(sent.body.model).toBe('llama-3.3-70b-versatile');
    expect(sent.body.messages[0].role).toBe('system');
    const last = sent.body.messages[sent.body.messages.length - 1].content;
    expect(last).toContain('return [0, 0]'); // the learner's current code, read at send time
    expect(last).toContain('Two Sum');
    expect(last).not.toContain('return [seen[need], i]'); // the reference solution is never sent
    expect(JSON.stringify(sent.body)).not.toContain(KEY);
  });

  test('the key is stored on its own, never in the progress save', async ({ page }) => {
    await mockGroq(page);
    await openProblem(page);
    await connect(page);
    await expect(page.getByTestId('ai-input')).toBeVisible();
    await page.getByTestId('ai-action-hint').click();
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('already seen');
    await page.waitForTimeout(600); // the progress save is written on a short debounce
    const stored = await page.evaluate(() => ({ ai: localStorage.getItem('tracewise:ai'), save: localStorage.getItem('tracewise:save'), all: Object.entries(localStorage).filter(([, v]) => v.includes('gsk_fake')).map(([k]) => k) }));
    expect(stored.ai).toContain('gsk_fake_key');
    expect(stored.save ?? '').not.toContain('gsk_');
    expect(stored.all).toEqual(['tracewise:ai']);
    expect(page.url()).not.toContain('gsk_');
  });

  test('"Why did my tests fail?" and the nudge under failing tests send the failure', async ({ page }) => {
    const mock = await mockGroq(page);
    await openProblem(page);
    await connect(page);
    await expect(page.getByTestId('ai-input')).toBeVisible();
    await expect(page.getByTestId('ai-action-why-failed')).toBeDisabled(); // nothing to explain before a run
    await setEditor(page, 'def two_sum(nums, target):\n    return []\n');
    await runAndWait(page);
    await expect(page.getByTestId('ai-action-why-failed')).toBeEnabled();
    await page.getByTestId('ai-nudge').click();
    await expect(page.getByTestId('ai-turn-user').last()).toHaveText('Why did my tests fail?');
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('already seen');
    const last = mock.chats[0].body.messages.at(-1)!.content;
    expect(last).toContain('FAILED');
    expect(last).toContain('expected');
    expect(last).toContain('return []');
  });

  test('conversation keeps its history; full solutions are off until switched on', async ({ page }) => {
    const mock = await mockGroq(page);
    await openProblem(page);
    await connect(page);
    await page.getByTestId('ai-input').fill('is a dict the right idea?');
    await page.getByTestId('ai-send').click();
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('already seen');
    await page.getByTestId('ai-action-review').click();
    await expect(page.getByTestId('ai-turn-assistant')).toHaveCount(2);
    const second = mock.chats[1].body.messages;
    expect(second.some((m) => m.role === 'user' && m.content.startsWith('is a dict the right idea?'))).toBe(true);
    expect(second.some((m) => m.role === 'assistant' && m.content.includes('already seen'))).toBe(true);
    expect(second[0].content).toContain('Do NOT write a complete working solution');
    // switch full solutions on in the settings view
    await page.getByTestId('ai-settings').click();
    await page.getByTestId('ai-full-solutions').click();
    await page.getByTestId('ai-settings').click();
    await page.getByTestId('ai-action-hint').click();
    await expect(page.getByTestId('ai-turn-assistant')).toHaveCount(3);
    expect(mock.chats[2].body.messages[0].content).toContain('allowed full solutions');
    await page.getByTestId('ai-clear').click();
    await expect(page.getByTestId('ai-turn-user')).toHaveCount(0);
  });

  test('rate limits, bad keys and Stop are handled gracefully', async ({ page }) => {
    const mock = await mockGroq(page);
    await openProblem(page);
    await connect(page);
    mock.mode = 'rate';
    await page.getByTestId('ai-action-hint').click();
    await expect(page.getByTestId('ai-error')).toContainText('rate limiting');
    await expect(page.getByTestId('ai-error')).toContainText('7 seconds');
    await expect(page.getByTestId('ai-error')).not.toContainText(KEY);

    mock.mode = 'slow';
    await page.getByTestId('ai-action-review').click();
    await expect(page.getByTestId('ai-stop')).toBeVisible();
    await page.getByTestId('ai-stop').click();
    await expect(page.getByTestId('ai-send')).toBeVisible();
    await expect(page.getByTestId('ai-action-hint')).toBeEnabled();

    mock.mode = 'auth';
    await page.getByTestId('ai-action-hint').click();
    // a rejected key sends the learner to the key controls with the reason
    await expect(page.getByTestId('ai-connected')).toBeVisible();
    await expect(page.locator('.ai-body .callout')).toContainText('did not accept');
  });

  test('removing the key returns to setup and deletes it from the browser', async ({ page }) => {
    await mockGroq(page);
    await openProblem(page);
    await connect(page);
    await page.getByTestId('ai-settings').click();
    await page.getByTestId('ai-remove-key').click();
    await expect(page.getByTestId('ai-setup')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('tracewise:ai') ?? '')).not.toContain('gsk_');
  });

  test('the panel can be closed and reopened, and boss attempts have no AI', async ({ page }) => {
    await mockGroq(page);
    await openProblem(page);
    await page.getByTestId('ai-close').click();
    await expect(page.getByTestId('ai-panel')).toHaveCount(0);
    await page.getByTestId('ai-toggle').click();
    await expect(page.getByTestId('ai-panel')).toBeVisible();
    await freshStart(page, '/dsa/arrays-hashing');
    await page.getByTestId('boss-skip-quiz').click();
    await expect(page.getByTestId('run')).toBeVisible();
    await expect(page.getByTestId('ai-toggle')).toHaveCount(0);
    await expect(page.getByTestId('ai-panel')).toHaveCount(0);
  });
});

test.describe('phone: full-screen sheet', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true });

  test('opens from the AI help button, fills the screen, and works', async ({ page }) => {
    const mock = await mockGroq(page);
    await openProblem(page);
    await expect(page.getByTestId('ai-panel')).toHaveCount(0); // not docked on a phone
    await page.getByTestId('ai-toggle').click();
    const sheet = page.getByTestId('ai-sheet');
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(box.height).toBeGreaterThanOrEqual(799);
    await connect(page);
    await page.getByTestId('ai-action-approach').click();
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('already seen');
    // controls are big enough to tap and the input does not trigger zoom
    for (const id of ['ai-action-hint', 'ai-send', 'ai-close']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, id).toBeGreaterThanOrEqual(40);
    }
    expect(await page.getByTestId('ai-input').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    expect(mock.chats).toHaveLength(1);
    await page.getByTestId('ai-close').click();
    await expect(sheet).toHaveCount(0);
    // the conversation is still there when reopened
    await page.getByTestId('ai-toggle').click();
    await expect(page.getByTestId('ai-turn-assistant')).toHaveCount(1);
  });

  test('"Ask AI why it failed" opens the sheet and sends the failure', async ({ page }) => {
    const mock = await mockGroq(page);
    await openProblem(page);
    await page.getByTestId('ai-toggle').click();
    await connect(page);
    await page.getByTestId('ai-close').click();
    await setEditor(page, 'def two_sum(nums, target):\n    return []\n');
    await runAndWait(page);
    await page.getByTestId('ai-nudge').click();
    await expect(page.getByTestId('ai-sheet')).toBeVisible();
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('already seen');
    expect(mock.chats[0].body.messages.at(-1)!.content).toContain('FAILED');
  });
});

test.describe('settings', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('connect and remove from Settings; Reset everything also removes the key; copy is honest', async ({ page }) => {
    await mockGroq(page);
    await freshStart(page, '/settings');
    const card = page.getByTestId('ai-settings-card');
    await expect(card).toContainText('only feature that sends anything off this device');
    await connect(page);
    await expect(card.getByTestId('ai-connected')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('tracewise:ai'))).toContain(KEY);
    await expect(page.getByText('There is no AI assistance anywhere in the app')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reset everything' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
    await expect(card.getByTestId('ai-setup')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('tracewise:ai'))).toBeNull();
  });
});

for (const theme of ['dark', 'light'] as const) {
  test(`AI panel has no serious a11y violations (${theme}: setup, chat and phone sheet)`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('tracewise:save', JSON.stringify({ schema: 2, settings: { theme: t } })), theme);
    await mockGroq(page);
    const audit = async (label: string) => {
      const res = await new AxeBuilder({ page }).include('[data-testid=ai-panel]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad, `${label}: ${bad.map((v) => `${v.id} ${v.nodes[0]?.target?.join(' ')}`).join('; ')}`).toEqual([]);
    };
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('./#/dsa/arrays-hashing/two-sum');
    await page.getByTestId('skip-pattern').click();
    await audit('setup');
    await connect(page);
    await page.getByTestId('ai-action-hint').click();
    await expect(page.getByTestId('ai-turn-assistant').last()).toContainText('already seen');
    await audit('chat');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByTestId('ai-toggle').click();
    await expect(page.getByTestId('ai-sheet')).toBeVisible();
    await audit('sheet');
  });
}
