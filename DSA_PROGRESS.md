# DSA track progress: NeetCode 150

_If a session ends partway: read `DSA_PLAN.md`, then resume at the first unchecked problem below._

A problem is ticked only when all of these hold: its `.py` solution passes `python -m pytest tests/dsa/test_<topic>.py` (5+ cases incl. edge cases), its trace generator matches the Python result (`npx vitest run src/dsa`), and the build, lint and tests are green.

Per topic: also write `src/dsa/topics/<topic>.ts` (intro, template, checklist, boss fight), add `tests/dsa/test_<topic>.py`, run the full suite, then commit once.

Progress: **9 of 150** problems done.

Status: **Phase 1 (infrastructure + Arrays & Hashing) is done and waiting for review.** The remaining topics start after approval.

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

## Two Pointers (0/5)

- [ ] Topic page content (`topics/two-pointers.ts`) and `tests/dsa/test_two_pointers.py`
- [ ] 10. Valid Palindrome (`valid-palindrome`, Easy)
- [ ] 11. Two Sum II (`two-sum-ii-input-array-is-sorted`, Medium)
- [ ] 12. 3Sum (`3sum`, Medium)
- [ ] 13. Container With Most Water (`container-with-most-water`, Medium)
- [ ] 14. Trapping Rain Water (`trapping-rain-water`, Hard)

## Sliding Window (0/6)

- [ ] Topic page content (`topics/sliding-window.ts`) and `tests/dsa/test_sliding_window.py`
- [ ] 15. Best Time to Buy and Sell Stock (`best-time-to-buy-and-sell-stock`, Easy)
- [ ] 16. Longest Substring Without Repeating Characters (`longest-substring-without-repeating-characters`, Medium)
- [ ] 17. Longest Repeating Character Replacement (`longest-repeating-character-replacement`, Medium)
- [ ] 18. Permutation in String (`permutation-in-string`, Medium)
- [ ] 19. Minimum Window Substring (`minimum-window-substring`, Hard)
- [ ] 20. Sliding Window Maximum (`sliding-window-maximum`, Hard)

## Stack (0/7)

- [ ] Topic page content (`topics/stack.ts`) and `tests/dsa/test_stack.py`
- [ ] 21. Valid Parentheses (`valid-parentheses`, Easy)
- [ ] 22. Min Stack (`min-stack`, Medium)
- [ ] 23. Evaluate Reverse Polish Notation (`evaluate-reverse-polish-notation`, Medium)
- [ ] 24. Generate Parentheses (`generate-parentheses`, Medium)
- [ ] 25. Daily Temperatures (`daily-temperatures`, Medium)
- [ ] 26. Car Fleet (`car-fleet`, Medium)
- [ ] 27. Largest Rectangle in Histogram (`largest-rectangle-in-histogram`, Hard)

## Binary Search (0/7)

- [ ] Topic page content (`topics/binary-search.ts`) and `tests/dsa/test_binary_search.py`
- [ ] 28. Binary Search (`binary-search`, Easy)
- [ ] 29. Search a 2D Matrix (`search-a-2d-matrix`, Medium)
- [ ] 30. Koko Eating Bananas (`koko-eating-bananas`, Medium)
- [ ] 31. Find Minimum in Rotated Sorted Array (`find-minimum-in-rotated-sorted-array`, Medium)
- [ ] 32. Search in Rotated Sorted Array (`search-in-rotated-sorted-array`, Medium)
- [ ] 33. Time Based Key-Value Store (`time-based-key-value-store`, Medium)
- [ ] 34. Median of Two Sorted Arrays (`median-of-two-sorted-arrays`, Hard)

## Linked List (0/11)

