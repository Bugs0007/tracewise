import { Recorder } from '@/engine/recorder';
import type { GraphNode, GraphPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { FLOW, VIEWPORT, rectNode, sceneSolve, type PosScene, type PositionValue, type Rect } from '@/content/lib/frontend-css-web';

const code = `
function containingBlock(el) {
  if (el.position === 'fixed') return viewport;                       //@fixed
  if (el.position !== 'absolute') return el.parent;                   //@parent
  let p = el.parent;                                                  //@start
  while (p && p.position === 'static') p = p.parent;                  //@walk
  return p || initialContainingBlock;                                 //@found
}

function place(el, cb) {
  if (el.position === 'absolute') return { x: cb.x + el.left, y: cb.y + el.top };  //@abs
  if (el.position === 'fixed') return { x: el.left, y: scrollY + el.top };         //@fix
  if (el.position === 'sticky') return { x: flow.x, y: Math.max(flow.y, scrollY + el.top) };  //@sticky
  return { x: flow.x + (el.left || 0), y: flow.y + (el.top || 0) };                //@rel
}
`;

interface In {
  a: 'static' | 'relative';
  b: 'static' | 'relative';
  c: PositionValue;
  top: number;
  left: number;
  scrollY: number;
}

const POSITIONS: PositionValue[] = ['static', 'relative', 'absolute', 'fixed', 'sticky'];

const viz: VizDef<In> = {
  id: 'css-positioning',
  title: 'Positioning and the containing block',
  code,
  language: 'javascript',
  inputs: [
    { key: 'a', label: 'A (outer card) position', kind: 'select', default: 'static', options: ['static', 'relative'] },
    { key: 'b', label: 'B (wrapper) position', kind: 'select', default: 'relative', options: ['static', 'relative'] },
    { key: 'c', label: 'C (the child) position', kind: 'select', default: 'absolute', options: POSITIONS },
    { key: 'top', label: 'C top (px)', kind: 'number', default: 20 },
    { key: 'left', label: 'C left (px)', kind: 'number', default: 30 },
    { key: 'scrollY', label: 'Page scrolled by (px)', kind: 'number', default: 0 },
  ],
  presets: [
    { label: 'Absolute inside relative B', input: { a: 'static', b: 'relative', c: 'absolute', top: 20, left: 30, scrollY: 0 } },
    { label: 'Skips static B, finds A', input: { a: 'relative', b: 'static', c: 'absolute', top: 20, left: 30, scrollY: 0 } },
    { label: 'No positioned ancestor', input: { a: 'static', b: 'static', c: 'absolute', top: 20, left: 30, scrollY: 0 } },
    { label: 'Fixed while scrolled', input: { a: 'relative', b: 'relative', c: 'fixed', top: 20, left: 30, scrollY: 200 } },
    { label: 'Sticky pins', input: { a: 'static', b: 'static', c: 'sticky', top: 10, left: 0, scrollY: 150 } },
    { label: 'Relative nudge', input: { a: 'static', b: 'static', c: 'relative', top: 15, left: 25, scrollY: 0 } },
  ],
  run(input) {
    const r = new Recorder(code);
    const scene: PosScene = { a: input.a, b: input.b, c: input.c, top: input.top, left: input.left, scrollY: input.scrollY };
    if (!POSITIONS.includes(scene.c)) throw new Error('Unknown position value');
    const res = sceneSolve(scene);
    const flowC = FLOW.C;
    const final: Rect = { x: res.x, y: res.y, w: flowC.w, h: flowC.h };
    const showViewport = scene.c === 'fixed' || scene.c === 'sticky' || scene.scrollY !== 0;
    const vp: Rect = { x: 0, y: scene.scrollY, w: VIEWPORT.w, h: VIEWPORT.h };
    const icb: Rect = { x: 0, y: 0, w: VIEWPORT.w, h: VIEWPORT.h };
    const all: Rect[] = [icb, FLOW.A, FLOW.B, flowC, final, ...(showViewport ? [vp] : [])];
    const minX = Math.min(...all.map((q) => q.x));
    const maxX = Math.max(...all.map((q) => q.x + q.w));
    const minY = Math.min(...all.map((q) => q.y));
    const maxY = Math.max(...all.map((q) => q.y + q.h));
    const sc = Math.min(1, 560 / (maxX - minX), 330 / (maxY - minY));
    const put = (id: string, label: string, q: Rect, tone: Tone, extra: Partial<GraphNode> = {}) => rectNode(id, label, (q.x - minX) * sc, (q.y - minY) * sc, q.w * sc, q.h * sc, tone, extra);
    const isPos = (p: string) => p !== 'static';

    const panel = (opts: { cbId?: string; testing?: string; found?: string; cPlaced?: boolean; edgeLabel?: string }, title: string): GraphPanel => {
      const nodes: GraphNode[] = [put('icb', '', icb, 'muted', { tags: ['initial containing block'] })];
      if (showViewport) nodes.push(put('viewport', '', vp, 'frontier', { tags: [`viewport (scrollY ${scene.scrollY})`] }));
      const tone = (id: string, base: Tone): Tone => (opts.found === id ? 'found' : opts.testing === id ? 'compare' : base);
      nodes.push(put('A', '', FLOW.A, tone('A', isPos(scene.a) ? 'swap' : 'default'), { tags: [`A  position: ${scene.a}`] }));
      nodes.push(put('B', '', FLOW.B, tone('B', isPos(scene.b) ? 'swap' : 'default'), { tags: [`B  position: ${scene.b}`] }));
      if (opts.cPlaced) {
        if (final.x !== flowC.x || final.y !== flowC.y) nodes.push(put('Cflow', '', flowC, 'muted', { tags: ['C in normal flow'] }));
        nodes.push(put('C', 'C', final, 'active', { tags: [`C  position: ${scene.c}`] }));
      } else nodes.push(put('C', 'C', flowC, 'active', { tags: [`C  position: ${scene.c}`] }));
      const edges = opts.cbId && opts.cPlaced ? [{ from: opts.cbId, to: 'C', dashed: true, directed: true, label: opts.edgeLabel }] : [];
      return { type: 'graph', title, nodes, edges, width: Math.round((maxX - minX) * sc), height: Math.round((maxY - minY) * sc) };
    };
    const cbNode: Record<string, string> = { A: 'A', B: 'B', viewport: 'viewport', page: 'icb' };
    const cbName: Record<string, string> = { A: 'A', B: 'B', viewport: 'the viewport', page: 'the initial containing block' };

    r.step('parent', `C has position: ${scene.c}. Where would it sit in normal flow? Inside B at (${flowC.x}, ${flowC.y})`, [panel({}, 'Normal-flow layout')], { c: scene.c, flowX: flowC.x, flowY: flowC.y });
    if (scene.c === 'fixed') {
      r.step('fixed', 'fixed: the containing block is the viewport, no matter which ancestors are positioned', [panel({ testing: 'viewport' }, 'Containing block lookup')], { containingBlock: 'viewport' });
    } else if (scene.c === 'absolute') {
      r.step('start', 'absolute: start at the parent and walk up until an ancestor is not static', [panel({ testing: 'B' }, 'Walking up from C')], { p: 'B' });
      r.op();
      r.step('walk', `B is ${scene.b}${scene.b === 'static' ? ': skip it' : ': positioned, stop here'}`, [panel({ testing: scene.b === 'static' ? 'B' : undefined, found: scene.b === 'static' ? undefined : 'B' }, 'Checking B')], { p: 'B', position: scene.b });
      if (scene.b === 'static') {
        r.op();
        r.step('walk', `A is ${scene.a}${scene.a === 'static' ? ': skip it too' : ': positioned, stop here'}`, [panel({ testing: scene.a === 'static' ? 'A' : undefined, found: scene.a === 'static' ? undefined : 'A' }, 'Checking A')], { p: 'A', position: scene.a });
      }
      r.step('found', res.cb === 'page' ? 'No positioned ancestor: fall back to the initial containing block' : `Containing block = ${res.cb} (nearest positioned ancestor)`, [panel({ found: res.cb === 'page' ? undefined : res.cb, testing: res.cb === 'page' ? 'icb' : undefined }, 'Containing block found')], { containingBlock: res.cb });
    } else {
      r.step('parent', scene.c === 'static' ? 'static ignores top/left; the containing block is simply the parent block' : `${scene.c}: offsets are measured from C itself (or its scroll container), not from an ancestor`, [panel({ found: 'B' }, 'Containing block')], { containingBlock: 'B' });
    }
    const how: Record<PositionValue, [string, string]> = {
      static: ['rel', `top/left do nothing: C stays at (${res.x}, ${res.y})`],
      relative: ['rel', `relative: flow position + offsets = (${flowC.x} + ${scene.left}, ${flowC.y} + ${scene.top}) = (${res.x}, ${res.y})`],
      absolute: ['abs', `absolute: ${res.cb} corner + offsets = (${res.x - scene.left} + ${scene.left}, ${res.y - scene.top} + ${scene.top}) = (${res.x}, ${res.y})`],
      fixed: ['fix', `fixed: left ${scene.left}, top ${scene.top} + scroll ${scene.scrollY} in page coordinates = (${res.x}, ${res.y})`],
      sticky: ['sticky', `sticky: max(flow y ${flowC.y}, scroll ${scene.scrollY} + top ${scene.top}), capped by B's bottom = y ${res.y}`],
    };
    r.step(how[scene.c][0], how[scene.c][1], [panel({ cbId: cbNode[res.cb] ?? 'B', cPlaced: true, edgeLabel: scene.c === 'absolute' || scene.c === 'fixed' ? `left ${scene.left}, top ${scene.top}` : undefined, found: scene.c === 'absolute' && res.cb !== 'page' ? res.cb : undefined }, 'Final position'), { type: 'kv', entries: [{ k: 'containing block', v: cbName[res.cb] ?? res.cb }, { k: 'x', v: res.x, tone: 'found' }, { k: 'y', v: res.y, tone: 'found' }] }], { x: res.x, y: res.y });
    return { frames: r.frames, result: res };
  },
  reference(i) {
    const c = i.c;
    const fl = FLOW.C;
    if (c === 'fixed') return { cb: 'viewport', x: i.left, y: i.top + i.scrollY };
    if (c === 'absolute') {
      const anchor = i.b === 'relative' ? { cb: 'B', o: FLOW.B } : i.a === 'relative' ? { cb: 'A', o: FLOW.A } : { cb: 'page', o: { x: 0, y: 0 } };
      return { cb: anchor.cb, x: anchor.o.x + i.left, y: anchor.o.y + i.top };
    }
    if (c === 'relative') return { cb: 'B', x: fl.x + i.left, y: fl.y + i.top };
    if (c === 'sticky') {
      const want = i.scrollY + i.top;
      const limit = FLOW.B.y + FLOW.B.h - fl.h;
      return { cb: 'B', x: fl.x, y: want > fl.y ? Math.min(want, limit) : Math.min(fl.y, limit) };
    }
    return { cb: 'B', x: fl.x, y: fl.y };
  },
};

const unit: Unit = {
  id: 'css-positioning',
  hook: 'Nearly every "my tooltip is in the wrong place" bug is a containing-block bug. Knowing that `absolute` measures from the nearest positioned ancestor, not the parent, is a front-end classic.',
  predict: {
    prompt: 'A child has `position: absolute; top: 10px; left: 10px`. Its parent `.wrapper` is static; the grandparent `.card` has `position: relative`. Where is the child measured from?',
    options: ['The top-left of `.wrapper`', 'The top-left of `.card`', 'The top-left of the page or viewport', 'Where it would have been in normal flow'],
    answer: 1,
    explain: 'An absolutely positioned box uses the nearest ancestor whose position is not static. `.wrapper` is static, so the lookup continues to `.card`. Only if no ancestor is positioned does it use the initial containing block.',
  },
  viz,
  simulationNote: 'One fixed three-box scene (A > B > C) with border-box = padding-box and no transforms. It models top/left only; `right`, `bottom`, z-index and stacking contexts are not drawn.',
  deeper: {
    points: [
      '`static` is the default and ignores top/left/right/bottom. Any other value makes the element "positioned" and able to anchor absolute descendants.',
      '`relative` shifts the box visually but keeps its original space in the flow; it is most often used just to create a containing block (`position: relative` with no offsets).',
      '`absolute` is removed from the flow and measured from the padding box of the nearest positioned ancestor, falling back to the initial containing block.',
      '`fixed` is measured from the viewport and does not move on scroll. A `transform`, `filter` or `will-change: transform` on an ancestor turns that ancestor into its containing block.',
      '`sticky` behaves like relative until its scroll threshold is reached, then pins, but never leaves its parent box.',
    ],
    pitfalls: ['Positioning a tooltip against the wrong ancestor because the intended container has no `position: relative`', 'Expecting `fixed` to ignore an ancestor with `transform`', 'Forgetting that sticky needs a threshold (`top: 0`) and an ancestor without `overflow: hidden`'],
  },
  practice: {
    language: 'javascript',
    fnName: 'containingBlockId',
    statement: 'nodes is a list of {id, parent, position}. Return the id of the containing block of the absolutely positioned node `id`: its nearest ancestor whose position is not "static", or "viewport" if there is none.',
    signature: 'function containingBlockId(nodes, id) {',
    solution: `function containingBlockId(nodes, id) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  let p = byId[@@byId[id].parent@@];
  while (p && @@p.position === 'static'@@) {
    p = byId[@@p.parent@@];
  }
  return @@p ? p.id : 'viewport'@@;
}`,
    tests: [
      {
        args: [[{ id: 'body', parent: null, position: 'static' }, { id: 'a', parent: 'body', position: 'relative' }, { id: 'b', parent: 'a', position: 'static' }, { id: 'c', parent: 'b', position: 'absolute' }], 'c'],
        expected: 'a',
        name: 'skips a static parent',
      },
      { args: [[{ id: 'body', parent: null, position: 'static' }, { id: 'a', parent: 'body', position: 'static' }, { id: 'c', parent: 'a', position: 'absolute' }], 'c'], expected: 'viewport', name: 'no positioned ancestor' },
      { args: [[{ id: 'body', parent: null, position: 'static' }, { id: 'a', parent: 'body', position: 'relative' }, { id: 'c', parent: 'a', position: 'absolute' }], 'c'], expected: 'a', name: 'positioned parent' },
      { args: [[{ id: 'a', parent: null, position: 'static' }, { id: 'b', parent: 'a', position: 'sticky' }, { id: 'c', parent: 'b', position: 'absolute' }], 'c'], expected: 'b', name: 'sticky counts as positioned' },
      {
        args: [[{ id: 'a', parent: null, position: 'absolute' }, { id: 'b', parent: 'a', position: 'relative' }, { id: 'c', parent: 'b', position: 'absolute' }], 'c'],
        expected: 'b',
        name: 'nearest wins',
      },
      { args: [[{ id: 'a', parent: null, position: 'fixed' }, { id: 'c', parent: 'a', position: 'absolute' }], 'c'], expected: 'a', name: 'fixed counts as positioned' },
      { args: [[{ id: 'c', parent: null, position: 'absolute' }], 'c'], expected: 'viewport', name: 'root level' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'absolutePosition',
    statement: 'A popup is placed at the wrong spot whenever its parent is not positioned. The helper returns the page coordinates of an absolutely positioned node (cb corner + left/top). Fix it.',
    buggy: `function absolutePosition(nodes, id) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  const el = byId[id];
  const cb = byId[el.parent];
  const origin = cb ? { x: cb.x, y: cb.y } : { x: 0, y: 0 };
  return { x: origin.x + el.left, y: origin.y + el.top };
}`,
    fixed: `function absolutePosition(nodes, id) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  const el = byId[id];
  let cb = byId[el.parent];
  while (cb && cb.position === 'static') cb = byId[cb.parent];
  const origin = cb ? { x: cb.x, y: cb.y } : { x: 0, y: 0 };
  return { x: origin.x + el.left, y: origin.y + el.top };
}`,
    tests: [
      { args: [[{ id: 'p', parent: null, position: 'relative', x: 30, y: 40 }, { id: 'c', parent: 'p', position: 'absolute', x: 35, y: 45, left: 10, top: 20 }], 'c'], expected: { x: 40, y: 60 }, name: 'positioned parent' },
      {
        args: [[{ id: 'g', parent: null, position: 'relative', x: 100, y: 50 }, { id: 'p', parent: 'g', position: 'static', x: 120, y: 70 }, { id: 'c', parent: 'p', position: 'absolute', x: 125, y: 75, left: 10, top: 20 }], 'c'],
        expected: { x: 110, y: 70 },
        name: 'static parent is skipped',
      },
      { args: [[{ id: 'p', parent: null, position: 'static', x: 60, y: 70 }, { id: 'c', parent: 'p', position: 'absolute', x: 60, y: 70, left: 15, top: 25 }], 'c'], expected: { x: 15, y: 25 }, name: 'falls back to the page origin' },
      {
        args: [
          [
            { id: 'a', parent: null, position: 'relative', x: 10, y: 10 },
            { id: 'b', parent: 'a', position: 'relative', x: 50, y: 60 },
            { id: 'c', parent: 'b', position: 'static', x: 55, y: 65 },
            { id: 'd', parent: 'c', position: 'absolute', x: 60, y: 70, left: 5, top: 5 },
          ],
          'd',
        ],
        expected: { x: 55, y: 65 },
        name: 'nearest positioned ancestor',
      },
    ],
    bugType: 'wrong containing block',
    hint: 'Which node does the code use as the origin, and is it always the right one?',
    explanation: 'The code measures from the direct parent. The real containing block is the nearest ancestor that is NOT static, so the lookup must keep walking up past static ancestors (and fall back to the page origin).',
  },
  boss: {
    title: 'Resolve every box position',
    language: 'javascript',
    fnName: 'resolve',
    statement:
      'nodes: [{id, parent, position, x, y, left?, top?}] where x,y is the flow position of the box with no positioning applied. Return {id: {x, y}} of the final positions for scroll offset scrollY (missing left/top are 0). static and sticky stay put; relative adds its offsets; absolute adds its offsets to the final position of its nearest non-static ancestor (page origin if none); fixed is (left, top + scrollY). Boxes in normal flow also move with their parent: add how far the parent moved from its own flow position.',
    starter: `function resolve(nodes, scrollY) {
  // your code here
}
`,
    solution: `function resolve(nodes, scrollY) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  const out = {};
  const place = (n) => {
    if (out[n.id]) return out[n.id];
    const parent = n.parent ? byId[n.parent] : null;
    let pos;
    if (n.position === 'fixed') {
      pos = { x: n.left || 0, y: (n.top || 0) + scrollY };
    } else if (n.position === 'absolute') {
      let cb = parent;
      while (cb && cb.position === 'static') cb = cb.parent ? byId[cb.parent] : null;
      const o = cb ? place(cb) : { x: 0, y: 0 };
      pos = { x: o.x + (n.left || 0), y: o.y + (n.top || 0) };
    } else {
      const moved = parent ? place(parent) : null;
      const dx = moved ? moved.x - parent.x : 0;
      const dy = moved ? moved.y - parent.y : 0;
      const rel = n.position === 'relative';
      pos = { x: n.x + dx + (rel ? n.left || 0 : 0), y: n.y + dy + (rel ? n.top || 0 : 0) };
    }
    out[n.id] = pos;
    return pos;
  };
  nodes.forEach(place);
  return out;
}`,
    tests: [
      {
        args: [
          [
            { id: 'body', parent: null, position: 'static', x: 0, y: 0 },
            { id: 'box', parent: 'body', position: 'relative', x: 100, y: 50, left: 10, top: 5 },
            { id: 'tip', parent: 'box', position: 'absolute', x: 110, y: 60, left: 20, top: 30 },
          ],
          0,
        ],
        expected: { body: { x: 0, y: 0 }, box: { x: 110, y: 55 }, tip: { x: 130, y: 85 } },
        name: 'absolute inside relative',
      },
      {
        args: [
          [
            { id: 'body', parent: null, position: 'static', x: 0, y: 0 },
            { id: 'p', parent: 'body', position: 'relative', x: 100, y: 100, left: 10, top: 10 },
            { id: 'k', parent: 'p', position: 'static', x: 110, y: 120 },
          ],
          0,
        ],
        expected: { body: { x: 0, y: 0 }, p: { x: 110, y: 110 }, k: { x: 120, y: 130 } },
        name: 'in-flow child follows a shifted parent',
      },
      {
        args: [
          [
            { id: 'body', parent: null, position: 'static', x: 0, y: 0 },
            { id: 'hdr', parent: 'body', position: 'fixed', x: 0, y: 0, left: 5, top: 10 },
          ],
          300,
        ],
        expected: { body: { x: 0, y: 0 }, hdr: { x: 5, y: 310 } },
        name: 'fixed follows the scroll',
      },
      {
        args: [
          [
            { id: 'body', parent: null, position: 'static', x: 0, y: 0 },
            { id: 'pop', parent: 'body', position: 'absolute', x: 0, y: 0, left: 15, top: 25 },
          ],
          0,
        ],
        expected: { body: { x: 0, y: 0 }, pop: { x: 15, y: 25 } },
        name: 'no positioned ancestor',
      },
      {
        args: [
          [
            { id: 'a', parent: null, position: 'relative', x: 50, y: 60 },
            { id: 'b', parent: 'a', position: 'static', x: 60, y: 70 },
            { id: 'c', parent: 'b', position: 'absolute', x: 60, y: 70, left: 1, top: 2 },
          ],
          0,
        ],
        expected: { a: { x: 50, y: 60 }, b: { x: 60, y: 70 }, c: { x: 51, y: 62 } },
        name: 'skips a static ancestor',
      },
      {
        args: [
          [
            { id: 'r', parent: null, position: 'relative', x: 30, y: 40 },
            { id: 'k', parent: 'r', position: 'absolute', x: 30, y: 40 },
          ],
          0,
        ],
        expected: { r: { x: 30, y: 40 }, k: { x: 30, y: 40 } },
        name: 'missing offsets are 0',
      },
    ],
    hints: ['Resolve nodes recursively with a memo: the final position of a node may depend on its parent or on its containing block.', 'For normal-flow nodes, delta = final(parent) - flow(parent); add it to the node flow position. Absolute nodes ignore that and anchor to the containing block final position.'],
    combines: ['css-box-model'],
  },
  quiz: [
    {
      prompt: 'Which declaration makes a header stay at the top of the viewport while the page scrolls, regardless of its ancestors?',
      options: ['`position: relative; top: 0`', '`position: fixed; top: 0`', '`position: absolute; top: 0`', '`display: sticky`'],
      answer: 1,
      explain: '`fixed` is positioned against the viewport. (Caveat: an ancestor with `transform` becomes its containing block instead.)',
    },
  ],
};

export default unit;
