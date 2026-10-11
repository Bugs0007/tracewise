import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Dynamic programming solves a problem by building the answer from answers to smaller versions of the same problem, remembering each small answer so it is computed only once. In one dimension the "smaller versions" are indexed by a single number: the first i items, the amount a, the step i, the prefix of length i.',
    'Four questions turn a problem into a recurrence. What does dp[i] mean (say it in words)? How does dp[i] depend on earlier entries (the last move, the last item, the last coin)? What are the starting values (usually dp[0])? In what order do I fill the table so the entries I need are ready?',
    'Often only the last one or two entries are needed, so the table collapses to a couple of variables. Some problems are not asking for dp[i] at the end of an array but the best over all positions (longest palindrome, best product), and some replace a quadratic scan with a clever sorted helper (the tails array for increasing subsequences).',
  ],
  checklist: [
    'The answer for the first i items can be built from the answer for fewer items.',
    'Choices are "take it or skip it", "end with a 1-step or a 2-step", "use this coin as the last one".',
    'A plain recursion would solve the same sub-problem many times (overlapping sub-problems).',
    'You are asked for a count, a minimum, a maximum or a yes/no, not for all the solutions themselves.',
    'The order of the input matters and positions are fixed (for subsets of values with a target sum, a boolean line over sums).',
    'You can say in one sentence what dp[i] stores. If you cannot, change the definition.',
  ],
  template: [
    {
      title: 'Bottom-up on a line',
      code: `dp = [BASE] * (n + 1)
dp[0] = START
for i in range(1, n + 1):
    dp[i] = combine(dp[i - 1], dp[i - 2], ...)   # from earlier entries only
return dp[n]`,
    },
    {
      title: 'Keep only the last two values',
      code: `prev, curr = 0, 0
for x in items:
    prev, curr = curr, max(curr, prev + x)     # skip or take
return curr`,
    },
    {
      title: 'Minimum over the last choice (coins)',
      code: `INF = amount + 1
dp = [0] + [INF] * amount
for a in range(1, amount + 1):
    for coin in coins:
        if coin <= a:
            dp[a] = min(dp[a], dp[a - coin] + 1)`,
    },
    {
      title: 'Subset sum on a boolean line',
      code: `dp = [True] + [False] * target
for x in nums:
    for s in range(target, x - 1, -1):   # downward: each number used once
        if dp[s - x]:
            dp[s] = True`,
    },
  ],
  boss: {
    seconds: 420,
    problem: 'coin-change',
    note: 'The boss problem is Coin Change. Say what dp[a] means, what the base case is, why infinity is the right start for unreachable amounts, and why greedy fails.',
    quiz: [
      {
        prompt: 'In Climbing Stairs, why is dp[i] = dp[i − 1] + dp[i − 2]?',
        options: ['The last move was either a 1-step from i − 1 or a 2-step from i − 2, and those cases do not overlap', 'It is a Fibonacci rule that must be memorised', 'Because two steps are better', 'To avoid the base case'],
        answer: 0,
        explain: 'Every path to step i ends with exactly one of the two moves, so the counts add.',
      },
      {
        prompt: 'In House Robber, why does robbing house i add its money to the best from two houses back?',
        options: ['The previous house cannot be robbed together with house i', 'Two houses back is always richer', 'The street is circular', 'To avoid ties'],
        answer: 0,
        explain: 'Adjacent houses may not both be robbed, so the plan before house i must skip house i − 1.',
      },
      {
        prompt: 'Why does Maximum Product Subarray track the minimum product as well as the maximum?',
        options: ['Multiplying a very negative product by a negative number gives a large positive one', 'Minimum is needed for the answer', 'Zeros need it', 'It halves the work'],
        answer: 0,
        explain: 'A negative number swaps the roles of the smallest and the largest product.',
      },
      {
        prompt: 'In the 0/1 subset-sum line (Partition Equal Subset Sum), why does the inner loop run from the target down to x?',
        options: ['So each number is used at most once per pass', 'Because lists are indexed from the end', 'To save time', 'It is only a convention'],
        answer: 0,
        explain: 'Going upward would let dp[s − x] already include the same number, reusing it.',
      },
      {
        prompt: 'What does "infinity" mean in the Coin Change table?',
        options: ['That amount cannot be made with the coins considered', 'The coin is too large', 'The table is full', 'An overflow error'],
        answer: 0,
        explain: 'A large sentinel makes min() ignore unreachable amounts, and it signals −1 if it remains at the end.',
      },
      {
        prompt: 'Why can Longest Increasing Subsequence be done in O(n log n)?',
        options: ['The tails array is always sorted, so each number is placed with binary search', 'Because the input is sorted', 'Python sorts for us', 'It cannot'],
        answer: 0,
        explain: 'For each length we keep only the smallest possible ending value, and those values increase with the length.',
      },
    ],
  },
};

export default topic;
