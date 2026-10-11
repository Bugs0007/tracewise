import type { Tone } from '@/engine/types';
import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './minimum-window-substring.py?raw';
import cases from './minimum-window-substring.cases.json';

const viz = vizOf<{ s: string; t: string }>({
  id: 'minimum-window-substring',
  title: 'Minimum Window Substring',
  solution,
  inputs: [
    { key: 's', label: 's (the text)', kind: 'string', default: 'xaybzcxabc', maxItems: 16 },
    { key: 't', label: 't (letters to cover)', kind: 'string', default: 'abc', maxItems: 5 },
  ],
  presets: [
    { label: 'Window in the middle', input: { s: 'xaybzcxabc', t: 'abc' } },
    { label: 'Impossible', input: { s: 'abc', t: 'abd' } },
    { label: 'Repeated needs', input: { s: 'aabbbc', t: 'abb' } },
  ],
  validate: ({ t }) => (t.length < 1 ? 'Enter at least one letter in t' : null),
  run({ s, t }) {
    const r = new TraceRecorder(solution);
    const ch = [...s];
    if (!t || t.length > s.length) {
      r.step('guard', 't is empty or longer than s: no window can cover it.', [stringView(s, { title: 's' })], {});
      r.step('guardRet', 'Return an empty string.', [stringView(s, { title: 's' })], { result: '""' });
      return { frames: r.frames, result: '' };
    }
    const need = new Map<string, number>();
    let missing = t.length;
    let best: [number, number] = [0, Infinity];
    let left = 0;
    const needObj = () => Object.fromEntries([...need].map(([k, v]) => [k, v]));
    const view = (right: number, hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      for (let q = 0; q < left; q++) tones[q] = 'muted';
      if (best[1] !== Infinity) for (let q = best[0]; q <= best[1]; q++) tones[q] = 'done';
      if (hot && right >= 0 && right < ch.length) tones[right] = hot;
      return [
        stringView(s, { title: 's with the window [left, right]', tones, pointers: right >= 0 ? { left, right } : undefined, window: right >= left && right >= 0 ? { from: left, to: right, label: 'window', tone: 'active' } : undefined }),
        hashMapView(needObj(), { title: 'still needed (negative = surplus)' }),
        hashMapView({ missing, best: best[1] === Infinity ? 'none yet' : s.slice(best[0], best[1] + 1) }, { title: 'status' }),
      ];
    };
    r.step('guard', `Cover every letter of "${t}" (with counts) using the shortest window of s.`, view(-1), { t });
    for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);
    r.step('need', 'need starts as the letter counts of t.', view(-1), {});
    r.step('missing', `missing = ${missing}: how many letters are still uncovered.`, view(-1), { missing });
    for (let right = 0; right < ch.length; right++) {
      const c = ch[right];
      r.op();
      if ((need.get(c) ?? 0) > 0) missing--;
      need.set(c, (need.get(c) ?? 0) - 1);
      r.step('take', `Add s[${right}] = ${c} to the window.${(need.get(c)! >= 0) ? ' It was needed: missing drops.' : ' It was not needed (surplus).'}`, view(right, 'active'), { right, missing });
      r.predict(missing === 0 ? 'cover' : 'short', 'Does the window now contain every needed letter?', ['Yes: try shrinking it', 'Not yet: keep growing'], missing === 0 ? 0 : 1, missing === 0 ? 'missing is 0, so the window covers t.' : `${missing} needed letter${missing === 1 ? ' is' : 's are'} still missing.`);
      while (missing === 0) {
        if (right - left < best[1] - best[0]) {
          best = [left, right];
          r.step('record', `Window [${left}, ${right}] = "${s.slice(left, right + 1)}" covers t and is the shortest so far.`, view(right, 'found'), { best: s.slice(left, right + 1) });
        } else {
          r.step('better', `Window [${left}, ${right}] covers t but is not shorter than the best.`, view(right, 'active'), {});
        }
        const gone = ch[left];
        need.set(gone, need.get(gone)! + 1);
        const broke = need.get(gone)! > 0;
        r.predict('drop', `Remove s[${left}] = ${gone} from the left. Does the window still cover t?`, ['Yes: it can shrink more', 'No: a needed letter just left'], broke ? 1 : 0, broke ? `${gone} was needed and had no spare copy, so coverage breaks.` : `${gone} was extra, so the window still covers t.`);
        if (broke) missing++;
        left++;
        r.step('giveBack', broke ? `${gone} leaves and was needed: missing = ${missing}.` : `${gone} leaves but was surplus: still covered.`, view(right, 'active'), { left, missing });
      }
    }
    const out = best[1] === Infinity ? '' : s.slice(best[0], best[1] + 1);
    r.step('done', out ? `The shortest covering window is "${out}".` : 'No window covered t: return an empty string.', view(ch.length - 1), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ s, t }) {
    if (!t || t.length > s.length) return '';
    const need = new Map<string, number>();
    for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);
    let best = '';
    for (let i = 0; i < s.length; i++) {
      const c = new Map<string, number>();
      for (let j = i; j < s.length; j++) {
        c.set(s[j], (c.get(s[j]) ?? 0) + 1);
        if ([...need].every(([k, v]) => (c.get(k) ?? 0) >= v)) {
          if (!best || j - i + 1 < best.length) best = s.slice(i, j + 1);
          break;
        }
      }
    }
    return best;
  },
});

