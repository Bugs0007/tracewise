import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A linked list is a chain of nodes, each holding a value and a pointer to the next node. You cannot jump to the middle, so almost every problem is about walking the list while rewiring pointers without losing the part you have not visited yet.',
    'A small toolbox covers nearly everything: a dummy head (removes the "what if it is the first node" special case), prev/curr/next pointers (reversal and splicing), fast and slow pointers (middle and cycles), and a hash map from node to copy or to position when pointers alone are not enough.',
    'The golden rule: before you overwrite any next pointer, make sure you have saved where it pointed. Most bugs are a lost tail.',
  ],
  checklist: [
    'The input is a chain of nodes and you must change it in place or build a new chain.',
    'You need the middle, the n-th from the end, or a cycle: fast and slow, or two pointers with a gap.',
    'The head might change or be removed: use a dummy node.',
    'You are reversing, splicing, interleaving or merging chains: draw the pointers before and after.',
    'You need O(1) lookup together with ordering (cache): map plus doubly linked list.',
    'Pointers beyond next exist (random pointers): a map from original to copy.',
  ],
  template: [
    {
      title: 'Reverse a list',
      code: `prev, curr = None, head
while curr:
    nxt = curr.next      # save first
    curr.next = prev     # flip
    prev, curr = curr, nxt
return prev`,
    },
    {
      title: 'Dummy head and tail (merging, building, removing)',
      code: `dummy = ListNode()
tail = dummy
while ...:
    tail.next = chosen_node
    tail = tail.next
tail.next = leftover
return dummy.next`,
    },
    {
      title: 'Fast and slow pointers',
      code: `slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
    if slow is fast:     # cycle
        return True
# when the loop ends, slow is at the middle`,
    },
  ],
  boss: {
    seconds: 240,
    problem: 'remove-nth-node-from-end-of-list',
    note: 'The boss problem is Remove Nth Node From End of List. Draw the two pointers and the gap between them before you code.',
    quiz: [
      {
        prompt: 'When reversing a list, why must you save `curr.next` before changing it?',
        options: ['After curr.next = prev the rest of the list would be unreachable', 'It makes the loop faster', 'Python requires it', 'To count the nodes'],
        answer: 0,
        explain: 'Overwriting curr.next loses the only pointer to the remaining nodes unless you saved it first.',
      },
      {
        prompt: 'What does a dummy head node buy you?',
        options: ['No special case when the head changes or is removed', 'It speeds up traversal', 'It sorts the list', 'It detects cycles'],
        answer: 0,
        explain: 'With a dummy in front, every real node has a predecessor, so inserting or deleting the first node is the same as any other.',
      },
      {
        prompt: 'In Linked List Cycle, why must fast and slow meet if there is a cycle?',
        options: ['Inside the loop fast gains one node per step on slow, so the gap reaches 0', 'Because slow stops', 'Because the list is sorted', 'Because they start together'],
        answer: 0,
        explain: 'Once both are in the cycle, the gap between them shrinks by one every step, so it hits zero.',
      },
      {
        prompt: 'To remove the n-th node from the end in one pass, you advance one pointer n steps and then…',
        options: ['Move both until the front one reaches the last node', 'Move only the back one', 'Reverse the list', 'Count the length'],
        answer: 0,
        explain: 'The pointers stay n apart, so when the front is at the end the back is just before the node to remove.',
      },
      {
        prompt: 'An LRU cache with O(1) get and put uses…',
        options: ['A hash map plus a doubly linked list', 'A sorted array', 'A heap', 'A singly linked list only'],
        answer: 0,
        explain: 'The map finds a node instantly; the doubly linked list moves it to the front and removes the oldest in O(1).',
      },
      {
        prompt: 'Why does Copy List with Random Pointer need a map from original to copy?',
        options: ['A random pointer may target a node whose copy does not exist yet or is far away', 'To count nodes', 'To sort the list', 'Python lists need it'],
        answer: 0,
        explain: 'The map translates any target node into its copy in O(1), once every copy has been created.',
      },
      {
        prompt: 'Merging k sorted lists with a min-heap costs…',
        options: ['O(N log k)', 'O(N)', 'O(N k)', 'O(k²)'],
        answer: 0,
        explain: 'Every one of the N nodes is pushed and popped once, and each heap operation is O(log k).',
      },
    ],
  },
};

export default topic;
