import type { Tone } from '@/engine/types';
import { chipsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './hand-of-straights.py?raw';
import cases from './hand-of-straights.cases.json';

const viz = vizOf<{ hand: number[]; size: number }>({
  id: 'hand-of-straights',
  title: 'Hand of Straights',
  solution,
  inputs: [
    { key: 'hand', label: 'cards (numbers)', kind: 'numbers', default: [5, 6, 7, 6, 7, 8], maxItems: 12 },
    { key: 'size', label: 'group size', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Two runs of three', input: { hand: [5, 6, 7, 6, 7, 8], size: 3 } },
    { label: 'A gap', input: { hand: [1, 2, 4], size: 3 } },
    { label: 'Too many smallest', input: { hand: [1, 1, 1, 2, 3], size: 3 } },
    { label: 'Pairs', input: { hand: [9, 8, 10, 7], size: 2 } },
  ],
  validate: ({ hand, size }) => (!hand.length || hand.some((c) => c === null || !Number.isInteger(c)) ? 'Use whole numbers' : !Number.isInteger(size) || size < 1 ? 'The group size must be a whole number ≥ 1' : null),
  run({ hand, size }) {
    const r = new TraceRecorder(solution);
    if (hand.length % size) {
      r.step('size', `${hand.length} cards cannot be split into groups of ${size}: ${hand.length} is not a multiple of ${size}.`, [chipsView([...hand].sort((a, b) => a - b), { title: 'cards' })], {});
      r.step('sizeRet', 'Return False.', [chipsView([...hand].sort((a, b) => a - b), { title: 'cards' })], { result: false });
      return { frames: r.frames, result: false };
    }
    const counts = new Map<number, number>();
    for (const c of hand) counts.set(c, (counts.get(c) ?? 0) + 1);
    const groups: string[] = [];
    const tones: Record<string, Tone> = {};
    let askedStart = false;
    let askedFail = false;
    let askedLeft = false;
    const view = () => [
      hashMapView(Object.fromEntries([...counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [`card ${k}`, `${v} left`])), { title: 'counts of each card', tones }),
      chipsView(groups, { title: 'groups built' }),
    ];
    r.step('count', `Count the cards. We will always start a group at the SMALLEST card still unused: nothing smaller can ever join it later.`, view(), {});
    for (const card of [...counts.keys()].sort((a, b) => a - b)) {
      r.op();
      const need = counts.get(card) as number;
      if (!need) continue;
      tones[`card ${card}`] = 'active';
      r.step('need', `Smallest unused card: ${card}, with ${need} ${need === 1 ? 'copy' : 'copies'} left. Each copy must start its own group of ${size}.`, view(), { card, need });
      if (!askedStart) {
        askedStart = true;
        r.predict('start', `The smallest card is ${card}. What must every copy of it do?`, [`Start a group: ${card}, ${card + 1}, …, ${card + size - 1}`, 'Join a group that started lower', 'Be left out'], 0, 'No lower card exists, so a group containing it can only begin with it.');
      }
      for (let nxt = card; nxt < card + size; nxt++) {
        const have = counts.get(nxt) ?? 0;
        if (have < need) {
          if (!askedFail) {
            askedFail = true;
            r.predict('fail', `Card ${nxt} is needed ${need} time${need === 1 ? '' : 's'} but only ${have} remain. What happens?`, ['The groups cannot be formed: return False', 'Use a different card', 'Skip this group'], 0, 'Every group needs consecutive cards, so a missing card makes the hand impossible.');
          }
          tones[`card ${nxt}`] = 'error';
          r.step('fail', `Card ${nxt}: need ${need}, have ${have}. Return False.`, view(), { result: false });
          return { frames: r.frames, result: false };
        }
        counts.set(nxt, have - need);
      }
      groups.push(`${need}× [${card}…${card + size - 1}]`);
      tones[`card ${card}`] = 'done';
      r.step('take', `Form ${need} group${need === 1 ? '' : 's'} of ${card}…${card + size - 1}: subtract ${need} from each of those cards.`, view(), {});
      if (!askedLeft && size > 1) {
        askedLeft = true;
        const nextLeft = counts.get(card + 1) ?? 0;
        r.predictChoice('left', `After forming the group${need === 1 ? '' : 's'}, how many copies of card ${card + 1} are left?`, String(nextLeft), [String(nextLeft + 1), String(nextLeft + 2), String((counts.get(card + 1) ?? 0) + need + 1)], card, 'Each group used one copy of every card in its run, so subtract the number of groups.');
      }
    }
    r.step('done', 'Every card was placed in a group of consecutive numbers. Return True.', view(), { result: true });
    return { frames: r.frames, result: true };
  },
  reference({ hand, size }) {
    const cards = [...hand].sort((a, b) => a - b);
    while (cards.length) {
      const first = cards[0];
      for (let k = 0; k < size; k++) {
        const at = cards.indexOf(first + k);
        if (at < 0) return false;
        cards.splice(at, 1);
      }
    }
    return true;
  },
});

export default problem({
  summary: 'You hold a hand of numbered cards and want to arrange all of them into groups of exactly g cards where the numbers in each group are consecutive (like 4, 5, 6). Decide whether this is possible.',
  example: ['cards [2, 3, 3, 4, 4, 5], g = 3', 'true', '{2, 3, 4} and {3, 4, 5}.'],
  pattern: ['greedy', ['greedy', 'heap', 'hash-lookup', 'sorting'], 'The smallest remaining card has nothing lower to join, so it must start a group. Repeating that on the new smallest card either builds all groups or hits a missing card.', {
    heap: 'A min-heap gives the smallest card each round; counting cards in a map and walking them in sorted order does the same job.',
    'hash-lookup': 'The count map is a helper, the idea is the forced start of each group.',
    sorting: 'Sorting orders the cards but does not decide the groups.',
  }],
  hints: [
    'Which card is forced to be the start of a group?',
    'Once you know the group it begins, what remains?',
    'Count cards. For each smallest card with count c, subtract c from every card in c..c+g−1; fail if any has fewer than c copies. Check len % g first.',
  ],
  insight: 'The smallest card cannot be the middle of a run, so it must start one; take its whole run and repeat.',
  brute: 'Try all ways to partition the cards: exponential.',
  optimal: 'Count map in sorted order: O(n log n) time, O(n) space.',
  walk: ['If len(hand) % g != 0 return False.', 'counts = Counter(hand).', 'For each distinct card in sorted order with count c > 0, subtract c from counts[card .. card + g − 1], failing if any is smaller than c.', 'Return True.'],
  edge: ['Group size 1 (always True).', 'Number of cards not divisible by g.', 'Duplicates that need several runs.', 'Gaps in the numbers.'],
  works: ['The smallest unused card must be the first of its group, and that group is forced to contain the next g − 1 consecutive values.', 'Removing it leaves the same problem on fewer cards.'],
  time: ['O(n log n)', 'Sorting the distinct cards dominates.'],
  space: ['O(n)', 'The count map.'],
  solution,
  cases,
  sig: 'def is_n_straight_hand(hand, group_size):\n    # True if all cards can be arranged into groups of group_size consecutive numbers\n    pass\n',
  viz,
  fromArgs: ([hand, size]) => ({ hand, size }),
});