- [ ] Topic page content (`topics/linked-list.ts`) and `tests/dsa/test_linked_list.py`
- [ ] 35. Reverse Linked List (`reverse-linked-list`, Easy)
- [ ] 36. Merge Two Sorted Lists (`merge-two-sorted-lists`, Easy)
- [ ] 37. Reorder List (`reorder-list`, Medium)
- [ ] 38. Remove Nth Node From End of List (`remove-nth-node-from-end-of-list`, Medium)
- [ ] 39. Copy List with Random Pointer (`copy-list-with-random-pointer`, Medium)
- [ ] 40. Add Two Numbers (`add-two-numbers`, Medium)
- [ ] 41. Linked List Cycle (`linked-list-cycle`, Easy)
- [ ] 42. Find the Duplicate Number (`find-the-duplicate-number`, Medium)
- [ ] 43. LRU Cache (`lru-cache`, Medium)
- [ ] 44. Merge K Sorted Lists (`merge-k-sorted-lists`, Hard)
- [ ] 45. Reverse Nodes in K-Group (`reverse-nodes-in-k-group`, Hard)

## Trees (0/15)

- [ ] Topic page content (`topics/trees.ts`) and `tests/dsa/test_trees.py`
- [ ] 46. Invert Binary Tree (`invert-binary-tree`, Easy)
- [ ] 47. Maximum Depth of Binary Tree (`maximum-depth-of-binary-tree`, Easy)
- [ ] 48. Diameter of Binary Tree (`diameter-of-binary-tree`, Easy)
- [ ] 49. Balanced Binary Tree (`balanced-binary-tree`, Easy)
- [ ] 50. Same Tree (`same-tree`, Easy)
- [ ] 51. Subtree of Another Tree (`subtree-of-another-tree`, Easy)
- [ ] 52. Lowest Common Ancestor of a BST (`lowest-common-ancestor-of-a-binary-search-tree`, Medium)
- [ ] 53. Binary Tree Level Order Traversal (`binary-tree-level-order-traversal`, Medium)
- [ ] 54. Binary Tree Right Side View (`binary-tree-right-side-view`, Medium)
- [ ] 55. Count Good Nodes in Binary Tree (`count-good-nodes-in-binary-tree`, Medium)
- [ ] 56. Validate Binary Search Tree (`validate-binary-search-tree`, Medium)
- [ ] 57. Kth Smallest Element in a BST (`kth-smallest-element-in-a-bst`, Medium)
- [ ] 58. Construct Binary Tree from Preorder and Inorder Traversal (`construct-binary-tree-from-preorder-and-inorder-traversal`, Medium)
- [ ] 59. Binary Tree Maximum Path Sum (`binary-tree-maximum-path-sum`, Hard)
- [ ] 60. Serialize and Deserialize Binary Tree (`serialize-and-deserialize-binary-tree`, Hard)

## Tries (0/3)

- [ ] Topic page content (`topics/tries.ts`) and `tests/dsa/test_tries.py`
- [ ] 61. Implement Trie (`implement-trie-prefix-tree`, Medium)
- [ ] 62. Design Add and Search Words Data Structure (`design-add-and-search-words-data-structure`, Medium)
- [ ] 63. Word Search II (`word-search-ii`, Hard)

## Heap / Priority Queue (0/7)

- [ ] Topic page content (`topics/heap.ts`) and `tests/dsa/test_heap.py`
- [ ] 64. Kth Largest Element in a Stream (`kth-largest-element-in-a-stream`, Easy)
- [ ] 65. Last Stone Weight (`last-stone-weight`, Easy)
- [ ] 66. K Closest Points to Origin (`k-closest-points-to-origin`, Medium)
- [ ] 67. Kth Largest Element in an Array (`kth-largest-element-in-an-array`, Medium)
- [ ] 68. Task Scheduler (`task-scheduler`, Medium)
- [ ] 69. Design Twitter (`design-twitter`, Medium)
- [ ] 70. Find Median from Data Stream (`find-median-from-data-stream`, Hard)

## Backtracking (0/9)

