import { Recorder } from '@/engine/recorder';
import type { GraphNode, GraphPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { AUTO_CROSS, flexSolve, r3, rectNode, type AlignItems, type FlexCfg, type FlexDirection, type FlexItem, type Justify, type Rect } from '@/content/lib/frontend-css-web';

const code = `
function flexLayout(c) {
  const n = c.items.length;
  const gaps = (n - 1) * c.gap;
  const free = c.main - gaps - sum(basis);                         //@free
  if (free > 0 && growSum > 0) {                                   //@grow
    size[i] = basis[i] + free * grow[i] / growSum;
  } else if (free < 0) {                                           //@shrink
    size[i] = basis[i] + free * (shrink[i] * basis[i]) / weighted;
  }
  const rem = c.main - gaps - sum(size);                           //@rem
  const { offset, between } = justifyContent(c.justify, rem, n);   //@justify
  // pos[i] = offset + sum(previous sizes) + i * (gap + between)
  cross: stretch fills the line, center / flex-end offset it      //@align
  if (c.direction.endsWith('-reverse')) mirror along main axis     //@reverse
}
`;

interface In {
  direction: FlexDirection;
  justify: Justify;
  align: AlignItems;
  main: number;
  cross: number;
  gap: number;
  items: FlexItem[];
}

function parseItems(raw: unknown): FlexItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('items must be a non-empty JSON array like [{"basis":80,"grow":1,"shrink":1}]');
  if (raw.length > 8) throw new Error('Use at most 8 items');
  return raw.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const num = (k: string, d: number) => {
      const v = o[k] === undefined ? d : Number(o[k]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`item ${i + 1}: "${k}" must be a number >= 0`);
      return v;
    };
    const item: FlexItem = { basis: num('basis', 0), grow: num('grow', 0), shrink: num('shrink', 1) };
    if (o.cross !== undefined) item.cross = num('cross', AUTO_CROSS);
    return item;
  });
}

const fmtN = (n: number) => String(Math.round(n * 10) / 10);

