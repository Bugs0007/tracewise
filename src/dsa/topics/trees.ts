import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A binary tree is a node with up to two children, each the root of its own smaller tree. That self-similar shape is the whole trick: almost every problem is solved by trusting a recursive call to handle each subtree and then combining the two answers at the current node.',
    'Three questions decide the code: what does the function return for an empty tree (the base case), what does it return for a node whose children have already been handled, and does information also have to flow down (a bound, a running maximum) or just up (a height, a sum)?',
    'When the question is about rows, switch from recursion to a queue and walk level by level. When the tree is a binary search tree, the ordering lets you discard half the tree at every step.',
  ],
  checklist: [
    'The input is a tree and the answer combines the answers for the left and right subtrees: post-order DFS.',
    'The answer for a node depends on its ancestors (a bound, a path maximum, the depth): pass a parameter down.',
    'The question is about levels, widths or "the last node of each row": BFS with a queue and len(queue) as the level size.',
    'The tree is a BST: use the ordering to walk one path, or inorder to get sorted values.',
    'You need both a value to return up and a global best (diameter, max path sum): return one thing, record the other.',
    'You are given traversals or must encode one: preorder with null markers, or preorder plus inorder.',
  ],
  template: [
    {
      title: 'Recursive combine (post-order)',
      code: `def solve(node):
    if node is None:
        return BASE            # empty tree
    left = solve(node.left)
    right = solve(node.right)
    return combine(node.val, left, right)`,
    },
    {
      title: 'Pass information down',
      code: `def dfs(node, bound):
    if node is None:
        return OK
    if violates(node.val, bound):
        return NOT_OK
    new_bound = update(bound, node.val)
    return dfs(node.left, new_bound) and dfs(node.right, new_bound)`,
    },
    {
      title: 'Level order with a queue',
      code: `from collections import deque
queue = deque([root])
while queue:
    for _ in range(len(queue)):     # exactly one level
        node = queue.popleft()
        if node.left:  queue.append(node.left)
        if node.right: queue.append(node.right)`,
    },
  ],
  boss: {
    seconds: 300,
    problem: 'validate-binary-search-tree',
    note: 'The boss problem is Validate Binary Search Tree. Remember that it is not enough to compare a node with its children: decide what bounds travel down.',
    quiz: [
      {
        prompt: 'What does max_depth(None) return, and why?',
        options: ['0, so a leaf becomes 1 + max(0, 0) = 1', '1, because None still counts as a level', '−1, to show the tree is missing', 'It raises an error'],
        answer: 0,
        explain: 'An empty tree has no levels. With 0 as the base case, a leaf correctly evaluates to 1.',
      },
      {
        prompt: 'To validate a BST, why is "left child < node < right child" not enough?',
        options: ['A deep descendant can still break an ancestor’s rule', 'It is enough', 'Python compares them wrongly', 'Because duplicates are not allowed'],
        answer: 0,
        explain: 'The rule is about whole subtrees. A node deep in the left subtree must also be smaller than the root, so bounds must be passed down.',
      },
      {
        prompt: 'In a level-order loop, why take size = len(queue) before the inner loop?',
        options: ['The queue grows as children are added, so the size marks where this level ends', 'To make popping faster', 'Python needs the size in advance', 'To avoid recursion'],
        answer: 0,
        explain: 'Children of the current level are appended behind the nodes being popped; the frozen size says how many belong to this level.',
      },
      {
        prompt: 'Which traversal of a BST visits the values in sorted order?',
        options: ['Inorder (left, node, right)', 'Preorder', 'Postorder', 'Level order'],
        answer: 0,
        explain: 'Inorder visits everything smaller first, then the node, then everything larger.',
      },
      {
        prompt: 'For the diameter or the maximum path sum, what does the recursive function return to its parent?',
        options: ['A one-sided (straight) value; the bent value updates a global best', 'The bent two-sided value', 'The global best', 'Nothing'],
        answer: 0,
        explain: 'A parent can extend only one branch of a child, so the child returns the straight value while the bending value is only a candidate for the answer.',
      },
    ],
  },
};

export default topic;
