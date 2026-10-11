import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf } from '@/dsa/viz/ll';
import { hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './copy-list-with-random-pointer.py?raw';
import harness from './copy-list-with-random-pointer.harness.py?raw';
import cases from './copy-list-with-random-pointer.cases.json';

type Pair = [number, number | null];

const viz = vizOf<{ pairs: Pair[] }>({
  id: 'copy-list-with-random-pointer',
  title: 'Copy List with Random Pointer',
  solution,
  inputs: [{ key: 'pairs', label: 'nodes as [value, index of its random target or null]', kind: 'json', default: [[7, null], [13, 0], [11, 4], [10, 2], [1, 0]] }],
  presets: [
    { label: 'Random pointers', input: { pairs: [[7, null], [13, 0], [11, 4], [10, 2], [1, 0]] } },
    { label: 'No randoms', input: { pairs: [[3, null], [4, null]] } },
    { label: 'Points at itself', input: { pairs: [[5, 0]] } },
    { label: 'Empty', input: { pairs: [] } },
  ],
  validate: ({ pairs }) => {
    if (!Array.isArray(pairs) || pairs.length > 7) return 'Use a list of at most 7 nodes, like [[7,null],[13,0]]';
    for (const p of pairs) if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || !(p[1] === null || (Number.isInteger(p[1]) && p[1] >= 0 && p[1] < pairs.length))) return 'Each node is [value, random index or null], and the index must be a node in the list';
    return null;
  },
  run({ pairs }) {
    const r = new TraceRecorder(solution);
    const n = pairs.length;
    const values = pairs.map((p) => p[0]);
    const orig = pairs.map((p) => p[1]);
    if (!n) {
      r.step('guard', 'An empty list has nothing to copy.', [listFromIndices([], [], { title: 'list' })], {});
      r.step('guardRet', 'Return None.', [listFromIndices([], [], { title: 'list' })], { result: '[]' });
      return { frames: r.frames, result: [] };
    }
    const copyNext: (number | null)[] = pairs.map(() => null);
    const copyRandom: (number | null)[] = pairs.map(() => null);
    let made = 0;
    let at: number | null = null;
    const view = (hot: Tone | null = null, copyHot: Tone | null = null) => {
      const to: Record<number, Tone> = {};
      if (at !== null && hot) to[at] = hot;
      const tc: Record<number, Tone> = {};
      for (let k = 0; k < made; k++) tc[k] = 'visited';
      if (at !== null && copyHot && at < made) tc[at] = copyHot;
      return [
        listFromIndices(values, chain(n), { title: 'original list (dashed arrows are random pointers)', tones: to, tags: tagsOf({ node: at }), random: orig }),
        listFromIndices(values.slice(0, made), copyNext.slice(0, made).map((x) => x), { title: 'the copy being built', tones: tc, random: copyRandom.slice(0, made) }),
        hashMapView(Object.fromEntries(Array.from({ length: made }, (_, k) => [`original ${values[k]} (#${k})`, `copy #${k}`])), { title: 'copies: original node → its copy' }),
      ];
    };
    r.step('guard', `${n} node${n === 1 ? '' : 's'} to copy. Random pointers can point anywhere, even forward, so they cannot be copied in one left-to-right pass.`, view(), {});
    r.step('map', 'copies maps each original node to its new copy. It lets us translate "the node this points to" into "the copy of that node".', view(), {});
    at = 0;
    r.step('first', 'Pass 1: create one new node for every original node (values only, no pointers yet).', view('active'), {});
    for (let k = 0; k < n; k++) {
      at = k;
      r.op();
      made = k + 1;
      r.step('make', `Create a copy of node ${values[k]} and remember it in the map.`, view('active', 'new'), { made });
    }
    at = 0;
    r.step('second', 'Pass 2: wire up next and random pointers of each copy using the map.', view('active'), {});
    let asked = 0;
    for (let k = 0; k < n; k++) {
      at = k;
      r.op();
      const nx = k + 1 < n ? k + 1 : null;
      if (asked < 1) {
        asked++;
        r.predictChoice('next', `Node ${values[k]} points to ${nx === null ? 'None' : values[nx]}. What should its copy's next be?`, nx === null ? 'None' : `the copy of ${values[nx]}`, [nx === null ? 'the original first node' : `the original node ${values[nx]}`, 'the copy of the head'], k, 'The copy must point at copies, never back into the original list, so we look the target up in the map.');
      }
      copyNext[k] = nx;
      r.step('linkNext', `copies[${values[k]}].next = copies.get(${nx === null ? 'None' : values[nx]}).`, view('active', 'swap'), { k });
      const rd = orig[k];
      if (rd !== null) {
        r.predictChoice('random', `Node ${values[k]}'s random pointer targets node ${values[rd]}. Where does its copy's random pointer go?`, `the copy of ${values[rd]}`, [`the original node ${values[rd]}`, `the copy of ${values[(rd + 1) % n]}`, 'None'], k + 1, 'Looking the target up in the map turns an original node into its copy.');
      }
      copyRandom[k] = rd;
      r.step('linkRandom', rd === null ? `Node ${values[k]} has no random pointer, so the copy's random is None.` : `copies[${values[k]}].random = copies.get(${values[rd]}).`, view('active', 'swap'), { k });
    }
    at = null;
    const out: Pair[] = pairs.map((_, k) => [values[k], copyRandom[k]]);
    r.step('done', 'Return the copy of the head: a full deep copy that shares no node with the original.', view(null, null), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ pairs }) {
    return pairs.map((p) => [...p]);
  },
});