const viz: VizDef<In> = {
  id: 'css-flexbox',
  title: 'Flexbox: free space, grow, shrink, justify, align',
  code,
  language: 'javascript',
  inputs: [
    { key: 'direction', label: 'flex-direction', kind: 'select', default: 'row', options: ['row', 'row-reverse', 'column', 'column-reverse'] },
    { key: 'justify', label: 'justify-content', kind: 'select', default: 'flex-start', options: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'] },
    { key: 'align', label: 'align-items', kind: 'select', default: 'stretch', options: ['stretch', 'flex-start', 'flex-end', 'center'] },
    { key: 'main', label: 'Container size on the main axis (px)', kind: 'number', default: 400 },
    { key: 'cross', label: 'Container size on the cross axis (px)', kind: 'number', default: 120 },
    { key: 'gap', label: 'gap (px)', kind: 'number', default: 10 },
    { key: 'items', label: 'Items: flex-basis / flex-grow / flex-shrink', kind: 'json', default: [{ basis: 80, grow: 1, shrink: 1 }, { basis: 120, grow: 0, shrink: 1 }, { basis: 80, grow: 2, shrink: 1 }], help: 'JSON array; optional "cross" gives a fixed cross size' },
  ],
  presets: [
    { label: 'Grow 1 : 0 : 2', input: { direction: 'row', justify: 'flex-start', align: 'stretch', main: 400, cross: 120, gap: 10, items: [{ basis: 80, grow: 1, shrink: 1 }, { basis: 120, grow: 0, shrink: 1 }, { basis: 80, grow: 2, shrink: 1 }] } },
    { label: 'No grow: justify center', input: { direction: 'row', justify: 'center', align: 'center', main: 400, cross: 120, gap: 10, items: [{ basis: 60, grow: 0, shrink: 1, cross: 40 }, { basis: 90, grow: 0, shrink: 1, cross: 70 }, { basis: 60, grow: 0, shrink: 1, cross: 50 }] } },
    { label: 'Overflow: shrink', input: { direction: 'row', justify: 'flex-start', align: 'stretch', main: 300, cross: 100, gap: 0, items: [{ basis: 200, grow: 0, shrink: 1 }, { basis: 100, grow: 0, shrink: 1 }, { basis: 100, grow: 0, shrink: 3 }] } },
    { label: 'space-between, row-reverse', input: { direction: 'row-reverse', justify: 'space-between', align: 'flex-end', main: 420, cross: 120, gap: 0, items: [{ basis: 70, grow: 0, shrink: 1, cross: 40 }, { basis: 70, grow: 0, shrink: 1, cross: 60 }, { basis: 70, grow: 0, shrink: 1, cross: 80 }] } },
    { label: 'Column', input: { direction: 'column', justify: 'space-evenly', align: 'flex-start', main: 260, cross: 200, gap: 6, items: [{ basis: 40, grow: 0, shrink: 1, cross: 80 }, { basis: 40, grow: 0, shrink: 1, cross: 120 }, { basis: 40, grow: 0, shrink: 1, cross: 100 }] } },
  ],
  run(input) {
    const r = new Recorder(code);
    const items = parseItems(input.items);
    const cfg: FlexCfg = { direction: input.direction, justify: input.justify, align: input.align, main: input.main, cross: input.cross, gap: input.gap, items };
    if (!(cfg.main > 0) || !(cfg.cross > 0) || cfg.gap < 0) throw new Error('Container sizes must be positive and gap must be >= 0');
    const n = items.length;
    const row = cfg.direction.startsWith('row');
    const rev = cfg.direction.endsWith('reverse');
    const solved = flexSolve(cfg);
    const W = row ? cfg.main : cfg.cross;
    const H = row ? cfg.cross : cfg.main;

    const orient = (mp: number, size: number, cp: number, cs: number): Rect => {
      const m = rev ? cfg.main - mp - size : mp;
      return row ? { x: m, y: cp, w: size, h: cs } : { x: cp, y: m, w: cs, h: size };
    };
    // stacked-from-start positions for a given set of sizes (before justify-content)
    const stack = (sizes: number[]) => {
      let cur = 0;
      return sizes.map((s) => {
        const p = cur;
        cur += s + cfg.gap;
        return p;
      });
    };
    const basis = items.map((i) => i.basis);
    const basisPos = stack(basis);
    const basisEnd = basis.reduce((a, b) => a + b, 0) + (n - 1) * cfg.gap;
    // bounds so overflowing items stay visible
    const all: Rect[] = [{ x: 0, y: 0, w: W, h: H }, ...solved.rects, ...basis.map((b, i) => orient(basisPos[i], b, 0, AUTO_CROSS))];
    const minX = Math.min(...all.map((q) => q.x));
    const maxX = Math.max(...all.map((q) => q.x + q.w));
    const minY = Math.min(...all.map((q) => q.y));
    const maxY = Math.max(...all.map((q) => q.y + q.h));
    const sc = Math.min(2, 520 / Math.max(1, maxX - minX), 250 / Math.max(1, maxY - minY));
    const place = (id: string, label: string, q: Rect, tone: Tone, extra: Partial<GraphNode> = {}) => rectNode(id, label, (q.x - minX) * sc, (q.y - minY) * sc, q.w * sc, q.h * sc, tone, extra);

    const panel = (sizes: number[], mainPos: number[], crossPos: number[], crossSize: number[], tones: Tone[], extra: GraphNode[] = [], title = 'Flex container'): GraphPanel => {
      const nodes: GraphNode[] = [place('container', '', { x: 0, y: 0, w: W, h: H }, 'muted', { tags: [`${cfg.direction} - main axis ${row ? 'horizontal' : 'vertical'}`] }), ...extra];
      sizes.forEach((s, i) => nodes.push(place(`item${i}`, String(i + 1), orient(mainPos[i], s, crossPos[i], crossSize[i]), tones[i] ?? 'default', { sub: `${fmtN(s)}px` })));
      return { type: 'graph', title, nodes, edges: [], width: Math.round((maxX - minX) * sc), height: Math.round((maxY - minY) * sc) };
    };
    const zero = items.map(() => 0);
    const auto = items.map((it) => it.cross ?? AUTO_CROSS);
    const same = (t: Tone) => items.map(() => t);

    // 1. free space
    const free = solved.free;
    const freeNode: GraphNode[] = [];
    if (free > 0) freeNode.push(place('free', `free ${fmtN(free)}`, orient(basisEnd, free, 0, AUTO_CROSS), 'frontier'));
    else if (free < 0) freeNode.push(place('free', `overflow ${fmtN(-free)}`, orient(cfg.main - 0, -free, 0, AUTO_CROSS), 'error'));
    const baseGaps = (n - 1) * cfg.gap;
    r.step(
      'free',
      `free space = ${cfg.main} - ${baseGaps} gaps - ${basis.reduce((a, b) => a + b, 0)} basis = ${fmtN(cfg.main - baseGaps - basis.reduce((a, b) => a + b, 0))}px`,
      [panel(basis, basisPos, zero, auto, same('default'), free < 0 ? [] : freeNode, 'Items at their flex-basis'), { type: 'kv', entries: [{ k: 'container (main)', v: cfg.main }, { k: 'gap', v: cfg.gap }, { k: 'free space', v: r3(cfg.main - baseGaps - basis.reduce((a, b) => a + b, 0)), tone: free < 0 ? 'error' : 'frontier' }] }],
      { free: r3(free) },
    );
    r.op();
    // 2. grow / shrink, one item at a time
    const sizes = [...basis];
    const growSum = items.reduce((a, i) => a + i.grow, 0);
    const weights = items.map((i) => i.basis * i.shrink);
    const wSum = weights.reduce((a, b) => a + b, 0);
    if (solved.mode === 'grow') {
      for (let i = 0; i < n; i++) {
        const add = (solved.free * items[i].grow) / growSum;
        sizes[i] = items[i].basis + add;
        r.op();
        r.step('grow', `Item ${i + 1} grows: ${items[i].basis} + ${fmtN(solved.free)} x ${items[i].grow}/${growSum} = ${fmtN(sizes[i])}px`, [panel(sizes, stack(sizes), zero, auto, items.map((_, k) => (k === i ? 'active' : k < i ? 'done' : 'default')))], { free: r3(free), growSum, [`size${i + 1}`]: r3(sizes[i]) });
      }
    } else if (solved.mode === 'shrink') {
      for (let i = 0; i < n; i++) {
        sizes[i] = solved.sizes[i];
        r.op();
        r.step('shrink', `Item ${i + 1} shrinks by weight ${fmtN(weights[i])}/${fmtN(wSum)}: ${items[i].basis} -> ${fmtN(sizes[i])}px`, [panel(sizes, stack(sizes), zero, auto, items.map((_, k) => (k === i ? 'swap' : k < i ? 'done' : 'default')))], { free: r3(free), weightSum: r3(wSum), [`size${i + 1}`]: r3(sizes[i]) });
      }
    } else {
      r.step(free > 0 ? 'grow' : 'shrink', free === 0 ? 'No free space: every item keeps its flex-basis' : free > 0 ? 'Free space left, but every flex-grow is 0: sizes stay at basis' : 'Overflow, but every shrink x basis is 0: items overflow', [panel(sizes, stack(sizes), zero, auto, same('default'))], { free: r3(free) });
    }
    // 3. leftover
    r.step('rem', `After sizing, ${fmtN(solved.rem)}px of the main axis is left for justify-content`, [panel(solved.sizes, stack(solved.sizes), zero, auto, same('done'), [], 'Sizes resolved'), { type: 'kv', entries: [{ k: 'leftover', v: r3(solved.rem), tone: solved.rem < 0 ? 'error' : 'frontier' }] }], { rem: r3(solved.rem) });
    // 4. justify
    r.step(
      'justify',
      solved.rem < 0 && (cfg.justify === 'space-between' || cfg.justify === 'space-around' || cfg.justify === 'space-evenly') ? `${cfg.justify} falls back when there is no room: leftover is negative` : `${cfg.justify}: start offset ${fmtN(solved.offset)}px, extra between items ${fmtN(solved.between)}px`,
      [panel(solved.sizes, solved.mainPos, zero, auto, same('compare'), [], 'Positioned along the main axis')],
      { offset: r3(solved.offset), between: r3(solved.between) },
    );
    // 5. align
    r.step('align', `align-items: ${cfg.align} places each item on the cross axis`, [panel(solved.sizes, solved.mainPos, solved.crossPos, solved.crossSize, same('swap'), [], 'Positioned along the cross axis')], { align: cfg.align });
    // 6. direction
    r.step('reverse', rev ? `${cfg.direction}: the main axis is mirrored, so the first item sits at the far end` : `${cfg.direction}: the main axis runs ${row ? 'left to right' : 'top to bottom'}; final layout`, [panel(solved.sizes, solved.mainPos, solved.crossPos, solved.crossSize, same('found'), [], 'Final layout'), { type: 'log', lines: solved.rects.map((q, i) => ({ text: `item ${i + 1}: x=${fmtN(q.x)} y=${fmtN(q.y)} w=${fmtN(q.w)} h=${fmtN(q.h)}` })) }], { items: n });
    return { frames: r.frames, result: solved.rects.map((q) => ({ x: r3(q.x), y: r3(q.y), w: r3(q.w), h: r3(q.h) })) };
  },
  reference(i) {
    const items = parseItems(i.items);
    const n = items.length;
    const gaps = (n - 1) * i.gap;
    const basis = items.map((x) => x.basis);
    const free = i.main - gaps - basis.reduce((a, b) => a + b, 0);
    const gsum = items.reduce((a, x) => a + x.grow, 0);
    const wts = items.map((x) => x.basis * x.shrink);
    const wsum = wts.reduce((a, b) => a + b, 0);
    const size = basis.map((b, k) => {
      if (free > 0 && gsum > 0) return b + (free * items[k].grow) / gsum;
      if (free < 0 && wsum > 0) return Math.max(0, b + (free * wts[k]) / wsum);
      return b;
    });
    const rem = i.main - gaps - size.reduce((a, b) => a + b, 0);
    // spacing slots: before first item, between items, after last item
    let j = i.justify;
    if (rem < 0) j = j === 'space-between' ? 'flex-start' : j === 'space-around' || j === 'space-evenly' ? 'center' : j;
    const slots = new Array<number>(n + 1).fill(0);
    if (j === 'flex-start') slots[n] = rem;
    else if (j === 'flex-end') slots[0] = rem;
    else if (j === 'center') slots[0] = slots[n] = rem / 2;
    else if (j === 'space-between') {
      if (n > 1) for (let k = 1; k < n; k++) slots[k] = rem / (n - 1);
      else slots[n] = rem;
    } else if (j === 'space-around') {
      for (let k = 0; k <= n; k++) slots[k] = k === 0 || k === n ? rem / (2 * n) : rem / n;
    } else for (let k = 0; k <= n; k++) slots[k] = rem / (n + 1);
    const out = [];
    for (let k = 0; k < n; k++) {
      let start = k * i.gap;
      for (let q = 0; q <= k; q++) start += slots[q];
      for (let q = 0; q < k; q++) start += size[q];
      const m = i.direction.endsWith('reverse') ? i.main - start - size[k] : start;
      const cs = items[k].cross ?? (i.align === 'stretch' ? i.cross : AUTO_CROSS);
      const cp = i.align === 'flex-end' ? i.cross - cs : i.align === 'center' ? (i.cross - cs) / 2 : 0;
      const rect = i.direction.startsWith('row') ? { x: m, y: cp, w: size[k], h: cs } : { x: cp, y: m, w: cs, h: size[k] };
      out.push({ x: r3(rect.x), y: r3(rect.y), w: r3(rect.w), h: r3(rect.h) });
    }
    return out;
  },
};

const unit: Unit = {
  id: 'css-flexbox',
  hook: 'Flexbox questions are never about memorising property names. They ask "where does the leftover space go?" Knowing the grow, shrink, then justify order lets you predict any row.',
  predict: {
    prompt: 'A 600px row has three items. Their `flex-basis` and `flex-grow` are A: 100px / 1, B: 200px / 1, C: 100px / 2. How wide does B end up?',
    options: ['200px', '250px', '266.7px', '300px'],
    answer: 1,
    explain: 'Free space = 600 - 400 = 200px, split 1 : 1 : 2 (4 parts of 50px). B gets 200 + 50 = 250px. Grow shares only the leftover, so the starting sizes still matter.',
  },
  viz,
  simulationNote: 'A simplified single-line flexbox: no wrapping, no min-content clamping, no percentages. It follows the real order: resolve flex-basis, distribute free space, then justify-content and align-items.',
  deeper: {
    points: [
      '`flex: 1` means `1 1 0%`: basis 0, so the whole container is free space and items split it by grow factor. `flex: auto` keeps the content size as the starting point.',
      'Positive free space is shared by `flex-grow`. Negative free space is taken back by `flex-shrink`, weighted by shrink x basis, so bigger items give up more pixels.',
      '`justify-content` works on the main axis AFTER sizing; if any item grew, no leftover remains and justify-content does nothing.',
      '`align-items` works on the cross axis per line. `stretch` only applies when the item cross size is `auto`.',
      '`row-reverse` flips the main axis, so `flex-start` is the right edge. `gap` is applied between items before justify-content spreads the rest.',
    ],
    pitfalls: ['Expecting `flex-grow` to make equal widths: it shares leftover space, so different bases stay different', 'Letting `min-width: auto` block shrinking of long text items (add `min-width: 0`)', 'Using `justify-content` on the cross axis (that is `align-items` / `align-content`)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'distributeGrow',
    statement: 'Given each item flex-basis, its flex-grow factor and the container size along the main axis (no gaps), return the final item sizes. Leftover space is shared in proportion to grow. Grow never shrinks an item.',
    signature: 'function distributeGrow(basis, grow, container) {',
    solution: `function distributeGrow(basis, grow, container) {
  const free = @@container - basis.reduce((a, b) => a + b, 0)@@;
  const total = @@grow.reduce((a, b) => a + b, 0)@@;
  if (@@free <= 0 || total === 0@@) return basis.slice();
  return basis.map((b, i) => @@b + (free * grow[i]) / total@@);
}`,
    compare: 'float',
    tests: [
      { args: [[100, 100, 100], [1, 1, 1], 600], expected: [200, 200, 200], name: 'equal grow' },
      { args: [[80, 120, 80], [1, 0, 2], 400], expected: [120, 120, 160], name: 'mixed grow' },
      { args: [[100, 100], [0, 0], 500], expected: [100, 100], name: 'no grow factors' },
      { args: [[200, 200], [1, 1], 300], expected: [200, 200], name: 'no free space: grow cannot shrink' },
      { args: [[50, 50], [1, 3], 250], expected: [87.5, 162.5], name: 'weighted 1:3' },
      { args: [[0, 0], [1, 1], 100], expected: [50, 50], name: 'flex: 1 (basis 0)' },
      { args: [[100], [2], 160], expected: [160], name: 'single item' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'distributeGrow',
    statement: 'When the items already overflow the container, they get even narrower after "growing". Find the bug.',
    buggy: `function distributeGrow(basis, grow, container) {
  const free = container - basis.reduce((a, b) => a + b, 0);
  const total = grow.reduce((a, b) => a + b, 0);
  if (total === 0) return basis.slice();
  return basis.map((b, i) => b + (free * grow[i]) / total);
}`,
    fixed: `function distributeGrow(basis, grow, container) {
  const free = container - basis.reduce((a, b) => a + b, 0);
  const total = grow.reduce((a, b) => a + b, 0);
  if (free <= 0 || total === 0) return basis.slice();
  return basis.map((b, i) => b + (free * grow[i]) / total);
}`,
    compare: 'float',
    tests: [
      { args: [[100, 100, 100], [1, 1, 1], 600], expected: [200, 200, 200] },
      { args: [[80, 120, 80], [1, 0, 2], 400], expected: [120, 120, 160] },
      { args: [[100, 100], [0, 0], 500], expected: [100, 100] },
      { args: [[200, 200], [1, 1], 300], expected: [200, 200], name: 'overflowing items' },
      { args: [[50, 50], [1, 3], 250], expected: [87.5, 162.5] },
    ],
    bugType: 'negative free space',
    hint: 'What is the sign of `free` when the items are wider than the container?',
    explanation: 'With negative free space the formula b + free * grow / total subtracts pixels, so flex-grow behaves like a second flex-shrink. Growing only happens when free space is positive; shrinking is a separate rule with its own factor.',
  },
  boss: {
    title: 'One-line row layout',
    language: 'javascript',
    fnName: 'layoutRow',
    statement:
      'Implement a one-row flex layout. items are {basis, grow, shrink}. Resolve sizes: positive free space (container - gaps - sum of bases) is shared by grow; negative free space is taken back in proportion to shrink x basis (never below 0). Then apply justify-content (flex-start, flex-end, center, space-between, space-around, space-evenly) to the leftover; if the leftover is negative, space-between acts like flex-start and space-around / space-evenly act like center. Return [{x, w}] per item.',
    starter: `function layoutRow(container, gap, justify, items) {
  // your code here
}
`,
    solution: `function layoutRow(container, gap, justify, items) {
  const n = items.length;
  const gaps = (n - 1) * gap;
  const free = container - gaps - items.reduce((a, it) => a + it.basis, 0);
  const growSum = items.reduce((a, it) => a + it.grow, 0);
  const weights = items.map((it) => it.basis * it.shrink);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const sizes = items.map((it, i) => {
    if (free > 0 && growSum > 0) return it.basis + (free * it.grow) / growSum;
    if (free < 0 && weightSum > 0) return Math.max(0, it.basis + (free * weights[i]) / weightSum);
    return it.basis;
  });
  const rem = container - gaps - sizes.reduce((a, b) => a + b, 0);
  let mode = justify;
  if (rem < 0) {
    if (mode === 'space-between') mode = 'flex-start';
    else if (mode === 'space-around' || mode === 'space-evenly') mode = 'center';
  }
  let offset = 0;
  let between = 0;
  if (mode === 'flex-end') offset = rem;
  else if (mode === 'center') offset = rem / 2;
  else if (mode === 'space-between') between = n > 1 ? rem / (n - 1) : 0;
  else if (mode === 'space-around') {
    between = rem / n;
    offset = between / 2;
  } else if (mode === 'space-evenly') {
    between = rem / (n + 1);
    offset = between;
  }
  let x = offset;
  return sizes.map((w) => {
    const out = { x, w };
    x += w + gap + between;
    return out;
  });
}`,
    compare: 'float',
    tests: [
      { args: [400, 0, 'flex-start', [{ basis: 80, grow: 0, shrink: 1 }, { basis: 120, grow: 0, shrink: 1 }]], expected: [{ x: 0, w: 80 }, { x: 80, w: 120 }], name: 'flex-start' },
      { args: [400, 0, 'flex-end', [{ basis: 80, grow: 0, shrink: 1 }, { basis: 120, grow: 0, shrink: 1 }]], expected: [{ x: 200, w: 80 }, { x: 280, w: 120 }], name: 'flex-end' },
      { args: [400, 0, 'center', [{ basis: 80, grow: 0, shrink: 1 }, { basis: 120, grow: 0, shrink: 1 }]], expected: [{ x: 100, w: 80 }, { x: 180, w: 120 }], name: 'center' },
      { args: [350, 0, 'space-between', [{ basis: 50, grow: 0, shrink: 1 }, { basis: 50, grow: 0, shrink: 1 }, { basis: 50, grow: 0, shrink: 1 }]], expected: [{ x: 0, w: 50 }, { x: 150, w: 50 }, { x: 300, w: 50 }], name: 'space-between' },
      { args: [400, 0, 'space-around', [{ basis: 100, grow: 0, shrink: 1 }, { basis: 100, grow: 0, shrink: 1 }]], expected: [{ x: 50, w: 100 }, { x: 250, w: 100 }], name: 'space-around' },
      { args: [400, 0, 'space-evenly', [{ basis: 100, grow: 0, shrink: 1 }, { basis: 100, grow: 0, shrink: 1 }]], expected: [{ x: 200 / 3, w: 100 }, { x: 200 / 3 + 100 + 200 / 3, w: 100 }], name: 'space-evenly' },
      { args: [500, 20, 'flex-start', [{ basis: 100, grow: 1, shrink: 1 }, { basis: 100, grow: 3, shrink: 1 }]], expected: [{ x: 0, w: 170 }, { x: 190, w: 310 }], name: 'grow with a gap' },
      { args: [200, 0, 'flex-start', [{ basis: 300, grow: 0, shrink: 1 }, { basis: 100, grow: 0, shrink: 1 }]], expected: [{ x: 0, w: 150 }, { x: 150, w: 50 }], name: 'shrink weighted by basis' },
      { args: [300, 0, 'space-between', [{ basis: 200, grow: 0, shrink: 0 }, { basis: 200, grow: 0, shrink: 0 }]], expected: [{ x: 0, w: 200 }, { x: 200, w: 200 }], name: 'overflow disables space-between' },
    ],
    hints: ['Do it in two passes: first resolve every item size (grow or shrink), then compute the leftover and turn justify-content into an offset plus extra space between items.', 'The shrink weight is basis x shrink, not just shrink. For space-around, between = leftover / n and the start offset is half of it.'],
    combines: ['css-box-model'],
  },
  quiz: [
    {
      prompt: 'Which shorthand makes three items share a row equally regardless of their content width?',
      options: ['`flex: 1`', '`flex: auto`', '`flex: none`', '`flex-grow: 1` only'],
      answer: 0,
      explain: '`flex: 1` is `1 1 0%`: every item starts from zero so the whole container is shared equally. `flex-grow: 1` alone keeps `flex-basis: auto`, so content widths still differ.',
    },
  ],
};

export default unit;
