import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A heap (priority queue) keeps a changing collection arranged so the smallest (or largest) item is always at the top and can be removed in O(log n). It is the right tool whenever you keep asking "what is the best candidate right now?" while items are added and removed.',
    'Python provides a min-heap in the heapq module (heappush, heappop, heapify) working on an ordinary list. For a max-heap negate the numbers. For pairs, push tuples: the first element decides the order.',
    'Two moves cover most problems: keep a heap of size k to track the k largest or smallest items (the root is then the k-th), and merge several ordered sources by keeping one candidate from each in the heap.',
  ],
  checklist: [
    'You repeatedly need the minimum or maximum of a collection that changes.',
    'The words "k-th largest", "k closest", "top k" or "k smallest" appear: a heap of size k.',
    'You are merging several sorted lists or streams: one candidate per source in the heap.',
    'You schedule by priority or process the "most urgent" item first, with new items arriving over time.',
    'You need the median of a stream: two heaps meeting in the middle.',
    'Sorting everything would work but you only need a few results: a heap avoids the full sort.',
  ],
  template: [
    {
      title: 'Keep the k largest (min-heap of size k)',
      code: `import heapq
heap = []
for x in items:
    heapq.heappush(heap, x)
    if len(heap) > k:
        heapq.heappop(heap)     # drop the smallest
# heap[0] is the k-th largest`,
    },
    {
      title: 'Max-heap via negation, and tuples',
      code: `heapq.heappush(heap, -value)          # max-heap of numbers
best = -heapq.heappop(heap)
heapq.heappush(heap, (priority, item))  # ordered by priority first`,
    },
    {
      title: 'Two heaps for the median',
      code: `low, high = [], []            # low: max-heap (negatives), high: min-heap
heapq.heappush(low, -x)
heapq.heappush(high, -heapq.heappop(low))
if len(high) > len(low):
    heapq.heappush(low, -heapq.heappop(high))`,
    },
  ],
  boss: {
    seconds: 300,
    problem: 'find-median-from-data-stream',
    note: 'The boss problem is Find Median from Data Stream. Say out loud which heap holds the smaller half and which size rule you are keeping.',
    quiz: [
      {
        prompt: 'Python’s heapq is a min-heap. How do you use it as a max-heap of numbers?',
        options: ['Push the negated numbers and negate again when popping', 'Call heapq.maxheap()', 'Sort the list in reverse', 'Use a tuple with the number twice'],
        answer: 0,
        explain: 'Negating reverses the order, so the smallest negative is the largest original number.',
      },
      {
        prompt: 'To find the k-th largest element with a heap, which heap and size do you keep?',
        options: ['A min-heap holding the k largest seen so far', 'A max-heap holding all n numbers', 'A min-heap of size n − k', 'A max-heap of size 1'],
        answer: 0,
        explain: 'The root of a min-heap of the k largest is the smallest of them: the k-th largest overall.',
      },
      {
        prompt: 'What is the time cost of heapq.heappush and heapq.heappop on a heap of n items?',
        options: ['O(log n) each', 'O(1) each', 'O(n) each', 'O(n log n) each'],
        answer: 0,
        explain: 'Both move one item along a root-to-leaf path of length about log n.',
      },
      {
        prompt: 'In Design Twitter, why does get_news_feed use a heap instead of sorting all tweets?',
        options: ['It merges time-ordered lists and needs only 10 results', 'Heaps store data permanently', 'Sorting is impossible in Python', 'To avoid using a clock'],
        answer: 0,
        explain: 'Each user’s tweets are already ordered, so a heap with one candidate per user yields the newest 10 without sorting everything.',
      },
      {
        prompt: 'When two heaps track a median, what must always be true about the sizes?',
        options: ['The low half has the same number of items as the high half, or one more', 'Both are always exactly equal', 'The high half is always larger', 'There is no rule'],
        answer: 0,
        explain: 'That rule puts the median (or the two middle values) at the roots of the heaps.',
      },
    ],
  },
};

export default topic;
