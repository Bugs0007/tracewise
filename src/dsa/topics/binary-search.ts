import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Binary search finds something in a sorted (or monotone) space by discarding half of it with every comparison. It turns an O(n) scan into O(log n): a million items take about twenty steps.',
    'It applies in three ways: searching a sorted array (including variants such as rotated arrays and matrices), searching a sorted history (the latest entry at or before a time), and searching the answer itself: when "is k big enough?" flips from false to true at one point, binary search that point.',
    'The craft is in the invariant. Decide what lo..hi means ("the target, if present, is in here"), pick mid, and update lo or hi so the invariant stays true and the range strictly shrinks.',
  ],
  checklist: [
    'The input is sorted, or sorted after a rotation, or ordered along rows and columns.',
    'The brute force is a linear scan, and one comparison could rule out half.',
    'You want the first or last position satisfying a condition (lower or upper bound).',
    'A yes/no question about a candidate answer is monotone: all "no" then all "yes".',
    'The input size is large and O(log n) is expected.',
    'You are asked for the median or k-th element of sorted data.',
  ],
  template: [
    {
      title: 'Classic search for a value',
      code: `lo, hi = 0, len(a) - 1
while lo <= hi:
    mid = (lo + hi) // 2
    if a[mid] == target:
        return mid
    if a[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1
return -1`,
    },
    {
      title: 'Smallest value that works (search the answer)',
      code: `lo, hi = low_bound, high_bound
while lo < hi:
    mid = (lo + hi) // 2
    if works(mid):      # feasible: keep mid, look for something smaller
        hi = mid
    else:
        lo = mid + 1
return lo`,
    },
  ],
  boss: {
    seconds: 240,
    problem: 'koko-eating-bananas',
    note: 'The boss problem is Koko Eating Bananas. Write the feasibility check first, then wrap the binary search around it.',
    quiz: [
      {
        prompt: 'Which condition must hold for binary search on the **answer** (like Koko’s speed) to be valid?',
        options: ['If a value works, every larger value also works (monotone)', 'The array is sorted', 'The answer is unique', 'The range is small'],
        answer: 0,
        explain: 'Monotonicity lets one probe discard half the range: a working probe means smaller values may still work, a failing one means all smaller values fail.',
      },
      {
        prompt: 'In a rotated sorted array, why can you still discard half the range each step?',
        options: ['At least one half around mid is always sorted, and a sorted half can be range-tested', 'The array is fully sorted', 'You search both halves', 'Rotation does not change anything'],
        answer: 0,
        explain: 'Comparing nums[lo] with nums[mid] shows which half is sorted; if the target is not in its range it must be in the other.',
      },
      {
        prompt: 'In Search a 2D Matrix, which cell does flat index `mid` refer to when there are `cols` columns?',
        options: ['row mid // cols, column mid % cols', 'row mid % cols, column mid // cols', 'row mid, column 0', 'row 0, column mid'],
        answer: 0,
        explain: 'Dividing by the number of columns gives the row; the remainder gives the column.',
      },
      {
        prompt: 'For Time Based Key-Value Store, why does `get` remember a value and keep searching right after a successful probe?',
        options: ['A later usable timestamp may exist; the answer is the rightmost time ≤ the query', 'The first match is wrong', 'To find the smallest time', 'Binary search always goes right'],
        answer: 0,
        explain: 'Every entry with time ≤ query is usable, but the correct one is the latest, so you record each success and look further right.',
      },
      {
        prompt: 'In `while lo <= hi` versus `while lo < hi`, which fits "find the smallest x such that works(x)" with `hi = mid` on success?',
        options: ['while lo < hi', 'while lo <= hi', 'Either, they are identical', 'Neither'],
        answer: 0,
        explain: 'Because hi = mid keeps mid in range, lo <= hi would loop forever when lo == hi. Using lo < hi ends with lo == hi as the answer.',
      },
      {
        prompt: 'The median of two sorted arrays in O(log) time is found by binary searching…',
        options: ['The cut position in the shorter array', 'The value of the median directly', 'Both arrays merged', 'The longer array’s middle'],
        answer: 0,
        explain: 'Once the cut in the shorter array is fixed, the cut in the other follows; the correct cut satisfies a_left ≤ b_right and b_left ≤ a_right.',
      },
      {
        prompt: 'Why compute the middle as `lo + (hi - lo) // 2` in languages with fixed-size integers?',
        options: ['To avoid overflow when lo + hi is huge', 'It is faster', 'It rounds up', 'It handles negatives'],
        answer: 0,
        explain: 'lo + hi can exceed the integer range in some languages. Python integers do not overflow, but the habit carries over.',
      },
    ],
  },
};

export default topic;
