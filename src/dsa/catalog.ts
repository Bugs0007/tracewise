// The NeetCode 150 list, in NeetCode's topic order. Eager and tiny: heavy content
// (explanations, solutions, traces) lives in lazy files under ./problems and ./topics.
import type { Difficulty, ProblemMeta, TopicId, TopicMeta } from './types';

export const TOPICS: TopicMeta[] = [
  { id: 'arrays-hashing', title: 'Arrays & Hashing', blurb: 'Trade memory for speed: remember what you have seen.' },
  { id: 'two-pointers', title: 'Two Pointers', blurb: 'Two indices that squeeze a sorted or symmetric input.' },
  { id: 'sliding-window', title: 'Sliding Window', blurb: 'A moving range that grows and shrinks while a property holds.' },
  { id: 'stack', title: 'Stack', blurb: 'Last in, first out: matching, nesting and next-greater problems.' },
  { id: 'binary-search', title: 'Binary Search', blurb: 'Halve the search space on a sorted or monotone input.' },
  { id: 'linked-list', title: 'Linked List', blurb: 'Rewire pointers without losing the rest of the list.' },
  { id: 'trees', title: 'Trees', blurb: 'Recursion that mirrors the shape of the tree.' },
  { id: 'tries', title: 'Tries', blurb: 'Share prefixes between words in a character tree.' },
  { id: 'heap', title: 'Heap / Priority Queue', blurb: 'Always have the best candidate on top.' },
  { id: 'backtracking', title: 'Backtracking', blurb: 'Choose, explore, undo.' },
  { id: 'graphs', title: 'Graphs', blurb: 'Grids and networks: BFS, DFS, topological order, union-find.' },
  { id: 'advanced-graphs', title: 'Advanced Graphs', blurb: 'Weighted shortest paths and spanning trees.' },
  { id: 'dp-1d', title: '1-D Dynamic Programming', blurb: 'Answers that build on a few earlier answers.' },
  { id: 'dp-2d', title: '2-D Dynamic Programming', blurb: 'Tables indexed by two things: strings, grids, budgets.' },
  { id: 'greedy', title: 'Greedy', blurb: 'The locally best choice, when you can prove it is safe.' },
  { id: 'intervals', title: 'Intervals', blurb: 'Sort, sweep and merge ranges.' },
  { id: 'math-geometry', title: 'Math & Geometry', blurb: 'Matrix moves and arithmetic that avoid brute force.' },
  { id: 'bit-manipulation', title: 'Bit Manipulation', blurb: 'XOR, masks and carries.' },
];

export const TOPIC_BY_ID: Record<string, TopicMeta> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

type Row = [slug: string, title: string, difficulty: 'E' | 'M' | 'H', patterns: string[]];

const D: Record<'E' | 'M' | 'H', Difficulty> = { E: 'Easy', M: 'Medium', H: 'Hard' };

const LINTCODE = (id: number | string, name: string) => ({ label: `${name} on LintCode (free)`, url: `https://www.lintcode.com/problem/${id}/` });
const FREE: Record<string, { label: string; url: string }> = {
  'encode-and-decode-strings': LINTCODE(659, 'Encode and Decode Strings'),
  'walls-and-gates': LINTCODE(663, 'Walls and Gates'),
  'graph-valid-tree': LINTCODE(178, 'Graph Valid Tree'),
  'number-of-connected-components-in-an-undirected-graph': LINTCODE(3651, 'Number of Connected Components in an Undirected Graph'),
  'alien-dictionary': LINTCODE(892, 'Alien Dictionary'),
  'meeting-rooms': LINTCODE(920, 'Meeting Rooms'),
  'meeting-rooms-ii': LINTCODE(919, 'Meeting Rooms II'),
};

