# DSA track progress: NeetCode 150

_If a session ends partway: read `DSA_PLAN.md`, then resume at the first unchecked problem below._

A problem is ticked only when all of these hold: its `.py` solution passes `python -m pytest tests/dsa/test_<topic>.py` (5+ cases incl. edge cases, brute-force comparison), its trace generator matches the Python result (`npx vitest run src/dsa`), and the build, lint and tests are green.

Per topic: also write `src/dsa/topics/<topic>.ts` (intro, template, checklist, boss fight), `tests/dsa/spec_<topic>.py` + `test_<topic>.py`, run the full suite, then commit once.

Progress: **150 of 150** problems done.

## Arrays & Hashing (9/9)

- [x] Topic page content (`topics/arrays-hashing.ts`) and `tests/dsa/test_arrays_hashing.py`
- [x] 1. Contains Duplicate (`contains-duplicate`, Easy)
- [x] 2. Valid Anagram (`valid-anagram`, Easy)
- [x] 3. Two Sum (`two-sum`, Easy)
- [x] 4. Group Anagrams (`group-anagrams`, Medium)
- [x] 5. Top K Frequent Elements (`top-k-frequent-elements`, Medium)
- [x] 6. Encode and Decode Strings (`encode-and-decode-strings`, Medium)
- [x] 7. Product of Array Except Self (`product-of-array-except-self`, Medium)
- [x] 8. Valid Sudoku (`valid-sudoku`, Medium)
- [x] 9. Longest Consecutive Sequence (`longest-consecutive-sequence`, Medium)

## Two Pointers (5/5)

- [x] Topic page content (`topics/two-pointers.ts`) and `tests/dsa/test_two_pointers.py`
- [x] 10. Valid Palindrome (`valid-palindrome`, Easy)
- [x] 11. Two Sum II (`two-sum-ii-input-array-is-sorted`, Medium)
- [x] 12. 3Sum (`3sum`, Medium)
- [x] 13. Container With Most Water (`container-with-most-water`, Medium)
- [x] 14. Trapping Rain Water (`trapping-rain-water`, Hard)

## Sliding Window (6/6)

- [x] Topic page content (`topics/sliding-window.ts`) and `tests/dsa/test_sliding_window.py`
- [x] 15. Best Time to Buy and Sell Stock (`best-time-to-buy-and-sell-stock`, Easy)
- [x] 16. Longest Substring Without Repeating Characters (`longest-substring-without-repeating-characters`, Medium)
- [x] 17. Longest Repeating Character Replacement (`longest-repeating-character-replacement`, Medium)
- [x] 18. Permutation in String (`permutation-in-string`, Medium)
- [x] 19. Minimum Window Substring (`minimum-window-substring`, Hard)
- [x] 20. Sliding Window Maximum (`sliding-window-maximum`, Hard)

## Stack (7/7)

- [x] Topic page content (`topics/stack.ts`) and `tests/dsa/test_stack.py`
- [x] 21. Valid Parentheses (`valid-parentheses`, Easy)
- [x] 22. Min Stack (`min-stack`, Medium)
- [x] 23. Evaluate Reverse Polish Notation (`evaluate-reverse-polish-notation`, Medium)
- [x] 24. Generate Parentheses (`generate-parentheses`, Medium)
- [x] 25. Daily Temperatures (`daily-temperatures`, Medium)
- [x] 26. Car Fleet (`car-fleet`, Medium)
- [x] 27. Largest Rectangle in Histogram (`largest-rectangle-in-histogram`, Hard)

## Binary Search (7/7)

- [x] Topic page content (`topics/binary-search.ts`) and `tests/dsa/test_binary_search.py`
- [x] 28. Binary Search (`binary-search`, Easy)
- [x] 29. Search a 2D Matrix (`search-a-2d-matrix`, Medium)
- [x] 30. Koko Eating Bananas (`koko-eating-bananas`, Medium)
- [x] 31. Find Minimum in Rotated Sorted Array (`find-minimum-in-rotated-sorted-array`, Medium)
- [x] 32. Search in Rotated Sorted Array (`search-in-rotated-sorted-array`, Medium)
- [x] 33. Time Based Key-Value Store (`time-based-key-value-store`, Medium)
- [x] 34. Median of Two Sorted Arrays (`median-of-two-sorted-arrays`, Hard)

