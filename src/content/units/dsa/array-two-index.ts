import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def move_zeroes(nums):
    write = 0                                          #@init
    for read in range(len(nums)):
        if nums[read] != 0:                            #@check
            nums[write], nums[read] = nums[read], nums[write]   #@swap
            write += 1                                 #@advance
    return nums                                        #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'array-two-index',
  title: 'Move zeroes with a read and a write index',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Array', kind: 'numbers', default: [0, 1, 0, 3, 12], maxItems: 10 }],
  presets: [
    { label: 'Zeros up front', input: { nums: [0, 0, 4, 7, 2] } },
    { label: 'No zeros', input: { nums: [5, 3, 8, 1] } },
    { label: 'All zeros', input: { nums: [0, 0, 0] } },
    { label: 'Mixed', input: { nums: [4, 0, 0, 2, 0, 7, 9] } },
  ],
  run({ nums: raw }) {
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('Enter at least one number');
    const r = new Recorder(code);
    const nums = [...raw];
    const ids = nums.map((_, i) => i);
    // Invariant: nums[0..write-1] are the non-zeros seen so far (in order);
    // nums[write..read-1] are all zeros.
    const view = (write: number, read?: number, hot: Record<number, Tone> = {}): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      const edge = read === undefined ? write : read;
      nums.forEach((_, i) => {
        if (i < write) tones[i] = 'done';
        else if (i < edge) tones[i] = 'muted';
      });
      if (read !== undefined && read < nums.length) tones[read] = 'compare';
      Object.assign(tones, hot);
      const pointers: Record<string, number> = { write };
      if (read !== undefined) pointers.read = read;
      const range = read !== undefined && write < read ? { from: write, to: read - 1, tone: 'muted' as Tone, label: 'zeros' } : undefined;
      return { type: 'array', title: 'nums', values: nums, ids, tones, pointers, range };
    };

    let write = 0;
    r.step('init', 'write marks the next slot for a non-zero value; read will scan every cell', [view(write)], { write });
    for (let read = 0; read < nums.length; read++) {
      r.op();
      if (nums[read] === 0) {
        r.step('check', `nums[${read}] = 0 → skip it, write stays at ${write}`, [view(write, read)], { read, write });
        continue;
      }
      r.step('check', `nums[${read}] = ${nums[read]} is non-zero → move it to slot ${write}`, [view(write, read)], { read, write });
      const same = write === read;
      [nums[write], nums[read]] = [nums[read], nums[write]];
      [ids[write], ids[read]] = [ids[read], ids[write]];
      r.op();
      r.step(
        'swap',
        same ? `write == read: swapping a cell with itself changes nothing` : `Swap nums[${write}] and nums[${read}] → ${nums[write]} moves forward, a zero moves back`,
        [view(write, read, { [write]: 'swap', [read]: 'swap' })],
        { read, write },
      );
      write++;
      r.step('advance', `write → ${write}; ${write} non-zero value${write === 1 ? '' : 's'} packed at the front`, [view(write, read)], { read, write });
    }
    r.step('done', `Done: ${nums.join(', ')}`, [view(write, nums.length, Object.fromEntries(nums.map((_, i) => [i, i < write ? 'done' : 'muted'])) as Record<number, Tone>)], { write, result: nums.join(',') });
    return { frames: r.frames, result: nums };
  },
  reference({ nums }) {
    return [...nums.filter((x) => x !== 0), ...nums.filter((x) => x === 0)];
  },
};

const tests = [
  { args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0] },
  { args: [[0]], expected: [0], name: 'single zero' },
  { args: [[]], expected: [], name: 'empty' },
  { args: [[1, 2, 3]], expected: [1, 2, 3], name: 'no zeros' },
  { args: [[0, 0, 1]], expected: [1, 0, 0], name: 'zeros first' },
  { args: [[-1, 0, -2, 0, 5]], expected: [-1, -2, 5, 0, 0], name: 'negatives keep their order' },
  { args: [[0, 0, 0]], expected: [0, 0, 0], name: 'all zeros' },
];

