import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'In two-dimensional dynamic programming the sub-problems are described by two numbers: a prefix of each of two strings, a position in a grid, a prefix of the items together with a running total, or the two ends of an interval. The table has a cell for every pair, and each cell is computed from a few neighbours that were filled earlier.',
    'The craft is the same four questions as in one dimension: what does dp[i][j] mean in words, how does it depend on neighbouring cells (usually up, left and diagonal), what do the first row and column hold, and in what order do I fill so the neighbours are ready. Draw the table for a tiny input and fill it by hand before you code.',
    'Many tables can be compressed: when a cell only looks at the previous row, keep one row. Some problems fill by interval length instead of left to right, and a few (counting combinations, states such as holding or resting) are simply a 2-D table in disguise.',
  ],
  checklist: [
    'Two strings or sequences are compared: the state is (prefix of one, prefix of the other).',
    'A grid with moves such as right / down, where each cell\'s answer comes from its neighbours.',
    'Choices have a running total or a small state that matters later (buy / sell / rest, a sum so far).',
    'Intervals [l, r] split at a point and the two sides are independent once the split is chosen.',
    'A plain recursion on (i, j) would repeat the same pair many times: memoise or tabulate.',
    'You can say in one sentence what dp[i][j] stores, and which cells it reads.',
  ],
  template: [
    {
      title: 'Two strings: compare the last letters',
      code: `dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
for i in range(1, len(a) + 1):
    for j in range(1, len(b) + 1):
        if a[i - 1] == b[j - 1]:
            dp[i][j] = dp[i - 1][j - 1] + 1            # or + 0, depending on the problem
        else:
            dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])`,
    },
    {
      title: 'Grid with right / down moves',
      code: `dp = [[1] * n for _ in range(m)]
for r in range(1, m):
    for c in range(1, n):
        dp[r][c] = dp[r - 1][c] + dp[r][c - 1]`,
    },
    {
      title: 'Interval DP (split at the last element)',
      code: `for length in range(2, n):
    for left in range(0, n - length):
        right = left + length
        for k in range(left + 1, right):
            dp[left][right] = max(dp[left][right], gain(left, k, right) + dp[left][k] + dp[k][right])`,
    },
    {
      title: 'Memoised DFS on a grid',
      code: `memo = {}
def dfs(r, c):
    if (r, c) in memo:
        return memo[(r, c)]
    best = 1 + max((dfs(nr, nc) for nr, nc in larger_neighbours(r, c)), default=0)
    memo[(r, c)] = best
    return best`,
    },
  ],
  boss: {
    seconds: 480,
    problem: 'edit-distance',
    note: 'The boss problem is Edit Distance. Say what dp[i][j] means, what the first row and column hold, which three neighbours the formula reads, and which edit each neighbour stands for.',
    quiz: [
      {
        prompt: 'In Longest Common Subsequence, what does dp[i][j] store?',
        options: ['The length of the LCS of the first i letters of one string and the first j letters of the other', 'The letter at position (i, j)', 'Whether the strings are equal', 'The number of matches so far'],
        answer: 0,
        explain: 'Each cell answers the same question for a pair of prefixes.',
      },
      {
        prompt: 'In Coin Change II, why must the loop over coins be the OUTER loop to count combinations?',
        options: ['Each coin kind is added once, so a multiset is built in a fixed coin order and counted once', 'It is faster', 'Python requires it', 'It counts orders instead'],
        answer: 0,
        explain: 'With amounts outside, the same coins in a different order would be counted again.',
      },
      {
        prompt: 'In Edit Distance, which neighbour corresponds to "replace a letter"?',
        options: ['The diagonal one, dp[i − 1][j − 1]', 'The one above', 'The one to the left', 'None of them'],
        answer: 0,
        explain: 'Replacing consumes one letter of each string; up is a deletion and left an insertion.',
      },
      {
        prompt: 'Why do we think about the LAST balloon to burst in an interval (Burst Balloons)?',
        options: ['Its neighbours are then the interval ends, and the two sides become independent sub-problems', 'It is always the largest', 'It makes the table smaller', 'To avoid zeros'],
        answer: 0,
        explain: 'Choosing the first balloon leaves neighbours that depend on later bursts; the last one does not.',
      },
      {
        prompt: 'What does a "state" such as hold / sold / rest add in the stock-with-cooldown problem?',
        options: ['It records what the cooldown rule needs to know about yesterday', 'It speeds up the loop', 'It replaces the prices', 'It counts the days'],
        answer: 0,
        explain: 'Buying is only allowed from the resting state; the three states encode that rule.',
      },
      {
        prompt: 'In Longest Increasing Path, why does a memoised DFS terminate and stay correct?',
        options: ['Moves only go to strictly larger values, so there are no cycles and each cell’s answer is final once stored', 'Because the grid is small', 'Because we visit cells in row order', 'It does not'],
        answer: 0,
        explain: 'An acyclic dependency structure means every cell depends only on larger cells that can be solved first.',
      },
    ],
  },
};

export default topic;