## Linked List (11/11)

- [x] Topic page content (`topics/linked-list.ts`) and `tests/dsa/test_linked_list.py`
- [x] 35. Reverse Linked List (`reverse-linked-list`, Easy)
- [x] 36. Merge Two Sorted Lists (`merge-two-sorted-lists`, Easy)
- [x] 37. Reorder List (`reorder-list`, Medium)
- [x] 38. Remove Nth Node From End of List (`remove-nth-node-from-end-of-list`, Medium)
- [x] 39. Copy List with Random Pointer (`copy-list-with-random-pointer`, Medium)
- [x] 40. Add Two Numbers (`add-two-numbers`, Medium)
- [x] 41. Linked List Cycle (`linked-list-cycle`, Easy)
- [x] 42. Find the Duplicate Number (`find-the-duplicate-number`, Medium)
- [x] 43. LRU Cache (`lru-cache`, Medium)
- [x] 44. Merge K Sorted Lists (`merge-k-sorted-lists`, Hard)
- [x] 45. Reverse Nodes in K-Group (`reverse-nodes-in-k-group`, Hard)

## Trees (15/15)

- [x] Topic page content (`topics/trees.ts`) and `tests/dsa/test_trees.py`
- [x] 46. Invert Binary Tree (`invert-binary-tree`, Easy)
- [x] 47. Maximum Depth of Binary Tree (`maximum-depth-of-binary-tree`, Easy)
- [x] 48. Diameter of Binary Tree (`diameter-of-binary-tree`, Easy)
- [x] 49. Balanced Binary Tree (`balanced-binary-tree`, Easy)
- [x] 50. Same Tree (`same-tree`, Easy)
- [x] 51. Subtree of Another Tree (`subtree-of-another-tree`, Easy)
- [x] 52. Lowest Common Ancestor of a BST (`lowest-common-ancestor-of-a-binary-search-tree`, Medium)
- [x] 53. Binary Tree Level Order Traversal (`binary-tree-level-order-traversal`, Medium)
- [x] 54. Binary Tree Right Side View (`binary-tree-right-side-view`, Medium)
- [x] 55. Count Good Nodes in Binary Tree (`count-good-nodes-in-binary-tree`, Medium)
- [x] 56. Validate Binary Search Tree (`validate-binary-search-tree`, Medium)
- [x] 57. Kth Smallest Element in a BST (`kth-smallest-element-in-a-bst`, Medium)
- [x] 58. Construct Binary Tree from Preorder and Inorder Traversal (`construct-binary-tree-from-preorder-and-inorder-traversal`, Medium)
- [x] 59. Binary Tree Maximum Path Sum (`binary-tree-maximum-path-sum`, Hard)
- [x] 60. Serialize and Deserialize Binary Tree (`serialize-and-deserialize-binary-tree`, Hard)

## Tries (3/3)

- [x] Topic page content (`topics/tries.ts`) and `tests/dsa/test_tries.py`
- [x] 61. Implement Trie (`implement-trie-prefix-tree`, Medium)
- [x] 62. Design Add and Search Words Data Structure (`design-add-and-search-words-data-structure`, Medium)
- [x] 63. Word Search II (`word-search-ii`, Hard)

## Heap / Priority Queue (7/7)

- [x] Topic page content (`topics/heap.ts`) and `tests/dsa/test_heap.py`
- [x] 64. Kth Largest Element in a Stream (`kth-largest-element-in-a-stream`, Easy)
- [x] 65. Last Stone Weight (`last-stone-weight`, Easy)
- [x] 66. K Closest Points to Origin (`k-closest-points-to-origin`, Medium)
- [x] 67. Kth Largest Element in an Array (`kth-largest-element-in-an-array`, Medium)
- [x] 68. Task Scheduler (`task-scheduler`, Medium)
- [x] 69. Design Twitter (`design-twitter`, Medium)
- [x] 70. Find Median from Data Stream (`find-median-from-data-stream`, Hard)

