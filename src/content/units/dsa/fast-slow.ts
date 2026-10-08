import { Recorder } from '@/engine/recorder';
import { circleLayout, graphPanel, type EdgeSpec } from '@/engine/layout';
import type { ArrayPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def find_duplicate(nums):
    slow = fast = nums[0]                  #@init
    while True:
        slow = nums[slow]                  #@slow1
        fast = nums[nums[fast]]            #@fast1
        if slow == fast:                   #@meet
            break
    slow = nums[0]                         #@reset
    while slow != fast:                    #@loop2
        slow = nums[slow]                  #@slow2
        fast = nums[fast]                  #@fast2
    return slow                            #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'fast-slow',
  title: 'Find the duplicate with a tortoise and a hare',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Array of n+1 values, each in 1..n', kind: 'numbers', default: [2, 5, 9, 6, 9, 3, 8, 9, 7, 1], maxItems: 10, help: 'Exactly one value repeats' }],
  presets: [
    { label: 'Short', input: { nums: [1, 3, 4, 2, 2] } },
    { label: 'Meets at once', input: { nums: [3, 1, 3, 4, 2] } },
    { label: 'Triple', input: { nums: [2, 2, 2, 2, 2] } },
    { label: 'Two items', input: { nums: [1, 1] } },
  ],
  run({ nums: raw }) {
    if (!Array.isArray(raw) || raw.length < 2) throw new Error('Enter at least two numbers');
    const nums = [...raw];
    const n = nums.length - 1;
    if (nums.some((v) => !Number.isInteger(v) || v < 1 || v > n)) throw new Error(`Every value must be an integer from 1 to ${n} (the array has ${n + 1} items)`);
    const r = new Recorder(code);
    const ids = nums.map((_, i) => String(i));
    const edges: EdgeSpec[] = nums.flatMap((v, i) => (v === i ? [] : [{ from: String(i), to: String(v) }]));
    const pos = circleLayout(ids, 460, 300);

    const panels = (slow: number, fast: number, phase: string, tone?: Tone): Panel[] => {
      const tones: Record<number, Tone> = {};
      const nt: Record<string, Tone> = {};
      if (slow === fast) {
        tones[slow] = tone ?? 'found';
        nt[String(slow)] = tone ?? 'found';
      } else {
        tones[slow] = 'active';
        tones[fast] = 'compare';
        nt[String(slow)] = 'active';
        nt[String(fast)] = 'compare';
      }
      const tags: Record<string, string[]> = {};
      (tags[String(slow)] ??= []).push('slow');
      (tags[String(fast)] ??= []).push('fast');
      const arr: ArrayPanel = { type: 'array', title: `nums — ${phase}`, values: nums, tones, pointers: { slow, fast } };
      const g = graphPanel(ids, edges, pos, true, { tones: nt, tags, title: 'Follow i → nums[i]' }, { width: 460, height: 300 });
      return [arr, g];
    };

    let slow = nums[0];
    let fast = nums[0];
    const P1 = 'phase 1: find a meeting point';
    const P2 = 'phase 2: find the cycle entrance';
    r.step('init', `Treat nums[i] as "next of i". Start both at nums[0] = ${slow}`, panels(slow, fast, P1), { slow, fast });
    while (true) {
      slow = nums[slow];
      r.op();
      r.step('slow1', `slow takes one step → ${slow}`, panels(slow, fast, P1, 'active'), { slow, fast });
      fast = nums[nums[fast]];
      r.op(2);
      r.step('fast1', `fast takes two steps → ${fast}`, panels(slow, fast, P1), { slow, fast });
      if (slow === fast) {
        r.step('meet', `slow == fast == ${slow}: they met inside the cycle`, panels(slow, fast, P1), { slow, fast });
        break;
      }
      r.step('meet', `${slow} ≠ ${fast}: keep going`, panels(slow, fast, P1), { slow, fast });
    }
    slow = nums[0];
    r.step('reset', `Move slow back to the start (${slow}); fast stays at ${fast}. Now both go one step at a time`, panels(slow, fast, P2), { slow, fast });
    while (slow !== fast) {
      r.step('loop2', `${slow} ≠ ${fast}: step both`, panels(slow, fast, P2), { slow, fast });
      slow = nums[slow];
      fast = nums[fast];
      r.op(2);
      r.step('fast2', `slow → ${slow}, fast → ${fast}`, panels(slow, fast, P2), { slow, fast });
    }
    r.step('done', `They meet at ${slow}, the entrance of the cycle → duplicate = ${slow}`, panels(slow, fast, P2, 'found'), { duplicate: slow });
    return { frames: r.frames, result: slow };
  },
  reference({ nums }) {
    // walk from index 0 until a node repeats: the first repeated node is the cycle entrance
    const seen = new Set<number>();
    let cur = 0;
    while (!seen.has(cur)) {
      seen.add(cur);
      cur = nums[cur];
    }
    return cur;
  },
};