export default problem({
  summary: 'Given a text and a set of letters (with repeats counted), find the shortest stretch of the text that contains all of those letters at least as many times as needed. If none exists, answer with an empty string.',
  example: ['text = "bxaycb", need = "abc"', '"aycb"', 'It is the shortest stretch holding an a, a b and a c. If several windows tie, take the leftmost.'],
  pattern: ['sliding-window', ['sliding-window', 'frequency-count', 'binary-search', 'two-pointers'], 'Expand the right end until the window covers every needed letter, then shrink the left end as far as possible while it still does. Repeat across the string.', {
    'frequency-count': 'Counts are used to know when the window covers t, but the strategy is the expand-then-shrink window.',
    'binary-search': 'You could binary search the window length, but one expanding-and-shrinking pass is simpler and faster.',
    'two-pointers': 'The two pointers move in the same direction, which is the sliding-window shape.',
  }],
  hints: [
    'How would you know a window already contains every needed letter without rescanning it? Think of a counter of what is still missing.',
    'Once a window covers t, the only way to improve it is to make it shorter from the left. When should you stop shrinking?',
    'Track need counts that may go negative (surplus letters) and a single number "missing". When missing is 0 the window is valid.',
  ],
  insight: 'Grow right until every needed letter is covered, then shrink left as far as coverage allows, recording the best window each time.',
  brute: 'Check every substring against the counts: O(n²) windows.',
  optimal: 'One expanding/shrinking window with a `missing` counter: O(n + m) time.',
  walk: ['Count the letters of t into need and set missing = len(t).', 'Move right over s. If the letter is still needed, decrement missing; always decrement its count (it may go negative for surplus).', 'While missing is 0, record the window if it is shorter than the best, then remove s[left]: increase its count and, if it becomes positive, a needed letter is lost so missing goes up. Move left.', 'At the end return the best window (or an empty string).'],
  edge: ['t longer than s: impossible.', 't with repeated letters (counts matter).', 'The whole string is the only window.', 'Several windows of equal length: this solution returns the leftmost.'],
  works: ['A count of zero or less for a letter means the window has at least as many as needed. missing counts only the letters that are still short, so missing = 0 exactly when the window covers t.', 'Each index enters once and leaves at most once, so the work is linear. Shrinking only while the window covers t finds the shortest window ending at each right.'],
  time: ['O(n + m)', 'Each character of s is added and removed at most once; building need costs O(m).'],
  space: ['O(k)', 'The count map has one entry per distinct letter.'],
  solution,
  cases,
  sig: 'def min_window(s, t):\n    # shortest substring of s containing every letter of t (with counts); "" if none\n    pass\n',
  viz,
  fromArgs: ([s, t]) => ({ s, t }),
});
