import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Most array and string problems look quadratic until you notice what you keep recomputing. A hash map or set remembers answers, so the second time you need one it costs O(1) instead of another scan.',
    'Four moves cover nearly everything in this topic: remember what you have seen (a set or a value-to-index map), count things (a map of counts), group things by a computed key (a map of lists), and combine two cheap sweeps (prefix and suffix). When the keys are small integers, a plain array can replace the hash map.',
    'Think in one pass. If the decision for element i needs only what came before it, one loop and one structure are enough.',
  ],
  checklist: [
    'You keep asking "have I seen X before?" or "where did X appear?". Reach for a set or a map.',
    'The brute force compares every pair. Hash the partner you are looking for instead.',
    'Counts matter and order does not (anagrams, frequency, majority). Use a counter.',
    'Items belong together when some derived value is equal (sorted letters, a signature). Group by that key.',
    'The answer at position i depends on everything before or after i. Think prefix and suffix passes.',
    'The input must keep its original order or indices, so sorting is off the table. A hash map avoids it.',
    'A rule says "no repeats within a group" (rows, columns, boxes). One set per group.',
  ],
  template: [
    {
      title: 'Seen before? (ask first, then remember)',
      code: `seen = {}                        # value -> index; use a set if you only need membership
for i, x in enumerate(nums):
    if target - x in seen:       # ask about the partner first...
        return [seen[target - x], i]
    seen[x] = i                  # ...then remember x (so x never pairs with itself)`,
    },
    {
      title: 'Count things',
      code: `count = {}
for x in items:
    count[x] = count.get(x, 0) + 1`,
    },
    {
      title: 'Group by a canonical key',
      code: `groups = {}
for item in items:
    key = "".join(sorted(item))          # anything equal for items that belong together
    groups.setdefault(key, []).append(item)
return list(groups.values())`,
    },
    {
      title: 'Prefix then suffix',
      code: `res = [1] * n
run = 1
for i in range(n):               # left to right: res[i] = product of everything left of i
    res[i] = run
    run *= nums[i]
run = 1
for i in range(n - 1, -1, -1):   # right to left: fold in everything right of i
    res[i] *= run
    run *= nums[i]`,
    },
  ],
  boss: {
    seconds: 240,
    problem: 'longest-consecutive-sequence',
    note: 'The boss problem is Longest Consecutive Sequence. You have met its idea in the track, so this time rebuild it from scratch.',
    quiz: [
      {
        prompt: 'You must return the **indices** of two numbers in an unsorted list that add up to a target. Which approach gives O(n)?',
        options: ['Sort the list, then use two pointers', 'Use a hash map from value to index while scanning once', 'Binary search for the partner of every number', 'Two nested loops with an early exit'],
        answer: 1,
        explain: 'Sorting would scramble the original indices and costs O(n log n). A map from value to index answers "is the partner already here?" in constant time during a single pass.',
      },
      {
        prompt: 'Which key puts "listen", "silent" and "enlist" in the same group?',
        options: ['The length of the word', 'The first letter of the word', 'The first letter plus the length', 'The letters of the word in sorted order'],
        answer: 3,
        explain: 'Anagrams contain the same letters, so sorting the letters yields an identical string for all of them. The other keys also match unrelated words.',
      },
      {
        prompt: 'You need the k most frequent values of n integers in O(n) time. What makes that possible?',
        options: ['Counts are whole numbers from 1 to n, so a bucket per count replaces a sort', 'Sorting the input first, which is O(n) for integers', 'Binary searching the counts', 'Using two pointers over the original list'],
        answer: 0,
        explain: 'After counting, each frequency is at most n. Placing each value in buckets[count] and reading from the highest bucket down avoids any comparison sort.',
      },
      {
        prompt: 'In Longest Consecutive Sequence you only start counting at n when n - 1 is **not** in the set. Why?',
        options: ['It lets you skip the negative numbers', 'It uses less memory than a list', 'It guarantees each run is walked once, so the total work stays linear', 'It keeps the set sorted'],
        answer: 2,
        explain: 'Every run has exactly one start. Beginning only there means the inner loop never re-walks the middle of a run, so all inner loops together touch each value once.',
      },
      {
        prompt: 'In Valid Sudoku, which structure answers "is this digit already in this 3×3 box?" in constant time?',
        options: ['Recursion with backtracking', 'A sorted copy of the whole board', 'A set per box, indexed by (r // 3) * 3 + c // 3', 'A stack of the digits seen so far'],
        answer: 2,
        explain: 'Each box is a constraint of its own, so it gets its own set. The index formula maps any cell to its box number from 0 to 8.',
      },
      {
        prompt: 'Joining strings with "," fails when a string contains a comma. What is a robust fix?',
        options: ['Pick a rarer separator character', 'Write each string\'s length in front of it', 'Sort the strings before joining', 'Strip commas from the input first'],
        answer: 1,
        explain: 'Any separator can occur inside a string. A length prefix tells the decoder exactly how many characters to take, so nothing inside the text can be mistaken for structure.',
      },
      {
        prompt: 'Why is dividing the total product by nums[i] a bad plan for Product of Array Except Self?',
        options: ['Division is slower than multiplication', 'It only works for sorted lists', 'Python integers overflow', 'A zero in the list breaks it (division by zero, or wrong answers)'],
        answer: 3,
        explain: 'With one zero the total is 0, and dividing by the zero element is undefined. Prefix and suffix products avoid division entirely.',
      },
    ],
  },
};

export default topic;
