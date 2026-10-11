import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A sliding window is a contiguous range [left, right] that you grow on the right and shrink on the left while some property holds. Instead of re-examining every substring or subarray, you update what changes at the two edges.',
    'There are two flavours. A fixed-size window slides one step at a time (add one element, drop one). A variable-size window expands until it becomes invalid or valid, then contracts, and you record the best size along the way.',
    'The two questions to ask every time: what do I maintain as the window changes (a count, a sum, a map, a deque), and when does the window become invalid so that left must move.',
  ],
  checklist: [
    'The answer is a contiguous subarray or substring.',
    'You are asked for the longest, shortest, maximum or minimum such range, or whether one exists.',
    'The property can be updated in O(1) when one element enters or leaves.',
    'Moving the right edge can only make the window "worse" (or only "better"), which tells you when to move left.',
    'Brute force examines every substring, which is O(n²) or more.',
    'For window maximums or minimums, a monotonic deque keeps the extreme at the front.',
  ],
  template: [
    {
      title: 'Variable window: longest range that stays valid',
      code: `left = 0
best = 0
for right, x in enumerate(a):
    add(x)                      # update the state for the new element
    while not valid():          # shrink until the window is valid again
        remove(a[left])
        left += 1
    best = max(best, right - left + 1)`,
    },
    {
      title: 'Fixed window of size k',
      code: `window = {}                     # counts, sum, ...
for right, x in enumerate(a):
    add(x)
    if right >= k:              # the window grew past k: drop the oldest
        remove(a[right - k])
    if right >= k - 1:          # a full window is ready
        use(window)`,
    },
    {
      title: 'Monotonic deque for window maximum',
      code: `from collections import deque
dq = deque()                    # indices, values in decreasing order
for i, x in enumerate(a):
    while dq and a[dq[-1]] <= x:
        dq.pop()
    dq.append(i)
    if dq[0] <= i - k:
        dq.popleft()
    if i >= k - 1:
        out.append(a[dq[0]])`,
    },
  ],
  boss: {
    seconds: 240,
    problem: 'longest-substring-without-repeating-characters',
    note: 'The boss problem is Longest Substring Without Repeating Characters. Decide what to remember (a set or last positions) before you code.',
    quiz: [
      {
        prompt: 'You need the length of the **longest** subarray that satisfies a property that can only get worse as the window grows. Which approach fits?',
        options: ['Variable sliding window: grow right, shrink left when invalid', 'Binary search on sorted values', 'A stack of indices', 'Recursion with memoization'],
        answer: 0,
        explain: 'When growing can only break the property, contracting from the left restores it, and each element enters and leaves once, giving O(n).',
      },
      {
        prompt: 'In Longest Substring Without Repeating Characters, when a repeated character appears, where should `left` go?',
        options: ['One past the earlier copy of that character (if it is inside the window)', 'Back to 0', 'To the current right index', 'It should not move'],
        answer: 0,
        explain: 'Moving left just past the earlier copy removes exactly the conflict. A copy before left is already outside the window and is ignored.',
      },
      {
        prompt: 'Why can Best Time to Buy and Sell Stock be solved with a single running minimum?',
        options: ['For any sell day, the best buy day is the cheapest day before it', 'Prices are sorted', 'You may trade many times', 'The minimum is always on day 0'],
        answer: 0,
        explain: 'Profit on a sell day is price minus the lowest earlier price, so tracking that minimum and taking the maximum profit over all days is enough.',
      },
      {
        prompt: 'In Longest Repeating Character Replacement, a window is valid when…',
        options: ['length − (count of its most common letter) ≤ k', 'all letters are the same', 'its length is at most k', 'it contains no repeats'],
        answer: 0,
        explain: 'You would replace everything except the most common letter, so the cost is length minus that count.',
      },
      {
        prompt: 'Which structure gives the **maximum of each window** of size k in O(n) overall?',
        options: ['A monotonic deque of indices', 'A sorted list rebuilt per window', 'A hash map of counts', 'A binary search tree rebuilt per window'],
        answer: 0,
        explain: 'Each index enters and leaves the deque once, and the deque is kept in decreasing value order, so the front is the max.',
      },
      {
        prompt: 'For Minimum Window Substring, what does the `missing` counter tell you?',
        options: ['How many needed letters the window still lacks (0 means it covers t)', 'The length of the window', 'How many letters were removed', 'The number of distinct letters in s'],
        answer: 0,
        explain: 'With negative counts allowed for surplus letters, missing reaches 0 exactly when every needed letter (with repeats) is covered.',
      },
      {
        prompt: 'Permutation in String uses a window of a **fixed** size. What is that size?',
        options: ['len(s1)', 'len(s2)', 'The number of distinct letters in s1', '26'],
        answer: 0,
        explain: 'A rearrangement of s1 uses every letter of s1 exactly, so its length equals len(s1).',
      },
    ],
  },
};

export default topic;
