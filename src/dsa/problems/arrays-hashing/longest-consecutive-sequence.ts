import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './longest-consecutive-sequence.py?raw';
import cases from './longest-consecutive-sequence.cases.json';

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'longest-consecutive-sequence',
  title: 'Longest Consecutive Sequence',
  code: solution,
  language: 'python',
  inputs: [{ key: 'nums', label: 'nums', kind: 'numbers', default: [90, 12, 200, 9, 11, 10, 13, 91], maxItems: 14 }],
  presets: [
    { label: 'Two runs', input: { nums: [90, 12, 200, 9, 11, 10, 13, 91] } },
    { label: 'Duplicates', input: { nums: [40, 38, 41, 37, 39, 36, 100, 42, 42] } },
    { label: 'No neighbours', input: { nums: [10, 30, 20, 50] } },
    { label: 'Empty', input: { nums: [] } },
  ],
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const values = [...new Set(nums)]; // the set, in the order we will visit it
    const has = new Set(values);
    let best = 0;
    const idx = new Map(values.map((v, i) => [v, i]));
    const view = (cur: number | null, o: { tones?: Record<number, Tone>; pointer?: boolean } = {}) => {
      const tones: Record<number, Tone> = { ...(o.tones ?? {}) };
      return [arrayView(values, { title: 'values (the set)', tones, pointers: cur !== null && o.pointer !== false ? { n: idx.get(cur)! } : undefined }), hashMapView({ best }, { title: 'longest run so far' })];
    };
    r.step('init', `Put everything in a set (duplicates collapse): ${values.length} distinct value${values.length === 1 ? '' : 's'}. Membership checks are now O(1).`, view(null), { values: values.length });
    r.step('best', 'best remembers the longest run found so far.', view(null), { best });
    const visited: Record<number, Tone> = {};
    for (const n of values) {
      r.op();
      r.step('loop', `Look at n = ${n}.`, view(n, { tones: { ...visited, [idx.get(n)!]: 'active' } }), { n, best });
      const isStart = !has.has(n - 1);
      r.step('isStart', `Is ${n - 1} in the set? If it is, ${n} is in the middle of a run and not worth starting from.`, view(n, { tones: { ...visited, [idx.get(n)!]: 'compare', ...(has.has(n - 1) ? { [idx.get(n - 1)!]: 'compare' } : {}) } }), { n, best });
      r.predict(isStart ? 'start' : 'skip', `Does ${n} start a run? (Is ${n - 1} missing from the set?)`, ['Yes: nothing is just below it, so start counting here', 'No: a smaller neighbour exists, so skip it'], isStart ? 0 : 1, isStart ? `${n - 1} is not in the set, so no run can extend ${n} downwards: ${n} is a run start.` : `${n - 1} is in the set, so ${n} belongs to a run that begins lower down. That run is counted when we reach its start.`);
      if (!isStart) {
        visited[idx.get(n)!] = 'muted';
        r.step('isStart', `Yes, ${n - 1} exists: skip ${n}. The run it belongs to is counted from its start.`, view(n, { tones: { ...visited, [idx.get(n)!]: 'muted' } }), { n, best });
        continue;
      }
      let length = 1;
      const run = new Set<number>([n]);
      const runTones = () => Object.fromEntries([...run].map((v) => [idx.get(v)!, 'found' as Tone]));
      r.step('startRun', `${n} is a run start: length = 1.`, view(n, { tones: { ...visited, ...runTones() } }), { n, length });
      for (;;) {
        const next = n + length;
        const more = has.has(next);
        r.step('extend', `Is n + length = ${next} in the set?`, view(n, { tones: { ...visited, ...runTones(), ...(more ? { [idx.get(next)!]: 'compare' } : {}) } }), { n, length, next });
        if (length >= 2) r.predict('extend', `Is ${next} in the set?`, ['Yes: the run grows', 'No: the run ends here'], more ? 0 : 1, more ? `${next} is present, so the run reaches one step further.` : `${next} is missing, so the run stops at ${next - 1}.`);
        if (!more) break;
        length++;
        run.add(next);
        r.step('grow', `Yes: length becomes ${length}.`, view(n, { tones: { ...visited, ...runTones() } }), { n, length });
      }
      best = Math.max(best, length);
      for (const v of run) visited[idx.get(v)!] = 'done';
      r.step('update', `Run of length ${length} ends. best = max(best, ${length}) = ${best}.`, view(n, { tones: { ...visited, ...runTones() }, pointer: false }), { n, length, best });
    }
    r.step('done', values.length ? `Every start has been tried. The longest run has length ${best}.` : 'The set is empty, so the longest run has length 0.', view(null, { tones: visited }), { best });
    return { frames: r.frames, result: best };
  },
  reference({ nums }) {
    const s = [...new Set(nums)].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    s.forEach((v, i) => {
      run = i && s[i - 1] === v - 1 ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return best;
  },
};

const content: ProblemContent = {
  summary: 'Given an unsorted list of integers, find the length of the longest run of values that follow each other without gaps (like 4, 5, 6, 7), regardless of where they sit in the list. You are expected to do better than sorting.',
  example: { input: 'nums = [31, 8, 30, 7, 29, 9, 100]', output: '3', note: 'The runs are 29-30-31 (length 3) and 7-8-9 (length 3); 100 stands alone. Both of length 3, so the answer is 3.' },
  pattern: {
    answer: 'set-run-start',
    options: ['set-run-start', 'sorting', 'union-find', 'sliding-window'],
    why: 'Put every value in a set for O(1) lookups. Then only count from numbers with no predecessor (n - 1 is absent): each run is walked once, from its start, which keeps the total linear.',
    notes: {
      sorting: 'Sorting works and is a good first answer, but costs O(n log n). The set approach reaches O(n) by never sorting.',
      'union-find': 'Union-Find can also join neighbouring values, but it is heavier machinery than the problem needs.',
      'sliding-window': 'A window needs positions in the list to be contiguous, but the run members can be anywhere in the unsorted input.',
    },
  },
  hints: [
    'If the input were sorted, how would you find the longest run? Sorting costs O(n log n). Is there a way to avoid sorting entirely?',
    'Store all values in a set so you can ask "is v present?" instantly. Then, from some number n, you can keep asking about n + 1, n + 2, and so on.',
    'Walking a run from every number is too slow on long runs. Which numbers are worth starting from? Only those where n - 1 is not in the set.',
  ],
  explanation: {
    insight: 'Only start counting at the beginning of a run (when n - 1 is absent). Then every run is walked exactly once, so the total work is linear.',
    brute: 'Sort and scan neighbours: O(n log n) time. Or walk upwards from every number: O(n²) in the worst case.',
    optimal: 'Set plus run starts: O(n) time, O(n) space.',
    walkthrough: [
      'Build a set of all values. Duplicates disappear, which is exactly what we want because a repeat never extends a run.',
      'For each value n in the set, check whether n - 1 is in the set. If it is, n is in the middle (or end) of a run, and that run will be counted from its start, so skip n.',
      'If n - 1 is absent, n is the start of a run. Keep asking whether n + 1, n + 2, … are in the set, counting how many steps you get.',
      'Track the largest run length seen. Every element is visited once by the outer loop, and the inner while loop only runs from run starts, so each element is touched by it at most once.',
    ],
    edgeCases: ['Empty input: the answer is 0.', 'Duplicates must not inflate the length (the set handles it).', 'Negative numbers and zero: runs can cross zero.', 'All values isolated: the answer is 1.'],
    whyItWorks: [
      'Every run has exactly one smallest element, and that element is the only one in the run whose predecessor is missing. So each run is started exactly once.',
      'The inner loop for a run of length L takes L steps, and the run lengths of the different runs add up to at most the number of distinct values. So the inner loops total O(n) and the outer loop is O(n).',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'Each value is visited by the outer loop once, and the inner extension only starts at run starts, so each value is stepped over at most once more.' },
    space: { big: 'O(n)', why: 'The set holds up to n distinct values.' },
  },
  solution,
  task: taskFrom(cases, 'def longest_consecutive(nums):\n    # return the length of the longest run of consecutive values\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([nums]) => ({ nums }),
};

export default content;
