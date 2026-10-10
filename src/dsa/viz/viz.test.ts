// The visualizer primitives and the trace recorder.
import { describe, expect, it } from 'vitest';
import { checkFrame, checkPanel } from './check';
import { galleryItems } from './gallery';
import { arrayView, bitsView, bucketsView, dpTable1D, dpTable2D, graphView, hashMapView, hashSetView, heapView, intervalsView, stackView, trieView } from './prims';
import { MAX_CHECKPOINTS, TraceRecorder, choices, nz } from './trace';

describe('primitives', () => {
  it('every gallery sample is a well-formed panel', () => {
    const items = galleryItems();
    expect(items.length).toBeGreaterThanOrEqual(15);
    for (const it of items) {
      expect(it.panels.length, it.name).toBeGreaterThan(0);
      for (const p of it.panels) expect(checkPanel(p), it.name).toEqual([]);
    }
  });

  it('covers every panel family the track needs', () => {
    const types = new Set(galleryItems().flatMap((i) => i.panels.map((p) => p.type)));
    for (const t of ['array', 'grid', 'graph', 'list', 'buckets', 'kv', 'intervals']) expect(types.has(t as never), t).toBe(true);
  });

  it('array: window and pointers pass through', () => {
    const p = arrayView([1, 2, 3, 4], { window: { from: 1, to: 2, label: 'w' }, pointers: { l: 1, r: 2 } });
    expect(p.range).toMatchObject({ from: 1, to: 2, label: 'w' });
    expect(p.pointers).toEqual({ l: 1, r: 2 });
  });

  it('bits: most significant bit first, with bit positions as labels', () => {
    const p = bitsView(5, 8);
    expect(p.values).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
    expect(p.indexLabels).toEqual(['7', '6', '5', '4', '3', '2', '1', '0']);
    expect(bitsView(2 ** 31, 32).values[0]).toBe(1);
  });

  it('hash map and set render values as text', () => {
    expect(hashMapView(new Map([[1, [2, 3]]])).entries).toEqual([{ k: '1', v: '[2, 3]', tone: undefined }]);
    expect(hashSetView(new Set([4, 5])).items.map((i) => i.label)).toEqual(['4', '5']);
  });

  it('stack keeps bottom-to-top order and buckets index by position', () => {
    expect(stackView([1, 2, 3]).items.map((i) => i.label)).toEqual(['1', '2', '3']);
    const b = bucketsView([[], [7], [8, 9]]);
    expect(b.buckets.map((c) => c.length)).toEqual([0, 1, 2]);
  });

  it('heap: tree and array views agree', () => {
    const [tree, arr] = heapView([1, 3, 2, 7, 4]);
    expect(tree.nodes.map((n) => n.label).sort()).toEqual(['1', '2', '3', '4', '7']);
    expect(tree.edges).toHaveLength(4);
    expect(arr.values).toEqual([1, 3, 2, 7, 4]);
  });

  it('trie: shared prefixes share nodes and word ends are marked', () => {
    const t = trieView(['car', 'cat', 'do']);
    // root, c, ca, car, cat, d, do
    expect(t.nodes).toHaveLength(7);
    expect(t.nodes.filter((n) => n.badge === 'end').map((n) => n.id).sort()).toEqual(['car', 'cat', 'do']);
    const walked = trieView(['car', 'cat'], { walk: 'ca', walkTone: 'active' });
    expect(walked.nodes.find((n) => n.id === 'ca')?.tone).toBe('active');
  });

  it('dp tables draw one arrow from each dependency into the cell being filled', () => {
    const p = dpTable2D([[0, 0], [0, null]], { filling: [1, 1], deps: [[0, 1], [1, 0]] });
    expect(p.arrows).toHaveLength(2);
    expect(p.tones?.['1,1']).toBe('active');
    expect(p.tones?.['0,1']).toBe('compare');
    const q = dpTable1D([1, 1, 2, null], { filling: 3, deps: [1, 2] });
    expect(q.cells).toHaveLength(1);
    expect(q.arrows?.map((a) => [a.from, a.to])).toEqual([[[0, 1], [0, 3]], [[0, 2], [0, 3]]]);
  });

  it('graph: edges reference existing nodes and layout gives every node a position', () => {
    const g = graphView(['A', 'B', 'C'], [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }], { directed: true });
    expect(checkPanel(g)).toEqual([]);
    expect(g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('intervals: bars keep their endpoints', () => {
    const p = intervalsView([{ start: 1, end: 3 }, { start: 2, end: 6 }]);
    expect(p.items).toHaveLength(2);
    expect(checkPanel({ ...p, items: [{ start: 5, end: 2 }] })).not.toEqual([]);
  });

  it('the validator rejects broken panels', () => {
    expect(checkPanel({ type: 'array', values: [1], tones: { 3: 'active' } })).not.toEqual([]);
    expect(checkPanel({ type: 'array', values: [1], pointers: { i: 5 } })).not.toEqual([]);
    expect(checkPanel({ type: 'grid', cells: [[1, 2]], arrows: [{ from: [0, 0], to: [4, 4] }] })).not.toEqual([]);
    expect(checkPanel({ type: 'graph', nodes: [{ id: 'a', label: 'a', x: 0, y: 0 }], edges: [{ from: 'a', to: 'z' }], width: 10, height: 10 })).not.toEqual([]);
  });
});

describe('TraceRecorder', () => {
  const code = 'def f():\n    x = 1  #@a\n    return x  #@b\n';
  const panel = [arrayView([1])];

  it('attaches a checkpoint to the frame recorded last, keeping only the first of each kind', () => {
    const r = new TraceRecorder(code);
    r.step('a', 'one', panel);
    r.predict('hit', 'q1', ['x', 'y'], 0);
    r.step('b', 'two', panel);
    r.predict('hit', 'again', ['x', 'y'], 1); // same kind: ignored
    expect(r.frames[0].predict?.question).toBe('q1');
    expect(r.frames[1].predict).toBeUndefined();
    expect(r.checkpoints).toBe(1);
  });

  it('caps the number of checkpoints', () => {
    const r = new TraceRecorder(code);
    for (let i = 0; i < 8; i++) {
      r.step('a', `s${i}`, panel);
      r.predict(`k${i}`, 'q', ['x', 'y'], 0);
    }
    expect(r.frames.filter((f) => f.predict)).toHaveLength(MAX_CHECKPOINTS);
  });

  it('rejects an answer that is not an option and ignores a predict before any frame', () => {
    const r = new TraceRecorder(code);
    r.predict('early', 'q', ['x', 'y'], 0);
    expect(r.checkpoints).toBe(0);
    r.step('a', 'one', panel);
    expect(() => r.predict('bad', 'q', ['x', 'y'], 5)).toThrow();
  });

  it('frames carry the executing line from the anchor and pass the frame checker', () => {
    const r = new TraceRecorder(code);
    r.step('b', 'return', panel, { x: 1 });
    expect(r.frames[0].line).toBe(3);
    expect(checkFrame(r.frames[0], 3)).toEqual([]);
    expect(checkFrame({ ...r.frames[0], caption: '' }, 3)).not.toEqual([]);
    expect(checkFrame(r.frames[0], 2)).not.toEqual([]);
  });

  it('choices put the right answer at different positions and never repeat it', () => {
    const positions = new Set([0, 1, 2, 3].map((seed) => choices('R', ['a', 'b', 'c'], seed).answer));
    expect(positions.size).toBe(4);
    const c = choices('5', ['5', '6', '6', '7'], 1);
    expect(c.options).toHaveLength(3);
    expect(c.options[c.answer]).toBe('5');
  });

  it('nz removes negative zero', () => {
    expect(Object.is(nz(0 * -1), 0)).toBe(true);
    expect(nz(-3)).toBe(-3);
  });
});