## Backtracking (9/9)

- [x] Topic page content (`topics/backtracking.ts`) and `tests/dsa/test_backtracking.py`
- [x] 71. Subsets (`subsets`, Medium)
- [x] 72. Combination Sum (`combination-sum`, Medium)
- [x] 73. Combination Sum II (`combination-sum-ii`, Medium)
- [x] 74. Permutations (`permutations`, Medium)
- [x] 75. Subsets II (`subsets-ii`, Medium)
- [x] 76. Word Search (`word-search`, Medium)
- [x] 77. Palindrome Partitioning (`palindrome-partitioning`, Medium)
- [x] 78. Letter Combinations of a Phone Number (`letter-combinations-of-a-phone-number`, Medium)
- [x] 79. N-Queens (`n-queens`, Hard)

## Graphs (13/13)

- [x] Topic page content (`topics/graphs.ts`) and `tests/dsa/test_graphs.py`
- [x] 80. Number of Islands (`number-of-islands`, Medium)
- [x] 81. Max Area of Island (`max-area-of-island`, Medium)
- [x] 82. Clone Graph (`clone-graph`, Medium)
- [x] 83. Walls and Gates (`walls-and-gates`, Medium)
- [x] 84. Rotting Oranges (`rotting-oranges`, Medium)
- [x] 85. Pacific Atlantic Water Flow (`pacific-atlantic-water-flow`, Medium)
- [x] 86. Surrounded Regions (`surrounded-regions`, Medium)
- [x] 87. Course Schedule (`course-schedule`, Medium)
- [x] 88. Course Schedule II (`course-schedule-ii`, Medium)
- [x] 89. Graph Valid Tree (`graph-valid-tree`, Medium)
- [x] 90. Number of Connected Components in an Undirected Graph (`number-of-connected-components-in-an-undirected-graph`, Medium)
- [x] 91. Redundant Connection (`redundant-connection`, Medium)
- [x] 92. Word Ladder (`word-ladder`, Hard)

## Advanced Graphs (6/6)

- [x] Topic page content (`topics/advanced-graphs.ts`) and `tests/dsa/test_advanced_graphs.py`
- [x] 93. Network Delay Time (`network-delay-time`, Medium)
- [x] 94. Reconstruct Itinerary (`reconstruct-itinerary`, Hard)
- [x] 95. Min Cost to Connect All Points (`min-cost-to-connect-all-points`, Medium)
- [x] 96. Swim in Rising Water (`swim-in-rising-water`, Hard)
- [x] 97. Alien Dictionary (`alien-dictionary`, Hard)
- [x] 98. Cheapest Flights Within K Stops (`cheapest-flights-within-k-stops`, Medium)

## 1-D Dynamic Programming (12/12)

- [x] Topic page content (`topics/dp-1d.ts`) and `tests/dsa/test_dp_1d.py`
- [x] 99. Climbing Stairs (`climbing-stairs`, Easy)
- [x] 100. Min Cost Climbing Stairs (`min-cost-climbing-stairs`, Easy)
- [x] 101. House Robber (`house-robber`, Medium)
- [x] 102. House Robber II (`house-robber-ii`, Medium)
- [x] 103. Longest Palindromic Substring (`longest-palindromic-substring`, Medium)
- [x] 104. Palindromic Substrings (`palindromic-substrings`, Medium)
- [x] 105. Decode Ways (`decode-ways`, Medium)
- [x] 106. Coin Change (`coin-change`, Medium)
- [x] 107. Maximum Product Subarray (`maximum-product-subarray`, Medium)
- [x] 108. Word Break (`word-break`, Medium)
- [x] 109. Longest Increasing Subsequence (`longest-increasing-subsequence`, Medium)
- [x] 110. Partition Equal Subset Sum (`partition-equal-subset-sum`, Medium)