- [ ] Topic page content (`topics/backtracking.ts`) and `tests/dsa/test_backtracking.py`
- [ ] 71. Subsets (`subsets`, Medium)
- [ ] 72. Combination Sum (`combination-sum`, Medium)
- [ ] 73. Combination Sum II (`combination-sum-ii`, Medium)
- [ ] 74. Permutations (`permutations`, Medium)
- [ ] 75. Subsets II (`subsets-ii`, Medium)
- [ ] 76. Word Search (`word-search`, Medium)
- [ ] 77. Palindrome Partitioning (`palindrome-partitioning`, Medium)
- [ ] 78. Letter Combinations of a Phone Number (`letter-combinations-of-a-phone-number`, Medium)
- [ ] 79. N-Queens (`n-queens`, Hard)

## Graphs (0/13)

- [ ] Topic page content (`topics/graphs.ts`) and `tests/dsa/test_graphs.py`
- [ ] 80. Number of Islands (`number-of-islands`, Medium)
- [ ] 81. Max Area of Island (`max-area-of-island`, Medium)
- [ ] 82. Clone Graph (`clone-graph`, Medium)
- [ ] 83. Walls and Gates (`walls-and-gates`, Medium)
- [ ] 84. Rotting Oranges (`rotting-oranges`, Medium)
- [ ] 85. Pacific Atlantic Water Flow (`pacific-atlantic-water-flow`, Medium)
- [ ] 86. Surrounded Regions (`surrounded-regions`, Medium)
- [ ] 87. Course Schedule (`course-schedule`, Medium)
- [ ] 88. Course Schedule II (`course-schedule-ii`, Medium)
- [ ] 89. Graph Valid Tree (`graph-valid-tree`, Medium)
- [ ] 90. Number of Connected Components in an Undirected Graph (`number-of-connected-components-in-an-undirected-graph`, Medium)
- [ ] 91. Redundant Connection (`redundant-connection`, Medium)
- [ ] 92. Word Ladder (`word-ladder`, Hard)

## Advanced Graphs (0/6)

- [ ] Topic page content (`topics/advanced-graphs.ts`) and `tests/dsa/test_advanced_graphs.py`
- [ ] 93. Network Delay Time (`network-delay-time`, Medium)
- [ ] 94. Reconstruct Itinerary (`reconstruct-itinerary`, Hard)
- [ ] 95. Min Cost to Connect All Points (`min-cost-to-connect-all-points`, Medium)
- [ ] 96. Swim in Rising Water (`swim-in-rising-water`, Hard)
- [ ] 97. Alien Dictionary (`alien-dictionary`, Hard)
- [ ] 98. Cheapest Flights Within K Stops (`cheapest-flights-within-k-stops`, Medium)

## 1-D Dynamic Programming (0/12)

- [ ] Topic page content (`topics/dp-1d.ts`) and `tests/dsa/test_dp_1d.py`
- [ ] 99. Climbing Stairs (`climbing-stairs`, Easy)
- [ ] 100. Min Cost Climbing Stairs (`min-cost-climbing-stairs`, Easy)
- [ ] 101. House Robber (`house-robber`, Medium)
- [ ] 102. House Robber II (`house-robber-ii`, Medium)
- [ ] 103. Longest Palindromic Substring (`longest-palindromic-substring`, Medium)
- [ ] 104. Palindromic Substrings (`palindromic-substrings`, Medium)
- [ ] 105. Decode Ways (`decode-ways`, Medium)
- [ ] 106. Coin Change (`coin-change`, Medium)
- [ ] 107. Maximum Product Subarray (`maximum-product-subarray`, Medium)
- [ ] 108. Word Break (`word-break`, Medium)
- [ ] 109. Longest Increasing Subsequence (`longest-increasing-subsequence`, Medium)
- [ ] 110. Partition Equal Subset Sum (`partition-equal-subset-sum`, Medium)

## 2-D Dynamic Programming (0/11)

