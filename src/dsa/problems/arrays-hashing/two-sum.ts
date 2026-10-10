import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './two-sum.py?raw';
import cases from './two-sum.cases.json';

interface In {
  nums: number[];
  target: number;
}

const viz: VizDef<In> = {
  id: 'two-sum',
  title: 'Two Sum',
  code: solution,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'nums', kind: 'numbers', default: [2, 11, 5, 10, 7, 8], maxItems: 14 },
    { key: 'target', label: 'target', kind: 'number', default: 9 },
  ],
  presets: [
    { label: 'Partner is far back', input: { nums: [2, 11, 5, 10, 7, 8], target: 9 } },
    { label: 'Same value twice', input: { nums: [4, 4], target: 8 } },
    { label: 'Negatives', input: { nums: [-4, 6, 4, 11], target: 0 } },
    { label: 'No pair', input: { nums: [1, 2, 4], target: 100 } },
  ],
  run({ nums, target }) {
    const r = new TraceRecorder(solution);
    const seen = new Map<number, number>();
    const view = (i: number, hot: Tone | null, look: Tone | null, need?: number, partner?: number) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      if (hot && i < nums.length) tones[i] = hot;
      if (partner !== undefined) tones[partner] = 'found';
      const mapTones: Record<string, Tone> = {};
      if (need !== undefined && look) mapTones[String(need)] = look;
      return [arrayView(nums, { title: `nums   (target = ${target})`, tones, pointers: i < nums.length ? { i } : undefined }), hashMapView(seen, { title: 'seen (value → index)', tones: mapTones })];
    };
    r.step('init', 'seen maps each value we pass to its index, so a later number can find its partner.', view(0, null, null), { seen: '{}' });
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i];
      const need = target - x;
      r.op();
      r.step('loop', `Next number: nums[${i}] = ${x}`, view(i, 'active', null), { i, x });
      r.predictChoice('need', `Which earlier value would pair with ${x} to make ${target}?`, String(need), [String(target + x), String(target), String(x)], i, `target - x = ${target} - ${x} = ${need}. We look for exactly that value.`);
      r.step('need', `need = target - x = ${target} - ${x} = ${need}`, view(i, 'active', null), { i, x, need });
      const hit = seen.has(need);
      r.step('check', `Is ${need} in seen?`, view(i, 'compare', hit ? 'found' : 'compare', need), { i, x, need });
      if (hit || seen.size >= 2) r.predict(hit ? 'hit' : 'miss', `Is ${need} already in seen?`, ['Yes: we have our pair', 'No: remember this number and move on'], hit ? 0 : 1, hit ? `${need} was stored at index ${seen.get(need)}, and ${need} + ${x} = ${target}.` : `${need} has not been passed yet. It might still come later and pair with ${x}.`);
      if (hit) {
        const j = seen.get(need)!;
        r.step('found', `Yes: seen[${need}] = ${j}. Indices ${j} and ${i} add up to ${target}.`, view(i, 'found', 'found', need, j), { i, j, result: `[${j}, ${i}]` });
        return { frames: r.frames, result: [j, i] };
      }
      seen.set(x, i);
      r.step('store', `No. Store ${x} → ${i} in seen and continue.`, view(i + 1, null, null), { i, x, seen: JSON.stringify(Object.fromEntries(seen)) });
    }
    r.step('none', 'We ran out of numbers without a pair: return an empty list.', view(nums.length, null, null), { result: '[]' });
    return { frames: r.frames, result: [] };
  },
  reference({ nums, target }) {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return [i, j];
    return [];
  },
};

const content: ProblemContent = {
  summary: 'You get a list of integers and a target value. Find the two positions whose numbers add up to the target and return those positions. Exactly one valid pair exists, and a position may not be used twice.',
  example: { input: 'nums = [6, 1, 9, 4], target = 10', output: '[0, 3]', note: 'nums[0] + nums[3] = 6 + 4 = 10. Return indices, not values.' },
  pattern: {
    answer: 'hash-lookup',
    options: ['hash-lookup', 'two-pointers', 'sliding-window', 'binary-search'],
    why: 'For each number x the question is "did target - x appear earlier?". Remembering earlier numbers in a hash map turns that question into an O(1) lookup.',
    notes: {
      'two-pointers': 'Two pointers works on a sorted array, but here we must return original indices, and sorting would scramble them. A hash map avoids sorting.',
      'sliding-window': 'The two numbers can be far apart, so no contiguous window captures them.',
      'binary-search': 'It could find each partner in a sorted copy, but you would lose the indices and pay for the sort. A hash map is simpler and faster.',
    },
  },
  hints: [
    'For every number x there is exactly one partner that would work. What is it, in terms of x and the target?',
    'You do not need to look at numbers that come later: when you reach the second number of the pair, the first one is already behind you.',
    'Store each number you pass together with its index in a hash map. Before storing the current number, check whether its partner is already there.',
  ],
  explanation: {
    insight: 'Walk once. For the current number x, ask the map whether target - x was already seen. If yes you are done, if not store x.',
    brute: 'Brute force: try every pair of positions. O(n²) time, O(1) space.',
    optimal: 'One pass with a hash map from value to index: O(n) time, O(n) space.',
    walkthrough: [
      'Start with an empty map called seen. It will map each value we have passed to the index where we saw it.',
      'At index i with value x, compute need = target - x. If need is in seen, the earlier index seen[need] and the current index i form the answer.',
      'If not, store seen[x] = i and continue. We store after checking, which is what stops a number from pairing with itself.',
      'The pair is found when its second member is reached, so one pass is enough. The first member was stored on the way past.',
    ],
    edgeCases: ['The same value twice, such as [3, 3] with target 6: the first 3 is stored, the second finds it.', 'A number that is half the target must not pair with itself: checking before storing handles it.', 'Zero and negative numbers need no special case.', 'The map stores the last index of each value, which is fine because only one answer exists.'],
    whyItWorks: [
      'Invariant: before looking at index i, seen holds every value at indices below i. So if some earlier index j has nums[j] = target - nums[i], it is in the map and we find it. If the pair is (j, i) with j < i we find it exactly when we reach i.',
      'Because we check first and store second, the current element is never in the map when we look, so an element cannot be paired with itself.',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'One pass; each step does one map lookup and one insert, both O(1) on average.' },
    space: { big: 'O(n)', why: 'In the worst case the map holds every number before the pair is found.' },
  },
  solution,
  task: taskFrom(cases, 'def two_sum(nums, target):\n    # return the two indices whose values add up to target\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([nums, target]) => ({ nums, target }),
};

export default content;
