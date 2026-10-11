import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A greedy algorithm makes the best-looking choice at each step and never looks back. It is fast and short, but only correct when a proof says the local choice cannot hurt the final answer. Your job in a greedy problem is to find that proof, or at least to convince yourself with a small counter-example search.',
    'Most greedy solutions fit one of a few shapes: keep a running summary that is all the future needs (the farthest reach, a running sum, the lowest and highest possible count), process things in a good order (smallest card first, earliest end first), or reduce a hard-looking question to a simple necessary condition (total fuel must cover the total cost).',
    'When you suspect a greedy rule, test it against a brute-force solution on small random inputs. If you find a counter-example, the problem needs dynamic programming instead.',
  ],
  checklist: [
    'A single pass with a few variables seems to be enough: you only ever need the best/farthest/lowest so far.',
    'There is a forced first move: the smallest card must start a group, a negative running sum should be dropped.',
    'Choosing the locally best option never closes off a better one later (exchange argument).',
    'The conditions can be checked with a range (lowest and highest possible count) instead of enumerating choices.',
    'A restart rule exists: when the current attempt fails at position i, none of the earlier candidates can work either.',
    'You can write a brute force that agrees with your greedy on small random inputs.',
  ],
  template: [
    {
      title: 'Running summary (Kadane)',
      code: `best = curr = nums[0]
for x in nums[1:]:
    curr = max(x, curr + x)      # extend or restart
    best = max(best, curr)`,
    },
    {
      title: 'Farthest reach',
      code: `reach = 0
for i, step in enumerate(nums):
    if i > reach:
        return False
    reach = max(reach, i + step)
return True`,
    },
    {
      title: 'Range of possibilities',
      code: `lo = hi = 0
for ch in s:
    lo += delta_min(ch)
    hi += delta_max(ch)
    if hi < 0: return False
    lo = max(lo, 0)
return lo == 0`,
    },
  ],
  boss: {
    seconds: 420,
    problem: 'jump-game-ii',
    note: 'The boss problem is Jump Game II. Explain what the ranges "end" and "farthest" mean and why counting a jump when i == end is correct.',
    quiz: [
      {
        prompt: 'In Maximum Subarray, why can a negative running sum be thrown away?',
        options: ['Any block that extends it would be better off starting fresh', 'Negative numbers are invalid', 'It is faster', 'The array must stay positive'],
        answer: 0,
        explain: 'Adding a negative amount to a block can only reduce its sum, so starting a new block at the next number is never worse.',
      },
      {
        prompt: 'In Jump Game, the cells reachable from the start always form…',
        options: ['A prefix of the row (everything up to some farthest index)', 'Every other cell', 'Only the cells with non-zero jumps', 'A random set'],
        answer: 0,
        explain: 'Because you may jump any shorter distance, reaching index j means reaching every index before j.',
      },
      {
        prompt: 'In Gas Station, when the tank first goes negative at station i, where is the next candidate start?',
        options: ['Station i + 1', 'Station i', 'Station 0', 'The previous station'],
        answer: 0,
        explain: 'Every start between the old candidate and i would also run out by i, so all of them can be skipped.',
      },
      {
        prompt: 'Why is the smallest remaining card the one to start a group with in Hand of Straights?',
        options: ['No smaller card exists to precede it in a group, so it can only be the first of its group', 'It is the cheapest', 'Sorting requires it', 'It guarantees the last group is full'],
        answer: 0,
        explain: 'A group is consecutive, so the smallest card in it is its first card; the smallest unused card therefore starts a group.',
      },
      {
        prompt: 'In Partition Labels, when is it safe to end the current part at index i?',
        options: ['When i equals the farthest last-occurrence of every letter seen in the part', 'When the letter repeats', 'After every letter', 'When the part is 26 long'],
        answer: 0,
        explain: 'At that moment no letter in the part appears later in the string.',
      },
    ],
  },
};

export default topic;