const GROUPS: [TopicId, Row[]][] = [
  [
    'arrays-hashing',
    [
      ['contains-duplicate', 'Contains Duplicate', 'E', ['hash-lookup']],
      ['valid-anagram', 'Valid Anagram', 'E', ['frequency-count']],
      ['two-sum', 'Two Sum', 'E', ['hash-lookup']],
      ['group-anagrams', 'Group Anagrams', 'M', ['group-by-key']],
      ['top-k-frequent-elements', 'Top K Frequent Elements', 'M', ['frequency-count', 'bucket-sort']],
      ['encode-and-decode-strings', 'Encode and Decode Strings', 'M', ['length-prefix']],
      ['product-of-array-except-self', 'Product of Array Except Self', 'M', ['prefix-suffix']],
      ['valid-sudoku', 'Valid Sudoku', 'M', ['constraint-sets']],
      ['longest-consecutive-sequence', 'Longest Consecutive Sequence', 'M', ['set-run-start']],
    ],
  ],
  [
    'two-pointers',
    [
      ['valid-palindrome', 'Valid Palindrome', 'E', ['two-pointers']],
      ['two-sum-ii-input-array-is-sorted', 'Two Sum II', 'M', ['two-pointers']],
      ['3sum', '3Sum', 'M', ['two-pointers', 'sorting']],
      ['container-with-most-water', 'Container With Most Water', 'M', ['two-pointers', 'greedy']],
      ['trapping-rain-water', 'Trapping Rain Water', 'H', ['two-pointers', 'prefix-suffix']],
    ],
  ],
  [
    'sliding-window',
    [
      ['best-time-to-buy-and-sell-stock', 'Best Time to Buy and Sell Stock', 'E', ['sliding-window', 'greedy']],
      ['longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', 'M', ['sliding-window']],
      ['longest-repeating-character-replacement', 'Longest Repeating Character Replacement', 'M', ['sliding-window']],
      ['permutation-in-string', 'Permutation in String', 'M', ['sliding-window', 'frequency-count']],
      ['minimum-window-substring', 'Minimum Window Substring', 'H', ['sliding-window', 'frequency-count']],
      ['sliding-window-maximum', 'Sliding Window Maximum', 'H', ['sliding-window', 'monotonic-stack']],
    ],
  ],
  [
    'stack',
    [
      ['valid-parentheses', 'Valid Parentheses', 'E', ['stack']],
      ['min-stack', 'Min Stack', 'M', ['stack', 'design']],
      ['evaluate-reverse-polish-notation', 'Evaluate Reverse Polish Notation', 'M', ['stack']],
      ['generate-parentheses', 'Generate Parentheses', 'M', ['backtracking', 'stack']],
      ['daily-temperatures', 'Daily Temperatures', 'M', ['monotonic-stack']],
      ['car-fleet', 'Car Fleet', 'M', ['monotonic-stack', 'sorting']],
      ['largest-rectangle-in-histogram', 'Largest Rectangle in Histogram', 'H', ['monotonic-stack']],
    ],
  ],
  [
    'binary-search',
    [
      ['binary-search', 'Binary Search', 'E', ['binary-search']],
      ['search-a-2d-matrix', 'Search a 2D Matrix', 'M', ['binary-search', 'matrix']],
      ['koko-eating-bananas', 'Koko Eating Bananas', 'M', ['binary-search-answer']],
      ['find-minimum-in-rotated-sorted-array', 'Find Minimum in Rotated Sorted Array', 'M', ['binary-search']],
      ['search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', 'M', ['binary-search']],
      ['time-based-key-value-store', 'Time Based Key-Value Store', 'M', ['binary-search', 'design']],
      ['median-of-two-sorted-arrays', 'Median of Two Sorted Arrays', 'H', ['binary-search', 'divide-conquer']],
    ],
  ],
  [
    'linked-list',
    [
      ['reverse-linked-list', 'Reverse Linked List', 'E', ['linked-list']],
      ['merge-two-sorted-lists', 'Merge Two Sorted Lists', 'E', ['linked-list']],
      ['reorder-list', 'Reorder List', 'M', ['linked-list', 'fast-slow']],
      ['remove-nth-node-from-end-of-list', 'Remove Nth Node From End of List', 'M', ['linked-list', 'two-pointers']],
      ['copy-list-with-random-pointer', 'Copy List with Random Pointer', 'M', ['linked-list', 'hash-lookup']],
      ['add-two-numbers', 'Add Two Numbers', 'M', ['linked-list', 'math']],
      ['linked-list-cycle', 'Linked List Cycle', 'E', ['fast-slow']],
      ['find-the-duplicate-number', 'Find the Duplicate Number', 'M', ['fast-slow']],
      ['lru-cache', 'LRU Cache', 'M', ['design', 'linked-list']],
      ['merge-k-sorted-lists', 'Merge K Sorted Lists', 'H', ['heap', 'linked-list']],
      ['reverse-nodes-in-k-group', 'Reverse Nodes in K-Group', 'H', ['linked-list']],
    ],
  ],
  [
    'trees',
    [
      ['invert-binary-tree', 'Invert Binary Tree', 'E', ['dfs']],
      ['maximum-depth-of-binary-tree', 'Maximum Depth of Binary Tree', 'E', ['dfs']],
      ['diameter-of-binary-tree', 'Diameter of Binary Tree', 'E', ['dfs']],
      ['balanced-binary-tree', 'Balanced Binary Tree', 'E', ['dfs']],
      ['same-tree', 'Same Tree', 'E', ['dfs']],
      ['subtree-of-another-tree', 'Subtree of Another Tree', 'E', ['dfs']],
      ['lowest-common-ancestor-of-a-binary-search-tree', 'Lowest Common Ancestor of a BST', 'M', ['bst']],
      ['binary-tree-level-order-traversal', 'Binary Tree Level Order Traversal', 'M', ['bfs']],
      ['binary-tree-right-side-view', 'Binary Tree Right Side View', 'M', ['bfs']],
      ['count-good-nodes-in-binary-tree', 'Count Good Nodes in Binary Tree', 'M', ['dfs']],
      ['validate-binary-search-tree', 'Validate Binary Search Tree', 'M', ['bst', 'dfs']],
      ['kth-smallest-element-in-a-bst', 'Kth Smallest Element in a BST', 'M', ['bst', 'dfs']],
      ['construct-binary-tree-from-preorder-and-inorder-traversal', 'Construct Binary Tree from Preorder and Inorder Traversal', 'M', ['dfs', 'divide-conquer']],
      ['binary-tree-maximum-path-sum', 'Binary Tree Maximum Path Sum', 'H', ['dfs']],
      ['serialize-and-deserialize-binary-tree', 'Serialize and Deserialize Binary Tree', 'H', ['dfs', 'bfs']],
    ],
  ],
  [
    'tries',
    [
      ['implement-trie-prefix-tree', 'Implement Trie', 'M', ['trie', 'design']],
      ['design-add-and-search-words-data-structure', 'Design Add and Search Words Data Structure', 'M', ['trie', 'dfs']],
      ['word-search-ii', 'Word Search II', 'H', ['trie', 'backtracking']],
    ],
  ],
  [
    'heap',
    [
      ['kth-largest-element-in-a-stream', 'Kth Largest Element in a Stream', 'E', ['heap']],
      ['last-stone-weight', 'Last Stone Weight', 'E', ['heap']],
      ['k-closest-points-to-origin', 'K Closest Points to Origin', 'M', ['heap']],
      ['kth-largest-element-in-an-array', 'Kth Largest Element in an Array', 'M', ['heap']],
      ['task-scheduler', 'Task Scheduler', 'M', ['heap', 'greedy']],
      ['design-twitter', 'Design Twitter', 'M', ['heap', 'design']],
      ['find-median-from-data-stream', 'Find Median from Data Stream', 'H', ['two-heaps']],
    ],
  ],
  [
    'backtracking',
    [
      ['subsets', 'Subsets', 'M', ['backtracking']],
      ['combination-sum', 'Combination Sum', 'M', ['backtracking']],
      ['combination-sum-ii', 'Combination Sum II', 'M', ['backtracking']],
      ['permutations', 'Permutations', 'M', ['backtracking']],
      ['subsets-ii', 'Subsets II', 'M', ['backtracking']],
      ['word-search', 'Word Search', 'M', ['backtracking', 'matrix']],
      ['palindrome-partitioning', 'Palindrome Partitioning', 'M', ['backtracking']],
      ['letter-combinations-of-a-phone-number', 'Letter Combinations of a Phone Number', 'M', ['backtracking']],
      ['n-queens', 'N-Queens', 'H', ['backtracking']],
    ],
  ],
  [
    'graphs',
    [
      ['number-of-islands', 'Number of Islands', 'M', ['dfs', 'matrix']],
      ['max-area-of-island', 'Max Area of Island', 'M', ['dfs', 'matrix']],
      ['clone-graph', 'Clone Graph', 'M', ['dfs', 'hash-lookup']],
      ['walls-and-gates', 'Walls and Gates', 'M', ['bfs', 'matrix']],
      ['rotting-oranges', 'Rotting Oranges', 'M', ['bfs', 'matrix']],
      ['pacific-atlantic-water-flow', 'Pacific Atlantic Water Flow', 'M', ['dfs', 'matrix']],
      ['surrounded-regions', 'Surrounded Regions', 'M', ['dfs', 'matrix']],
      ['course-schedule', 'Course Schedule', 'M', ['topo-sort']],
      ['course-schedule-ii', 'Course Schedule II', 'M', ['topo-sort']],
      ['graph-valid-tree', 'Graph Valid Tree', 'M', ['union-find', 'dfs']],
      ['number-of-connected-components-in-an-undirected-graph', 'Number of Connected Components in an Undirected Graph', 'M', ['union-find', 'dfs']],
      ['redundant-connection', 'Redundant Connection', 'M', ['union-find']],
      ['word-ladder', 'Word Ladder', 'H', ['bfs']],
    ],
  ],
  [
    'advanced-graphs',
    [
      ['network-delay-time', 'Network Delay Time', 'M', ['dijkstra']],
      ['reconstruct-itinerary', 'Reconstruct Itinerary', 'H', ['dfs', 'heap']],
      ['min-cost-to-connect-all-points', 'Min Cost to Connect All Points', 'M', ['mst']],
      ['swim-in-rising-water', 'Swim in Rising Water', 'H', ['dijkstra', 'binary-search-answer']],
      ['alien-dictionary', 'Alien Dictionary', 'H', ['topo-sort']],
      ['cheapest-flights-within-k-stops', 'Cheapest Flights Within K Stops', 'M', ['dijkstra', 'dp-1d']],
    ],
  ],
  [
    'dp-1d',
    [
      ['climbing-stairs', 'Climbing Stairs', 'E', ['dp-1d']],
      ['min-cost-climbing-stairs', 'Min Cost Climbing Stairs', 'E', ['dp-1d']],
      ['house-robber', 'House Robber', 'M', ['dp-1d']],
      ['house-robber-ii', 'House Robber II', 'M', ['dp-1d']],
      ['longest-palindromic-substring', 'Longest Palindromic Substring', 'M', ['two-pointers', 'dp-1d']],
      ['palindromic-substrings', 'Palindromic Substrings', 'M', ['two-pointers', 'dp-1d']],
      ['decode-ways', 'Decode Ways', 'M', ['dp-1d']],
      ['coin-change', 'Coin Change', 'M', ['dp-1d']],
      ['maximum-product-subarray', 'Maximum Product Subarray', 'M', ['dp-1d']],
      ['word-break', 'Word Break', 'M', ['dp-1d']],
      ['longest-increasing-subsequence', 'Longest Increasing Subsequence', 'M', ['dp-1d', 'binary-search']],
      ['partition-equal-subset-sum', 'Partition Equal Subset Sum', 'M', ['dp-1d']],
    ],
  ],
  [
    'dp-2d',
    [
      ['unique-paths', 'Unique Paths', 'M', ['dp-2d']],
      ['longest-common-subsequence', 'Longest Common Subsequence', 'M', ['dp-2d']],
      ['best-time-to-buy-and-sell-stock-with-cooldown', 'Best Time to Buy and Sell Stock with Cooldown', 'M', ['dp-2d']],
      ['coin-change-ii', 'Coin Change II', 'M', ['dp-2d']],
      ['target-sum', 'Target Sum', 'M', ['dp-2d']],
      ['interleaving-string', 'Interleaving String', 'M', ['dp-2d']],
      ['longest-increasing-path-in-a-matrix', 'Longest Increasing Path in a Matrix', 'H', ['dfs', 'dp-2d']],
      ['distinct-subsequences', 'Distinct Subsequences', 'H', ['dp-2d']],
      ['edit-distance', 'Edit Distance', 'M', ['dp-2d']],
      ['burst-balloons', 'Burst Balloons', 'H', ['dp-2d']],
      ['regular-expression-matching', 'Regular Expression Matching', 'H', ['dp-2d']],
    ],
  ],
  [
    'greedy',
    [
      ['maximum-subarray', 'Maximum Subarray', 'M', ['greedy']],
      ['jump-game', 'Jump Game', 'M', ['greedy']],
      ['jump-game-ii', 'Jump Game II', 'M', ['greedy']],
      ['gas-station', 'Gas Station', 'M', ['greedy']],
      ['hand-of-straights', 'Hand of Straights', 'M', ['greedy', 'heap']],
      ['merge-triplets-to-form-target-triplet', 'Merge Triplets to Form Target Triplet', 'M', ['greedy']],
      ['partition-labels', 'Partition Labels', 'M', ['greedy', 'two-pointers']],
      ['valid-parenthesis-string', 'Valid Parenthesis String', 'M', ['greedy']],
    ],
  ],
  [
    'intervals',
    [
      ['insert-interval', 'Insert Interval', 'M', ['intervals']],
      ['merge-intervals', 'Merge Intervals', 'M', ['intervals', 'sorting']],
      ['non-overlapping-intervals', 'Non-overlapping Intervals', 'M', ['intervals', 'greedy']],
      ['meeting-rooms', 'Meeting Rooms', 'E', ['intervals', 'sorting']],
      ['meeting-rooms-ii', 'Meeting Rooms II', 'M', ['intervals', 'heap']],
      ['minimum-interval-to-include-each-query', 'Minimum Interval to Include Each Query', 'H', ['intervals', 'heap']],
    ],
  ],
  [
    'math-geometry',
    [
      ['rotate-image', 'Rotate Image', 'M', ['matrix']],
      ['spiral-matrix', 'Spiral Matrix', 'M', ['matrix', 'simulation']],
      ['set-matrix-zeroes', 'Set Matrix Zeroes', 'M', ['matrix']],
      ['happy-number', 'Happy Number', 'E', ['math', 'fast-slow']],
      ['plus-one', 'Plus One', 'E', ['math']],
      ['powx-n', 'Pow(x, n)', 'M', ['math', 'divide-conquer']],
      ['multiply-strings', 'Multiply Strings', 'M', ['math', 'simulation']],
      ['detect-squares', 'Detect Squares', 'M', ['design', 'hash-lookup']],
    ],
  ],
  [
    'bit-manipulation',
    [
      ['single-number', 'Single Number', 'E', ['bit-xor']],
      ['number-of-1-bits', 'Number of 1 Bits', 'E', ['bit-ops']],
      ['counting-bits', 'Counting Bits', 'E', ['bit-ops', 'dp-1d']],
      ['reverse-bits', 'Reverse Bits', 'E', ['bit-ops']],
      ['missing-number', 'Missing Number', 'E', ['bit-xor', 'math']],
      ['sum-of-two-integers', 'Sum of Two Integers', 'M', ['bit-ops']],
      ['reverse-integer', 'Reverse Integer', 'M', ['math']],
    ],
  ],
];

export const PROBLEMS: ProblemMeta[] = GROUPS.flatMap(([topic, rows]) => rows.map(([id, title, d, patterns]) => ({ id, n: 0, title, topic, difficulty: D[d], patterns, leetcode: `https://leetcode.com/problems/${id}/`, ...(FREE[id] ? { free: FREE[id] } : {}) }))).map((p, i) => ({ ...p, n: i + 1 }));

export const PROBLEM_BY_ID: Record<string, ProblemMeta> = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));

export function problemsOf(topic: TopicId): ProblemMeta[] {
  return PROBLEMS.filter((p) => p.topic === topic);
}
