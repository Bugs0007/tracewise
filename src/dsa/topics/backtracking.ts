import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Backtracking builds an answer one decision at a time. At each step you choose an option, recurse to handle the rest, and then undo the choice so the next option starts from the same state. Picture a tree: each node is a partial answer, each edge a choice, and you walk it depth first.',
    'The template never changes: if the partial answer is complete, record it; otherwise loop over the legal choices, make the choice, recurse, and take the choice back. The art is in choosing what a "choice" is, what makes one legal, and how to avoid repeating the same answer.',
    'Two tools shorten the tree. Pruning stops a branch the moment it cannot lead to an answer (a sum overshoots, a queen is attacked). Ordering (a start index, or sorting plus skipping equal neighbours) stops the same answer being built in different orders.',
  ],
  checklist: [
    'The problem asks for ALL solutions (subsets, permutations, partitions, placements), not a count or a single best value.',
    'The answer is built from a sequence of choices with constraints between them.',
    'The input is small (n ≲ 20): exponential or factorial work is acceptable.',
    'You need to avoid duplicates: sort and skip equal values at the same level, or pass a start index.',
    'You can detect a dead end early (sum too large, cell already used, square attacked): prune.',
    'A shared list or set describes the current state: you must undo every change before trying the next choice.',
  ],
  template: [
    {
      title: 'Choose, explore, undo',
      code: `res, path = [], []
def dfs(state):
    if is_complete(state):
        res.append(path[:])       # copy, the path keeps changing
        return
    for choice in choices(state):
        if not legal(choice):
            continue              # or break when sorted
        path.append(choice)       # choose
        dfs(next_state)           # explore
        path.pop()                # undo`,
    },
    {
      title: 'Avoid duplicate results',
      code: `nums.sort()
def dfs(start):
    res.append(path[:])
    for i in range(start, len(nums)):
        if i > start and nums[i] == nums[i - 1]:
            continue              # same value already tried at this level
        path.append(nums[i])
        dfs(i + 1)                # i + 1: each element once; i: reuse allowed
        path.pop()`,
    },
    {
      title: 'Grid search with a temporary mark',
      code: `def dfs(r, c, i):
    if i == len(word): return True
    if out_of_bounds or board[r][c] != word[i]: return False
    keep, board[r][c] = board[r][c], "#"
    found = any(dfs(r + dr, c + dc, i + 1) for dr, dc in DIRS)
    board[r][c] = keep
    return found`,
    },
  ],
  boss: {
    seconds: 360,
    problem: 'n-queens',
    note: 'The boss problem is N-Queens. Say what one recursion level decides, and what the three sets mean, before you code.',
    quiz: [
      {
        prompt: 'Why do we append a COPY of the path (path[:]) to the result?',
        options: ['The path list keeps changing; without a copy every result would end up identical', 'Copies are faster', 'Python requires it', 'To sort the results'],
        answer: 0,
        explain: 'The same list object is modified by later choices, so storing it directly would store a moving target.',
      },
      {
        prompt: 'In Combination Sum we call dfs(i, …), but in Combination Sum II we call dfs(i + 1, …). Why?',
        options: ['Passing i lets the same number be reused; i + 1 uses each element once', 'It is a typo', 'i + 1 is faster', 'Only the second one is recursive'],
        answer: 0,
        explain: 'The start index controls whether the current element may be chosen again.',
      },
      {
        prompt: 'After sorting, why skip nums[i] when i > start and nums[i] == nums[i − 1]?',
        options: ['Starting two branches with equal values at one level builds identical results', 'Equal numbers are invalid', 'To save memory', 'To make the loop shorter only'],
        answer: 0,
        explain: 'The earlier equal value already explored every continuation, so repeating it yields duplicates.',
      },
      {
        prompt: 'In N-Queens, two queens at (r1, c1) and (r2, c2) share a diagonal exactly when…',
        options: ['r1 − c1 = r2 − c2 or r1 + c1 = r2 + c2', 'r1 = r2', 'c1 = c2', 'r1 + c2 = r2 + c1 only'],
        answer: 0,
        explain: 'Squares on one ↘ diagonal have a constant row − col, and on one ↙ diagonal a constant row + col.',
      },
      {
        prompt: 'What is the purpose of the "undo" step (path.pop(), unmarking a cell)?',
        options: ['Restore the shared state so the next branch starts from the same conditions', 'Free memory', 'Record the answer', 'End the recursion'],
        answer: 0,
        explain: 'All branches share one state; each must leave it exactly as it found it.',
      },
    ],
  },
};

export default topic;