## 2-D Dynamic Programming (11/11)

- [x] Topic page content (`topics/dp-2d.ts`) and `tests/dsa/test_dp_2d.py`
- [x] 111. Unique Paths (`unique-paths`, Medium)
- [x] 112. Longest Common Subsequence (`longest-common-subsequence`, Medium)
- [x] 113. Best Time to Buy and Sell Stock with Cooldown (`best-time-to-buy-and-sell-stock-with-cooldown`, Medium)
- [x] 114. Coin Change II (`coin-change-ii`, Medium)
- [x] 115. Target Sum (`target-sum`, Medium)
- [x] 116. Interleaving String (`interleaving-string`, Medium)
- [x] 117. Longest Increasing Path in a Matrix (`longest-increasing-path-in-a-matrix`, Hard)
- [x] 118. Distinct Subsequences (`distinct-subsequences`, Hard)
- [x] 119. Edit Distance (`edit-distance`, Medium)
- [x] 120. Burst Balloons (`burst-balloons`, Hard)
- [x] 121. Regular Expression Matching (`regular-expression-matching`, Hard)

## Greedy (8/8)

- [x] Topic page content (`topics/greedy.ts`) and `tests/dsa/test_greedy.py`
- [x] 122. Maximum Subarray (`maximum-subarray`, Medium)
- [x] 123. Jump Game (`jump-game`, Medium)
- [x] 124. Jump Game II (`jump-game-ii`, Medium)
- [x] 125. Gas Station (`gas-station`, Medium)
- [x] 126. Hand of Straights (`hand-of-straights`, Medium)
- [x] 127. Merge Triplets to Form Target Triplet (`merge-triplets-to-form-target-triplet`, Medium)
- [x] 128. Partition Labels (`partition-labels`, Medium)
- [x] 129. Valid Parenthesis String (`valid-parenthesis-string`, Medium)

## Intervals (6/6)

- [x] Topic page content (`topics/intervals.ts`) and `tests/dsa/test_intervals.py`
- [x] 130. Insert Interval (`insert-interval`, Medium)
- [x] 131. Merge Intervals (`merge-intervals`, Medium)
- [x] 132. Non-overlapping Intervals (`non-overlapping-intervals`, Medium)
- [x] 133. Meeting Rooms (`meeting-rooms`, Easy)
- [x] 134. Meeting Rooms II (`meeting-rooms-ii`, Medium)
- [x] 135. Minimum Interval to Include Each Query (`minimum-interval-to-include-each-query`, Hard)

## Math & Geometry (8/8)

- [x] Topic page content (`topics/math-geometry.ts`) and `tests/dsa/test_math_geometry.py`
- [x] 136. Rotate Image (`rotate-image`, Medium)
- [x] 137. Spiral Matrix (`spiral-matrix`, Medium)
- [x] 138. Set Matrix Zeroes (`set-matrix-zeroes`, Medium)
- [x] 139. Happy Number (`happy-number`, Easy)
- [x] 140. Plus One (`plus-one`, Easy)
- [x] 141. Pow(x, n) (`powx-n`, Medium)
- [x] 142. Multiply Strings (`multiply-strings`, Medium)
- [x] 143. Detect Squares (`detect-squares`, Medium)

## Bit Manipulation (7/7)

- [x] Topic page content (`topics/bit-manipulation.ts`) and `tests/dsa/test_bit_manipulation.py`
- [x] 144. Single Number (`single-number`, Easy)
- [x] 145. Number of 1 Bits (`number-of-1-bits`, Easy)
- [x] 146. Counting Bits (`counting-bits`, Easy)
- [x] 147. Reverse Bits (`reverse-bits`, Easy)
- [x] 148. Missing Number (`missing-number`, Easy)
- [x] 149. Sum of Two Integers (`sum-of-two-integers`, Medium)
- [x] 150. Reverse Integer (`reverse-integer`, Medium)
