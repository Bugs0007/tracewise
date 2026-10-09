import { describe, expect, it } from 'vitest';
import { SCENARIOS, simulate, type AEdge, type ANode } from './architectModel';

const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const n = (id: string, kind: ANode['kind']): ANode => ({ id, kind, x: 0, y: 0 });
const e = (from: string, to: string): AEdge => ({ from, to });

describe('architecture model', () => {
  it('a single server handles the blog', () => {
    const r = simulate([n('c', 'client'), n('a', 'app'), n('d', 'db')], [e('c', 'a'), e('a', 'd')], sc('blog'));
    expect(r.problems).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('reports missing paths', () => {
    expect(simulate([n('c', 'client')], [], sc('blog')).problems[0]).toMatch(/No path/);
  });

  it('finds the bottleneck under news-site load and passes with a scaled design', () => {
    const small = simulate([n('c', 'client'), n('a', 'app'), n('d', 'db')], [e('c', 'a'), e('a', 'd')], sc('news'));
    expect(small.passed).toBe(false);
    expect(small.bottleneck).toBe('a');
    const nodes = [n('c', 'client'), n('cdn', 'cdn'), n('lb', 'lb'), ...[1, 2, 3, 4, 5, 6].map((i) => n(`a${i}`, 'app')), n('k', 'cache'), n('d', 'db')];
    const edges = [e('c', 'cdn'), e('cdn', 'lb'), ...[1, 2, 3, 4, 5, 6].flatMap((i) => [e('lb', `a${i}`), e(`a${i}`, 'k'), e(`a${i}`, 'd')])];
    const big = simulate(nodes, edges, sc('news'));
    expect(big.problems).toEqual([]);
  });

  it('async writes need workers wired to the database', () => {
    const nodes = [n('c', 'client'), n('lb', 'lb'), ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => n(`a${i}`, 'app')), n('k', 'cache'), n('d', 'db'), n('q', 'queue')];
    const base = [e('c', 'lb'), ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [e('lb', `a${i}`), e(`a${i}`, 'k'), e(`a${i}`, 'd'), e(`a${i}`, 'q')])];
    expect(simulate(nodes, base, sc('shop')).problems.join()).toMatch(/no workers/);
    const workers = [1, 2, 3, 4, 5, 6, 7].map((i) => n(`w${i}`, 'worker'));
    const wired = [...base, ...workers.flatMap((w) => [e('q', w.id), e(w.id, 'd')])];
    const r = simulate([...nodes, ...workers], wired, sc('shop'));
    expect(r.problems.filter((p) => /worker|queue/i.test(p))).toEqual([]);
  });
});

describe('flash sale with a queue', () => {
  it('passes when the queue protects the primary and a replica takes the reads', () => {
    const apps = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => n(`a${i}`, 'app'));
    const nodes = [n('c', 'client'), n('lb', 'lb'), ...apps, n('k', 'cache'), n('d', 'db'), n('r', 'replica'), n('q', 'queue'), n('w1', 'worker'), n('w2', 'worker'), n('w3', 'worker')];
    const edges = [e('c', 'lb'), ...apps.flatMap((a) => [e('lb', a.id), e(a.id, 'k'), e(a.id, 'd'), e(a.id, 'r'), e(a.id, 'q')]), e('d', 'r'), ...['w1', 'w2', 'w3'].flatMap((w) => [e('q', w), e(w, 'd')])];
    const r = simulate(nodes, edges, sc('shop'));
    expect(r.problems).toEqual([]);
    expect(r.notes.join()).toMatch(/queue grows/);
  });
  it('fails when too many workers hammer the primary', () => {
    const apps = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => n(`a${i}`, 'app'));
    const ws = [1, 2, 3, 4, 5, 6].map((i) => n(`w${i}`, 'worker'));
    const nodes = [n('c', 'client'), n('lb', 'lb'), ...apps, n('k', 'cache'), n('d', 'db'), n('r', 'replica'), n('q', 'queue'), ...ws];
    const edges = [e('c', 'lb'), ...apps.flatMap((a) => [e('lb', a.id), e(a.id, 'k'), e(a.id, 'd'), e(a.id, 'r'), e(a.id, 'q')]), e('d', 'r'), ...ws.flatMap((w) => [e('q', w.id), e(w.id, 'd')])];
    expect(simulate(nodes, edges, sc('shop')).problems.join()).toMatch(/DB primary/);
  });
});