export default problem({
  summary: 'Each node of a linked list holds a value, a next pointer and an extra "random" pointer that may point to any node in the list (or to nothing). Build a completely new copy of the list, with the same values and the same pointer structure, that shares no node with the original.',
  example: ['nodes: A (random → C), B (random → A), C (random → none)', 'A′ (random → C′), B′ (random → A′), C′ (random → none)', 'Every pointer in the copy points at copies, never at an original node.'],
  pattern: ['hash-lookup', ['hash-lookup', 'linked-list', 'dfs', 'two-pointers'], 'A map from each original node to its copy turns "the node this pointer targets" into "its copy" in O(1). One pass creates the copies, a second wires the pointers.', {
    'linked-list': 'It is a linked-list problem, but the key tool is the hash map from originals to copies.',
    dfs: 'A recursive copy with a visited map also works, but two simple passes are easier to reason about.',
    'two-pointers': 'An O(1)-space version interleaves copies into the list, which is clever but harder than the two-pass map approach.',
  }],
  hints: [
    'Copying next pointers is easy, but a random pointer can point forward to a node that does not have a copy yet. How could you avoid that?',
    'What if every original node already had its copy before you start connecting anything?',
    'Pass 1: create a copy of every node and store original → copy in a dict. Pass 2: set copy.next and copy.random by looking the targets up in the dict.',
  ],
  insight: 'First create all the copies and remember original → copy. Then connect next and random by looking targets up in that map.',
  brute: 'Without a map you would search the list for the copy of each target: O(n²).',
  optimal: 'Two passes with a hash map: O(n) time, O(n) space.',
  walk: ['Return None for an empty list.', 'Pass 1: walk the original list, creating Node(val) for each node and storing copies[node] = copy.', 'Pass 2: walk again. For each node set copies[node].next = copies.get(node.next) and copies[node].random = copies.get(node.random). get returns None for a missing key, which handles None targets.', 'Return copies[head].'],
  edge: ['Empty list.', 'A random pointer to the node itself.', 'Random pointers that go forward and backward.', 'Nodes with equal values (the map is keyed by node identity, not value).'],
  works: ['After pass 1 every original node has exactly one copy, so any pointer target can be translated into its copy.', 'The copies are brand new nodes, so the copy never shares structure with the original.'],
  time: ['O(n)', 'Two linear passes.'],
  space: ['O(n)', 'The map holds one entry per node (plus the copies themselves).'],
  solution,
  cases,
  sig: 'def copy_random_list(head):\n    # Node(val, next, random) is provided; return the head of a deep copy\n    pass\n',
  harness,
  viz,
  fromArgs: ([pairs]) => ({ pairs }),
});
