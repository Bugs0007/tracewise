import type { Tone } from '@/engine/types';
import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './longest-substring-without-repeating-characters.py?raw';
import cases from './longest-substring-without-repeating-characters.cases.json';

const viz = vizOf<{ s: string }>({
  id: 'longest-substring-without-repeating-characters',
  title: 'Longest Substring Without Repeating Characters',
  solution,
  inputs: [{ key: 's', label: 's', kind: 'string', default: 'tmmzuxt', maxItems: 24 }],
  presets: [
    { label: 'Repeat inside', input: { s: 'tmmzuxt' } },
    { label: 'All the same', input: { s: 'aaaa' } },
    { label: 'All distinct', input: { s: 'abcdef' } },
    { label: 'Empty', input: { s: '' } },
  ],
  run({ s }) {
    const r = new TraceRecorder(solution);
    const ch = [...s];
    const last = new Map<string, number>();
    let left = 0;
    let best = 0;
    const view = (right: number, hot: Tone | null = null, extra: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < left; k++) tones[k] = 'muted';
      if (hot && right < ch.length) tones[right] = hot;
      return [
        stringView(s, { title: 'window = s[left..right]', tones: { ...tones, ...extra }, pointers: right < ch.length ? { left, right } : { left }, window: right >= left && right < ch.length ? { from: left, to: right, label: 'no repeats', tone: 'active' } : undefined }),
        hashMapView(last, { title: 'last position of each letter' }),
        hashMapView({ best }, {}),
      ];
    };
    r.step('init', 'last remembers where each letter was last seen.', view(0), { last: '{}' });
    r.step('left', 'left is the start of the current window (no repeats inside).', view(0), { left });
    r.step('best', 'best is the longest window so far.', view(0), { best });
    for (let right = 0; right < ch.length; right++) {
      const c = ch[right];
      r.op();
      const inWindow = last.has(c) && last.get(c)! >= left;
      r.step('loop', `right = ${right}: take ${JSON.stringify(c)} into the window.`, view(right, 'active'), { left, right });
      r.step('dup', `Was ${JSON.stringify(c)} seen at or after left = ${left}?`, view(right, 'compare'), { c, last: last.has(c) ? last.get(c)! : 'never' });
      r.predict(inWindow ? 'repeat' : 'fresh', `Is ${JSON.stringify(c)} already inside the window?`, ['Yes: move left past its earlier copy', 'No: the window can simply grow'], inWindow ? 0 : 1, inWindow ? `An earlier ${JSON.stringify(c)} is still in the window, so left must jump just past it.` : `${JSON.stringify(c)} is new to the window, so no repeat.`);
      if (inWindow) {
        left = last.get(c)! + 1;
        r.step('shrink', `Jump left to ${left}, just after the earlier ${JSON.stringify(c)}.`, view(right, 'compare'), { left });
      }
      last.set(c, right);
      r.step('record', `Remember ${JSON.stringify(c)} was last seen at ${right}.`, view(right, 'active'), { left, right });
      const len = right - left + 1;
      r.predictChoice('size', `The window is s[${left}..${right}]. What is its length?`, String(len), [String(len + 1), String(Math.max(1, len - 1)), String(right + 1)], right, `right − left + 1 = ${right} − ${left} + 1 = ${len}.`);
      best = Math.max(best, len);
      r.step('update', `Window length ${len}. best = ${best}.`, view(right, 'found'), { best });
    }
    r.step('done', `The longest substring without repeats has length ${best}.`, view(ch.length), { best });
    return { frames: r.frames, result: best };
  },
  reference({ s }) {
    let best = 0;
    for (let i = 0; i < s.length; i++) for (let j = i; j < s.length; j++) if (new Set(s.slice(i, j + 1)).size === j - i + 1) best = Math.max(best, j - i + 1);
    return best;
  },
});

export default problem({
  summary: 'Given a string, find the length of the longest stretch of consecutive characters in which no character appears twice.',
  example: ['s = "abcbdea"', '5', '"cbdea" has five different characters in a row. "abc" is shorter, and nothing longer avoids repeating "b".'],
  pattern: ['sliding-window', ['sliding-window', 'two-pointers', 'hash-lookup', 'dp-1d'], 'The answer is a contiguous stretch whose validity (no repeats) can be maintained as its right end grows and its left end jumps forward when a repeat appears.', {
    'two-pointers': 'It is two indices, but they move in the same direction, tracking a window; that specific shape is the sliding-window pattern.',
    'hash-lookup': 'A map remembers positions and is part of the solution, but the pattern is the window it supports.',
    'dp-1d': 'The window length can be seen as a DP, but the standard view is a moving window.',
  }],
  hints: [
    'Checking every substring is O(n²) or worse. What if you grow a window to the right one character at a time?',
    'When the new character is already in the window, the window is invalid. Where must its left edge move to fix it?',
    'Remember the last index of each character. If a repeat lies inside the window, jump left to one past that index.',
  ],
  insight: 'Grow the window on the right; when a character repeats inside it, jump the left edge just past the earlier copy.',
  brute: 'Check every substring for repeats: O(n²) or O(n³) time.',
  optimal: 'One pass with a map of last positions: O(n) time, O(k) space for k distinct characters.',
  walk: ['Keep left at 0 and a map from character to its last index.', 'For each right, if the character was last seen at an index ≥ left, the window contains a repeat: set left to that index + 1.', 'Store the character’s new last index right.', 'The window s[left..right] is repeat-free; update best with its length.'],
  edge: ['Empty string: 0.', 'All characters the same: 1.', 'A repeat that is outside the window (before left) must be ignored.', 'All distinct: the whole string.'],
  works: ['Invariant: s[left..right] has no repeats. A new character only creates a repeat if its previous copy is at or after left, and moving left just beyond that copy removes exactly the conflict.', 'left never moves backwards, so each index is visited a constant number of times.'],
  time: ['O(n)', 'right moves forward once; left only jumps forward.'],
  space: ['O(k)', 'The map holds one entry per distinct character.'],
  solution,
  cases,
  sig: 'def length_of_longest_substring(s):\n    # length of the longest stretch with no repeated character\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