const unit: Unit = {
  id: 'array-two-index',
  hook: 'Most "do it in place, O(1) extra space" array questions are one trick: a fast **read** index scans, a slow **write** index marks where the next kept value goes. Learn it once and move-zeroes, dedupe and filter-in-place all fall out.',
  predict: {
    prompt: 'nums = [0, 1, 0, 3, 12]. When the scan finishes, what is the value of `write`?',
    options: ['0', '2', '3', '5'],
    answer: 2,
    explain: 'write advances once per non-zero value (1, 3 and 12), so it ends at 3. It is also the count of kept values and the index where the zeros start.',
  },
  viz,
  deeper: {
    points: [
      'Invariant: nums[0..write-1] holds the kept values in their original order; nums[write..read-1] holds only zeros.',
      'read moves on every iteration; write moves only when a value is kept, so write <= read always.',
      'Swapping (instead of copying) keeps the array a permutation and removes the need for a second "fill zeros" pass.',
      'The same skeleton solves remove-element and remove-duplicates: change only the condition that decides whether to keep nums[read].',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Advancing write on every iteration (it must move only when a value is kept)', 'Copying values forward and forgetting to zero the tail', 'Allocating a second list when the question says "in place"'],
  },
  practice: {
    language: 'python',
    fnName: 'move_zeroes',
    statement: 'Move every 0 in `nums` to the end while keeping the order of the other values. Do it in place with one pass, then return `nums`.',
    signature: 'def move_zeroes(nums):',
    solution: `def move_zeroes(nums):
    write = 0
    for read in @@range(len(nums))@@:
        if @@nums[read] != 0@@:
            @@nums[write], nums[read] = nums[read], nums[write]@@
            write @@+= 1@@
    return nums`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'move_zeroes',
    statement: 'This in-place move-zeroes routine returns the array unchanged. Find the bug.',
    buggy: `def move_zeroes(nums):
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
        write += 1
    return nums`,
    fixed: `def move_zeroes(nums):
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1
    return nums`,
    tests,
    bugType: 'write index advanced unconditionally',
    hint: 'How do write and read relate if write moves on every iteration?',
    explanation: 'write += 1 sits outside the if, so write always equals read and every swap is a cell swapped with itself. write must advance only when a non-zero value has been placed.',
  },
  boss: {
    title: 'Keep at most two copies',
    statement: 'You get a sorted list of integers. Remove duplicates in place so that each value appears at most twice, keeping the order. Use O(1) extra space and return the kept prefix of the list (the first k items).',
    language: 'python',
    fnName: 'keep_two',
    starter: `def keep_two(nums):
    # your code here
    pass
`,
    solution: `def keep_two(nums):
    write = 0
    for x in nums:
        if write < 2 or x != nums[write - 2]:
            nums[write] = x
            write += 1
    return nums[:write]`,
    tests: [
      { args: [[1, 1, 1, 2, 2, 3]], expected: [1, 1, 2, 2, 3] },
      { args: [[0, 0, 1, 1, 1, 1, 2, 3, 3]], expected: [0, 0, 1, 1, 2, 3, 3] },
      { args: [[]], expected: [], name: 'empty' },
      { args: [[5]], expected: [5], name: 'single' },
      { args: [[7, 7, 7, 7]], expected: [7, 7], name: 'all equal' },
      { args: [[-3, -3, -3, -1, 0, 0, 0]], expected: [-3, -3, -1, 0, 0], name: 'negatives' },
    ],
    hints: ['Reuse the read/write idea: read scans every value, write marks the end of the kept prefix.', 'Keep nums[read] unless it equals nums[write - 2] (the second-to-last kept value). For the first two items always keep.'],
    combines: ['two-pointers', 'binary-search'],
  },
  quiz: [
    {
      prompt: 'In the read/write pattern, which statement is always true?',
      options: ['read < write', 'write <= read', 'write == read', 'write is always len(nums) - 1'],
      answer: 1,
      explain: 'write only advances when read has found something to keep, so it can never pass read.',
    },
  ],
};

export default unit;
