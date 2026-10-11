import type { Tone } from '@/engine/types';
import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './longest-repeating-character-replacement.py?raw';
import cases from './longest-repeating-character-replacement.cases.json';

const viz = vizOf<{ s: string; k: number }>({
  id: 'longest-repeating-character-replacement',
  title: 'Longest Repeating Character Replacement',
  solution,
  inputs: [
    { key: 's', label: 's', kind: 'string', default: 'XYXYXZZ', maxItems: 20 },
    { key: 'k', label: 'k (replacements allowed)', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'k = 2', input: { s: 'XYXYXZZ', k: 2 } },
    { label: 'k = 0', input: { s: 'AABBBCC', k: 0 } },
    { label: 'Generous k', input: { s: 'XYZ', k: 5 } },
    { label: 'Uniform', input: { s: 'KKKK', k: 1 } },
  ],
  validate: ({ k }) => (!Number.isInteger(k) || k < 0 ? 'k must be a whole number, 0 or more' : null),
  run({ s, k }) {
    const r = new TraceRecorder(solution);
    const ch = [...s];
    const count = new Map<string, number>();
    let left = 0;
    let best = 0;
    const maxCount = () => Math.max(0, ...count.values());
    const view = (right: number, hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      for (let q = 0; q < left; q++) tones[q] = 'muted';
      if (hot && right < ch.length) tones[right] = hot;
      const len = right - left + 1;
      return [
        stringView(s, { title: `window (at most ${k} letters may be replaced)`, tones, pointers: right < ch.length ? { left, right } : { left }, window: right >= left && right < ch.length ? { from: left, to: right, label: 'window', tone: 'active' } : undefined }),
        hashMapView(count, { title: 'letters inside the window' }),
        hashMapView({ length: Math.max(0, len), 'most common': maxCount(), 'to replace': Math.max(0, len) - maxCount(), best }, { title: 'window check' }),
      ];
    };
    r.step('init', 'count holds how many of each letter are in the window.', view(-1), { count: '{}' });
    r.step('left', 'left is the window start.', view(-1), { left });
    r.step('best', 'best is the longest valid window so far.', view(-1), { best });
    for (let right = 0; right < ch.length; right++) {
      r.op();
      count.set(ch[right], (count.get(ch[right]) ?? 0) + 1);
      r.step('add', `Add s[${right}] = ${ch[right]} to the window.`, view(right, 'active'), { right });
      for (;;) {
        const len = right - left + 1;
        const need = len - maxCount();
        const bad = need > k;
        r.step('check', `Window length ${len} − most common ${maxCount()} = ${need} letters to replace. Allowed: ${k}.`, view(right, bad ? 'error' : 'active'), { need, k });
        r.predict(bad ? 'invalid' : 'valid', `${need} letters would need replacing and k = ${k}. Is this window valid?`, ['Valid: keep it', 'Too many replacements: shrink from the left'], bad ? 1 : 0, bad ? 'The window needs more fixes than allowed, so drop its leftmost letter.' : 'Within the allowance, so this window counts.');
        if (!bad) break;
        count.set(ch[left], count.get(ch[left])! - 1);
        r.step('drop', `Remove s[${left}] = ${ch[left]} from the window.`, view(right, 'compare'), { left });
        left++;
        r.step('shrink', `left moves to ${left}.`, view(right, 'active'), { left });
      }
      best = Math.max(best, right - left + 1);
      r.step('update', `Valid window length ${right - left + 1}. best = ${best}.`, view(right, 'found'), { best });
    }
    r.step('done', `The longest window is ${best} long.`, view(ch.length - 1), { best });
    return { frames: r.frames, result: best };
  },
  reference({ s, k }) {
    let best = 0;
    for (let i = 0; i < s.length; i++)
      for (let j = i; j < s.length; j++) {
        const c = new Map<string, number>();
        for (const x of s.slice(i, j + 1)) c.set(x, (c.get(x) ?? 0) + 1);
        if (j - i + 1 - Math.max(...c.values()) <= k) best = Math.max(best, j - i + 1);
      }
    return best;
  },
});

export default problem({
  summary: 'You may change at most k characters of a string to any letter you like. After doing so, what is the length of the longest stretch made of one repeated letter?',
  example: ['s = "PPQPQR", k = 1', '4', 'Change the Q inside "PPQP" to P to get "PPPP" (length 4). Changing more than one letter is not allowed.'],
  pattern: ['sliding-window', ['sliding-window', 'dp-1d', 'greedy', 'two-pointers'], 'A window is fixable when (its length − the count of its most common letter) ≤ k. Grow the window, and shrink it from the left only when that stops being true.', {
    'dp-1d': 'There are no overlapping subproblems to store; the question is about one contiguous stretch.',
    greedy: 'The decision of where to cut is local, but the structure that makes it work is the window.',
    'two-pointers': 'Two same-direction pointers is exactly a sliding window.',
  }],
  hints: [
    'In any window you would replace everything except the most common letter. How many replacements does that cost?',
    'A window is valid if length − (count of the most common letter) is at most k.',
    'Grow the right end each step. If the window is no longer valid, shrink from the left until it is.',
  ],
  insight: 'A window is valid when length − most-common-count ≤ k. Grow right; shrink left only when invalid.',
  brute: 'Check every substring: O(n²) windows times counting cost.',
  optimal: 'One pass with a letter count: O(n) time, O(1) space (26 letters).',
  walk: ['Keep a count of letters inside the window and left at 0.', 'Add s[right] to the count.', 'While the number of letters to replace (length − max count) exceeds k, remove s[left] from the count and advance left.', 'Record the window length as a candidate answer.'],
  edge: ['k = 0: the answer is the longest run of one letter.', 'k at least the string length: the whole string.', 'Empty string: 0.', 'Several letters tied for most common.'],
  works: ['A window is fixable exactly when the letters outside the most common one number at most k, because those are the ones replaced.', 'The window only ever shrinks by one position at a time and never gets longer than the best valid one plus one, so each index enters and leaves once.'],
  time: ['O(n)', 'Each index is added once and removed at most once (the max over 26 letters is constant).'],
  space: ['O(1)', 'A count per letter of a fixed alphabet.'],
  solution,
  cases,
  sig: 'def character_replacement(s, k):\n    # longest run of one letter after replacing at most k characters\n    pass\n',
  viz,
  fromArgs: ([s, k]) => ({ s, k }),
});
