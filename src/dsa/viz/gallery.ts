// Sample panels for every visualizer primitive (shared by the gallery page and the primitive tests).
import { buildTree } from '@/engine/layout';
import type { Panel } from '@/engine/types';
import {
  arrayView,
  bitsView,
  bucketsView,
  chipsView,
  dpTable1D,
  dpTable2D,
  frontierView,
  graphView,
  gridView,
  hashMapView,
  hashSetView,
  heapView,
  intervalsView,
  linkedListView,
  queueView,
  recursionTree,
  stackView,
  stringView,
  treeView,
  trieView,
} from './prims';

export function galleryItems(): { name: string; panels: Panel[] }[] {
  const tree = buildTree([8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13]);
  const ll = [
    { id: 'a', label: '1', tags: ['prev'] },
    { id: 'b', label: '2', tone: 'active' as const, tags: ['curr'] },
    { id: 'c', label: '3', tone: 'frontier' as const, tags: ['next'] },
    { id: 'd', label: '4' },
  ];
  return [
    { name: 'array · pointers and a window bracket', panels: [arrayView([2, 7, 1, 8, 2, 8, 1], { title: 'nums', tones: { 2: 'active', 3: 'active', 4: 'active' }, pointers: { l: 2, r: 4 }, window: { from: 2, to: 4, label: 'window', tone: 'active' } })] },
    { name: 'string', panels: [stringView('abcabcbb', { title: 's', tones: { 0: 'visited', 1: 'visited', 2: 'active' }, pointers: { i: 2 } })] },
    { name: 'bits', panels: [bitsView(0b10110010, 8, { title: 'n = 178', tones: { 0: 'found', 3: 'found', 4: 'found', 6: 'found' } })] },
    { name: 'hash map and hash set', panels: [hashMapView({ a: 2, b: 1, c: 3 }, { title: 'count', tones: { b: 'new' } }), hashSetView([3, 9, 12], { title: 'seen', tones: { 9: 'found' } })] },
    { name: 'buckets', panels: [bucketsView([[], [3], [2, 5], [1]], { title: 'buckets', tones: { 2: 'active' } })] },
    { name: 'stack, queue, chips', panels: [stackView(['(', '[', '{'], { title: 'stack', tones: { 2: 'active' } }), queueView([4, 7, 9], { title: 'queue' }), chipsView(['1#a', '2#bc'], { title: 'out', startLabel: 'out =' })] },
    { name: 'linked list · rewiring', panels: [linkedListView(ll, { a: 'b', b: 'a', c: 'd', d: null }, { title: 'reversing: 2 now points back at 1' })] },
    { name: 'binary tree', panels: [treeView(tree, { title: 'BST', tones: tree ? { [tree.id]: 'visited', [tree.left!.id]: 'active' } : {} })] },
    { name: 'trie', panels: [trieView(['car', 'cat', 'cow', 'do'], { title: 'search "ca"', walk: 'ca', walkTone: 'active' })] },
    { name: 'heap · tree and array', panels: heapView([1, 3, 2, 7, 4, 5], { tones: { 1: 'compare', 0: 'active' }, pointers: { i: 1 } }) },
    { name: 'graph · BFS frontier', panels: [graphView(['A', 'B', 'C', 'D', 'E'], [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'E' }], { tones: { A: 'visited', B: 'active', C: 'frontier' }, edgeTones: { 'A-B': 'path' }, size: { width: 360, height: 200 } }), frontierView('queue', ['C', 'D'])] },
    { name: 'grid · islands', panels: [gridView([[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1]], { title: 'grid', tones: { '0,0': 'visited', '0,1': 'active', '1,0': 'frontier' }, compact: false })] },
    { name: 'dp table 1-D · dependencies', panels: [dpTable1D([1, 1, 2, 3, 5, null], { title: 'ways[i]', filling: 5, deps: [3, 4], tones: { 0: 'done', 1: 'done', 2: 'done' } })] },
    { name: 'dp table 2-D · dependency arrows', panels: [dpTable2D([[0, 0, 0, 0], [0, 1, 1, 1], [0, 1, 2, null]], { title: 'lcs[i][j]', rowLabels: ['', 'a', 'c'], colLabels: ['', 'a', 'b', 'c'], filling: [2, 3], deps: [[1, 2], [2, 2], [1, 3]] })] },
    { name: 'intervals on a number line', panels: [intervalsView([{ start: 1, end: 3, tone: 'done' }, { start: 2, end: 6, tone: 'active' }, { start: 8, end: 10 }, { start: 9, end: 12, tone: 'frontier' }], { title: 'merge', marks: [{ at: 6, label: 'end', tone: 'compare' }] })] },
    {
      name: 'recursion tree',
      panels: [
        recursionTree(
          { r: { id: 'r', label: '[]', children: ['a', 'b'] }, a: { id: 'a', label: '[1]', children: ['c'], tone: 'done' }, b: { id: 'b', label: '[2]', children: [], tone: 'active' }, c: { id: 'c', label: '[1,2]', children: [], tone: 'frontier' } },
          'r',
          { title: 'subsets', edgeLabels: { 'r>a': 'take 1', 'r>b': 'skip 1' } },
        ),
      ],
    },
  ];
}
