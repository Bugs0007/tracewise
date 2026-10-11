import { chipsView, hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './partition-labels.py?raw';
import cases from './partition-labels.cases.json';

const viz = vizOf<{ s: string }>({
  id: 'partition-labels',
  title: 'Partition Labels',
  solution,
  inputs: [{ key: 's', label: 's (lowercase)', kind: 'string', default: 'abacdxcdyz', maxItems: 14 }],
  presets: [
    { label: 'Three parts', input: { s: 'abacdxcdyz' } },
    { label: 'All different', input: { s: 'abcd' } },
    { label: 'One big part', input: { s: 'abcab' } },
    { label: 'Blocks', input: { s: 'aabbcc' } },
  ],
  validate: ({ s }) => (/^[a-z]+$/.test(s) ? null : 'Use 1 to 14 lowercase letters'),
  run({ s }) {
    const r = new TraceRecorder(solution);
    const last: Record<string, number> = {};
    [...s].forEach((c, i) => (last[c] = i));
    const sizes: number[] = [];
    let start = 0;
    let end = 0;
    let askedExtend = false;
    let askedCut = false;
    const view = (i: number) => [
      stringView(s, { title: 'string (bracket = the part being built)', pointers: { i, end }, window: { from: start, to: Math.max(start, end), label: 'current part', tone: 'active' } }),
      hashMapView(Object.fromEntries(Object.entries(last).map(([c, v]) => [c, `last at ${v}`])), { title: 'last position of each letter' }),
      chipsView(sizes, { title: 'part sizes so far' }),
    ];
    r.step('last', 'First note the LAST position of every letter. A part must reach at least that far for every letter it contains.', view(0), {});
    r.step('init', 'start is where the current part begins; end is the farthest last-position of any letter inside it.', view(0), {});
    for (let i = 0; i < s.length; i++) {
      r.op();
      const old = end;
      end = Math.max(end, last[s[i]]);
      r.step('extend', `"${s[i]}" last appears at ${last[s[i]]}, so the part must reach at least there: end = max(${old}, ${last[s[i]]}) = ${end}.`, view(i), { i });
      if (!askedExtend && end > old && i > 0) {
        askedExtend = true;
        r.predict('extend', `"${s[i]}" appears again later at ${last[s[i]]}. What happens to the current part?`, ['It must stretch to include that later position', 'It stays the same', 'A new part starts here'], 0, 'If the part ended earlier, the letter would appear in two parts.');
      }
      if (i === end) {
        if (!askedCut) {
          askedCut = true;
          r.predictChoice('cut', `We are at index ${i} and end is ${end}. A part started at ${start}. How long is it?`, String(end - start + 1), [String(end - start), String(end), String(i + 1 + start)], i, 'Positions start … end inclusive: end − start + 1.');
        }
        sizes.push(end - start + 1);
        r.step('cut', `i == end (${i}): nothing in this part appears later. Cut here: size ${end - start + 1}.`, view(i), { size: end - start + 1 });
        start = i + 1;
      }
    }
    r.step('done', `Part sizes: [${sizes.join(', ')}].`, view(s.length - 1), { result: JSON.stringify(sizes) });
    return { frames: r.frames, result: sizes };
  },
  reference({ s }) {
    const out: number[] = [];
    let prev = 0;
    for (let i = 1; i <= s.length; i++) {
      const left = new Set(s.slice(0, i));
      if (i === s.length || ![...s.slice(i)].some((c) => left.has(c))) {
        out.push(i - prev);
        prev = i;
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Cut a string into as many consecutive parts as possible so that no letter appears in more than one part. Return the length of each part, in order.',
  example: ['"abcab"', '[5]', 'The letters a and b appear at both ends, so the only valid cut leaves the whole string as one part.'],
  pattern: ['greedy', ['greedy', 'two-pointers', 'hash-lookup', 'sliding-window'], 'Know where each letter last appears. Walk through the string, extending the current part to cover the last occurrence of every letter it contains; when the walk reaches that boundary, the part can be closed.', {
    'two-pointers': 'The scan uses a start and an end marker, but the key idea is the greedy extension to last occurrences.',
    'hash-lookup': 'The last-position map is the helper.',
    'sliding-window': 'The part grows only; it never shrinks.',
  }],
  hints: [
    'If a part contains a letter, how far must that part reach?',
    'When can a part safely end?',
    'Record the last index of each letter. Scan with end = max(end, last[ch]). When i == end, close the part.',
  ],
  insight: 'A part can end exactly when the scan position equals the farthest last-occurrence of everything inside it.',
  brute: 'Test every cut position for shared letters: O(n · 26).',
  optimal: 'One pass after building the last-index map: O(n) time, O(1) space (26 letters).',
  walk: ['last = {ch: i} for the last occurrence of each letter.', 'start = end = 0.', 'For each i: end = max(end, last[s[i]]).', 'If i == end: record end − start + 1 and set start = i + 1.'],
  edge: ['All letters distinct (every letter its own part).', 'One letter appearing at both ends (single part).', 'Repeated adjacent letters.', 'A single letter.'],
  works: ['A cut after position i is valid exactly when no letter on the left appears on the right, i.e. every letter in the current part has its last occurrence ≤ i. The scan detects that moment.', 'Cutting as early as possible maximises the number of parts.'],
  time: ['O(n)', 'Two passes.'],
  space: ['O(1)', 'At most 26 letters.'],
  solution,
  cases,
  sig: 'def partition_labels(s):\n    # sizes of the parts, cutting as many parts as possible with no letter in two parts\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