- [ ] Topic page content (`topics/dp-2d.ts`) and `tests/dsa/test_dp_2d.py`
- [ ] 111. Unique Paths (`unique-paths`, Medium)
- [ ] 112. Longest Common Subsequence (`longest-common-subsequence`, Medium)
- [ ] 113. Best Time to Buy and Sell Stock with Cooldown (`best-time-to-buy-and-sell-stock-with-cooldown`, Medium)
- [ ] 114. Coin Change II (`coin-change-ii`, Medium)
- [ ] 115. Target Sum (`target-sum`, Medium)
- [ ] 116. Interleaving String (`interleaving-string`, Medium)
- [ ] 117. Longest Increasing Path in a Matrix (`longest-increasing-path-in-a-matrix`, Hard)
- [ ] 118. Distinct Subsequences (`distinct-subsequences`, Hard)
- [ ] 119. Edit Distance (`edit-distance`, Medium)
- [ ] 120. Burst Balloons (`burst-balloons`, Hard)
- [ ] 121. Regular Expression Matching (`regular-expression-matching`, Hard)

## Greedy (0/8)

- [ ] Topic page content (`topics/greedy.ts`) and `tests/dsa/test_greedy.py`
- [ ] 122. Maximum Subarray (`maximum-subarray`, Medium)
- [ ] 123. Jump Game (`jump-game`, Medium)
- [ ] 124. Jump Game II (`jump-game-ii`, Medium)
- [ ] 125. Gas Station (`gas-station`, Medium)
- [ ] 126. Hand of Straights (`hand-of-straights`, Medium)
- [ ] 127. Merge Triplets to Form Target Triplet (`merge-triplets-to-form-target-triplet`, Medium)
- [ ] 128. Partition Labels (`partition-labels`, Medium)
- [ ] 129. Valid Parenthesis String (`valid-parenthesis-string`, Medium)

## Intervals (0/6)

- [ ] Topic page content (`topics/intervals.ts`) and `tests/dsa/test_intervals.py`
- [ ] 130. Insert Interval (`insert-interval`, Medium)
- [ ] 131. Merge Intervals (`merge-intervals`, Medium)
- [ ] 132. Non-overlapping Intervals (`non-overlapping-intervals`, Medium)
- [ ] 133. Meeting Rooms (`meeting-rooms`, Easy)
- [ ] 134. Meeting Rooms II (`meeting-rooms-ii`, Medium)
- [ ] 135. Minimum Interval to Include Each Query (`minimum-interval-to-include-each-query`, Hard)

## Math & Geometry (0/8)

- [ ] Topic page content (`topics/math-geometry.ts`) and `tests/dsa/test_math_geometry.py`
- [ ] 136. Rotate Image (`rotate-image`, Medium)
- [ ] 137. Spiral Matrix (`spiral-matrix`, Medium)
- [ ] 138. Set Matrix Zeroes (`set-matrix-zeroes`, Medium)
- [ ] 139. Happy Number (`happy-number`, Easy)
- [ ] 140. Plus One (`plus-one`, Easy)
- [ ] 141. Pow(x, n) (`powx-n`, Medium)
- [ ] 142. Multiply Strings (`multiply-strings`, Medium)
- [ ] 143. Detect Squares (`detect-squares`, Medium)

## Bit Manipulation (0/7)

- [ ] Topic page content (`topics/bit-manipulation.ts`) and `tests/dsa/test_bit_manipulation.py`
- [ ] 144. Single Number (`single-number`, Easy)
- [ ] 145. Number of 1 Bits (`number-of-1-bits`, Easy)
- [ ] 146. Counting Bits (`counting-bits`, Easy)
- [ ] 147. Reverse Bits (`reverse-bits`, Easy)
- [ ] 148. Missing Number (`missing-number`, Easy)
- [ ] 149. Sum of Two Integers (`sum-of-two-integers`, Medium)
- [ ] 150. Reverse Integer (`reverse-integer`, Medium)