const tests = [
  { args: [[1, 3, 4, 2, 2]], expected: 2 },
  { args: [[3, 1, 3, 4, 2]], expected: 3 },
  { args: [[2, 5, 9, 6, 9, 3, 8, 9, 7, 1]], expected: 9, name: 'long tail before the cycle' },
  { args: [[1, 1]], expected: 1, name: 'smallest array' },
  { args: [[3, 3, 3, 3, 3]], expected: 3, name: 'one value repeated many times' },
  { args: [[1, 4, 4, 2, 4]], expected: 4, name: 'value appears three times' },
  { args: [[2, 2, 3, 4, 1]], expected: 2 },
];

const unit: Unit = {
  id: 'fast-slow',
  hook: 'If the array has n+1 values in 1..n, there is a repeat, and you can find it in O(1) space without sorting or a set. The trick: read nums[i] as "the next index after i" and the duplicate becomes the entrance of a cycle.',
  predict: {
    prompt: 'Why must following i → nums[i] from index 0 eventually run into a cycle?',
    options: ['The array is sorted', 'There are n+1 indices but values only in 1..n, so some index is pointed to twice', 'Python lists are circular', 'Because slow and fast move at different speeds'],
    answer: 1,
    explain: 'n+1 slots map onto n possible targets, so two slots share a target (that is the duplicate). Two different indices leading to the same node means paths merge, and with finitely many nodes the walk must loop.',
  },
  viz,
  deeper: {
    points: [
      'Value 0 never appears, so index 0 is never pointed to: the walk starts on a tail and then enters the cycle.',
      'The duplicate value is the node with two incoming edges, which is exactly where the tail joins the cycle.',
      'Phase 1: fast moves twice as fast, so inside the cycle it must land on slow. Phase 2: restart slow at the beginning; walking both one step at a time makes them meet at the cycle entrance.',
      'It does not modify the array and uses O(1) space; alternatives are a set (O(n) space) or sorting (O(n log n) or mutation).',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Stopping after phase 1 and returning the meeting point (it is inside the cycle, not necessarily the entrance)', 'Moving fast one step in phase 2', 'Applying it to arrays that may contain 0 or values beyond n (indexing errors)'],
  },
  practice: {
    language: 'python',
    fnName: 'find_duplicate',
    statement: 'nums has n+1 integers, each between 1 and n, with exactly one value repeated (possibly many times). Return the repeated value without modifying nums, in O(1) extra space.',
    signature: 'def find_duplicate(nums):',
    solution: `def find_duplicate(nums):
    slow = fast = @@nums[0]@@
    while True:
        slow = @@nums[slow]@@
        fast = @@nums[nums[fast]]@@
        if slow == fast:
            break
    slow = @@nums[0]@@
    while slow != fast:
        slow = nums[slow]
        fast = @@nums[fast]@@
    return slow`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'find_duplicate',
    statement: 'This returns a value that is in the cycle but is not always the duplicate. Find the bug.',
    buggy: `def find_duplicate(nums):
    slow = fast = nums[0]
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    while slow != fast:
        slow = nums[slow]
        fast = nums[fast]
    return slow`,
    fixed: `def find_duplicate(nums):
    slow = fast = nums[0]
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    slow = nums[0]
    while slow != fast:
        slow = nums[slow]
        fast = nums[fast]
    return slow`,
    tests,
    bugType: 'missing phase-2 reset',
    hint: 'After phase 1, are slow and fast still on the same node? What does the second loop do then?',
    explanation: 'The meeting point is somewhere inside the cycle. Without moving slow back to the start, slow == fast already holds, the second loop never runs, and the meeting point is returned. Reset slow to the start so both walk to the entrance together.',
  },
  boss: {
    title: 'Happy number',
    statement: 'Replace a positive integer by the sum of the squares of its digits, and repeat. The number is happy if this process reaches 1; otherwise it loops forever in a cycle. Return True or False without storing every value you have seen.',
    language: 'python',
    fnName: 'is_happy',
    starter: `def is_happy(n):
    # your code here
    pass
`,
    solution: `def is_happy(n):
    def step(x):
        total = 0
        while x:
            x, d = divmod(x, 10)
            total += d * d
        return total

    slow, fast = n, step(n)
    while fast != 1 and slow != fast:
        slow = step(slow)
        fast = step(step(fast))
    return fast == 1`,
    tests: [
      { args: [19], expected: true },
      { args: [2], expected: false },
      { args: [1], expected: true, name: 'already 1' },
      { args: [7], expected: true },
      { args: [4], expected: false, name: 'sits inside the 4 → 16 → ... cycle' },
      { args: [100], expected: true },
      { args: [116], expected: false },
    ],
    hints: ['The sequence of values is a linked list defined by a function. Either it ends at 1 or it cycles. How do you detect a cycle without a set?', 'Define step(x) = sum of squared digits. Run slow = step(slow) and fast = step(step(fast)); stop when fast reaches 1 (happy) or slow meets fast (cycle).'],
    combines: ['fast-slow', 'll-floyd'],
  },
};

export default unit;
