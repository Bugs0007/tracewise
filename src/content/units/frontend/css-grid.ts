import { Recorder } from '@/engine/recorder';
import type { GraphNode, GraphPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { parseTrackList, placeGridItems, r3, rectNode, solveTracks, type GridItemIn } from '@/content/lib/frontend-css-web';

const code = `
function gridTracks(tracks, container, gap) {
  const fixed = sum(px tracks) + sum(% tracks of container);        //@fixed
  const gaps = (tracks.length - 1) * gap;                            //@gaps
  const free = Math.max(0, container - fixed - gaps);                //@free
  const frTotal = sum(fr factors);                                   //@frTotal
  const frUnit = free / Math.max(1, frTotal);                        //@frUnit
  return tracks.map((t) => px(t) ? t.value : t.value * frUnit);      //@sizes
}

// auto-placement: items fill rows left to right
if (explicit column < cursor) row++; else if (cursor + span > columns) row++;  //@place
x = start of the first track; width = spanned tracks + gaps between   //@span
`;

interface In {
  columns: string;
  container: number;
  gap: number;
  items: GridItemIn[];
}

const ROW_H = 40;

function parseGridItems(raw: unknown): GridItemIn[] {
  if (!Array.isArray(raw)) throw new Error('items must be a JSON array like [{"span":2},{"col":2}]');
  if (raw.length > 12) throw new Error('Use at most 12 items');
  return raw.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const out: GridItemIn = {};
    for (const k of ['span', 'col'] as const) {
      if (o[k] === undefined) continue;
      const v = Number(o[k]);
      if (!Number.isInteger(v) || v < 1) throw new Error(`item ${i + 1}: "${k}" must be a whole number >= 1`);
      out[k] = v;
    }
    return out;
  });
}

const f1 = (n: number) => String(Math.round(n * 10) / 10);

const viz: VizDef<In> = {
  id: 'css-grid',
  title: 'CSS Grid: track sizing and item placement',
  code,
  language: 'javascript',
  inputs: [
    { key: 'columns', label: 'grid-template-columns', kind: 'string', default: '100px 1fr 2fr', maxItems: 60, help: 'px, fr, % and repeat(n, ...)' },
    { key: 'container', label: 'Container width (px)', kind: 'number', default: 500 },
    { key: 'gap', label: 'gap (px)', kind: 'number', default: 10 },
    { key: 'items', label: 'Items (span / explicit start column)', kind: 'json', default: [{ span: 2 }, { span: 1 }, { span: 1 }, { col: 2 }, { span: 3 }], help: 'JSON array such as [{"span":2},{"col":3}]' },
  ],
  presets: [
    { label: '100px 1fr 2fr', input: { columns: '100px 1fr 2fr', container: 500, gap: 10, items: [{ span: 2 }, { span: 1 }, { span: 1 }, { col: 2 }, { span: 3 }] } },
    { label: 'repeat(3, 1fr)', input: { columns: 'repeat(3, 1fr)', container: 320, gap: 10, items: [{}, {}, {}, {}, { span: 2 }] } },
    { label: 'Fixed tracks leave no fr space', input: { columns: '300px 1fr 1fr', container: 320, gap: 10, items: [{}, {}, {}] } },
    { label: '0.5fr sums below 1', input: { columns: '0.5fr 100px', container: 400, gap: 0, items: [{}, {}] } },
    { label: 'Percent + fr', input: { columns: '25% 1fr 1fr', container: 400, gap: 20, items: [{ span: 3 }, { col: 3 }, { col: 1 }] } },
  ],
  run(input) {
    const r = new Recorder(code);
    const tracks = parseTrackList(input.columns);
    const items = parseGridItems(input.items);
    if (!(input.container > 0) || input.gap < 0) throw new Error('Container width must be positive and gap >= 0');
    const n = tracks.length;
    const s = solveTracks(tracks, input.container, input.gap);
    const place = placeGridItems(items, n);
    const rows = place.length ? Math.max(...place.map((p) => p.row)) + 1 : 1;
    const starts: number[] = [];
    let cur = 0;
    s.sizes.forEach((w) => {
      starts.push(cur);
      cur += w + input.gap;
    });
    const total = cur - input.gap;
    const W = Math.max(input.container, total);
    const sc = Math.min(1.5, 520 / Math.max(W, 1));
    const bandH = rows * ROW_H + (rows - 1) * Math.min(input.gap, 24);
    const rowGap = Math.min(input.gap, 24);
    const height = bandH + 30;

    const panel = (resolved: number, placed: number, active: number | null, title: string): GraphPanel => {
      const nodes: GraphNode[] = [rectNode('container', '', 0, 0, input.container * sc, bandH + 8, 'muted', { tags: [`container ${input.container}px`] })];
      for (let t = 0; t < resolved; t++) nodes.push(rectNode(`t${t}`, tracks[t].raw, starts[t] * sc, 4, s.sizes[t] * sc, bandH, tracks[t].kind === 'fr' ? 'frontier' : 'compare', { sub: `${f1(s.sizes[t])}px`, badge: `col ${t + 1}` }));
      for (let k = 0; k < placed; k++) {
        const p = place[k];
        const w = s.sizes.slice(p.col, p.col + p.span).reduce((a, b) => a + b, 0) + (p.span - 1) * input.gap;
        nodes.push(rectNode(`i${k}`, String(k + 1), starts[p.col] * sc + 3, 4 + p.row * (ROW_H + rowGap) + 3, w * sc - 6, ROW_H - 6, active === k ? 'active' : 'done'));
      }
      return { type: 'graph', title, nodes, edges: [], width: Math.round(W * sc), height: Math.round(height) };
    };
    const tokens = { type: 'grid' as const, cells: [tracks.map((t) => t.raw)], tones: Object.fromEntries(tracks.map((t, i) => [`0,${i}`, (t.kind === 'fr' ? 'frontier' : 'compare') as Tone])), colLabels: tracks.map((_, i) => `col ${i + 1}`), title: 'grid-template-columns' };

    r.step('fixed', `Fixed tracks (px and %) take ${f1(s.fixed)}px before any fr is considered`, [tokens, { type: 'kv', entries: [{ k: 'fixed px / %', v: r3(s.fixed), tone: 'compare' }] }], { fixed: r3(s.fixed) });
    r.op();
    r.step('gaps', `${n - 1} gap${n === 2 ? '' : 's'} x ${input.gap}px = ${f1(s.gaps)}px reserved between tracks`, [tokens, { type: 'kv', entries: [{ k: 'fixed', v: r3(s.fixed) }, { k: 'gaps', v: r3(s.gaps), tone: 'compare' }] }], { gaps: r3(s.gaps) });
    r.step('free', `free = ${input.container} - ${f1(s.fixed)} - ${f1(s.gaps)} = ${f1(s.free)}px for fr tracks` + (input.container - s.fixed - s.gaps < 0 ? ' (negative: clamped to 0)' : ''), [tokens, { type: 'kv', entries: [{ k: 'free space', v: r3(s.free), tone: 'frontier' }] }], { free: r3(s.free) });
    r.step('frTotal', `fr factors add up to ${s.frSum}${s.frSum < 1 && s.frSum > 0 ? ' (below 1, so 1 is used)' : ''}`, [tokens, { type: 'kv', entries: [{ k: 'sum of fr', v: s.frSum }] }], { frTotal: s.frSum });
    r.step('frUnit', `1fr = ${f1(s.free)} / max(1, ${s.frSum}) = ${f1(s.frUnit)}px`, [tokens, { type: 'kv', entries: [{ k: '1fr', v: r3(s.frUnit), tone: 'frontier' }] }], { frUnit: r3(s.frUnit) });
    for (let t = 0; t < n; t++) {
      r.op();
      const tk = tracks[t];
      const how = tk.kind === 'px' ? `${tk.raw} is fixed` : tk.kind === 'pct' ? `${tk.raw} of ${input.container}px` : `${tk.value} x ${f1(s.frUnit)}px`;
      r.step('sizes', `Track ${t + 1}: ${how} = ${f1(s.sizes[t])}px`, [panel(t + 1, 0, null, 'Tracks sized')], { track: t + 1, size: r3(s.sizes[t]) });
    }
    items.forEach((it, k) => {
      const p = place[k];
      const why = it.col !== undefined ? `explicit column ${it.col}` : 'next free cell';
      r.op();
      r.step('place', `Item ${k + 1} (${why}${p.span > 1 ? `, span ${p.span}` : ''}) lands in row ${p.row + 1}, column ${p.col + 1}`, [panel(n, k + 1, k, 'Auto-placement')], { item: k + 1, row: p.row + 1, col: p.col + 1 });
    });
    const finalW = (p: { col: number; span: number }) => s.sizes.slice(p.col, p.col + p.span).reduce((a, b) => a + b, 0) + (p.span - 1) * input.gap;
    r.step('span', items.length ? `Spanning items add the spanned tracks plus the gaps between them` : 'No items to place: the tracks alone define the grid', [panel(n, items.length, null, 'Final grid'), { type: 'log', lines: place.map((p, k) => ({ text: `item ${k + 1}: row ${p.row + 1}, x=${f1(starts[p.col])}, width=${f1(finalW(p))}` })) }], { items: items.length });
    return { frames: r.frames, result: { tracks: s.sizes.map(r3), items: place.map((p) => ({ row: p.row, col: p.col, x: r3(starts[p.col]), w: r3(finalW(p)) })) } };
  },
  reference(i) {
    const toks = i.columns.replace(/repeat\(\s*(\d+)\s*,\s*([^)]*)\)/g, (_m, c: string, b: string) => Array(Number(c)).fill(b).join(' ')).trim().split(/\s+/);
    const n = toks.length;
    const val = (t: string) => parseFloat(t);
    const fixed = toks.reduce((a, t) => a + (t.endsWith('px') ? val(t) : t.endsWith('%') ? (val(t) * i.container) / 100 : 0), 0);
    const free = Math.max(0, i.container - fixed - (n - 1) * i.gap);
    const frs = toks.reduce((a, t) => a + (t.endsWith('fr') ? val(t) : 0), 0);
    const one = free / (frs < 1 ? 1 : frs);
    const sizes = toks.map((t) => (t.endsWith('fr') ? val(t) * one : t.endsWith('%') ? (val(t) * i.container) / 100 : val(t)));
    const items = parseGridItems(i.items);
    const out: { row: number; col: number; x: number; w: number }[] = [];
    let row = 0;
    let used = 0;
    for (const it of items) {
      const span = Math.min(it.span ?? 1, n);
      let col = used;
      if (it.col !== undefined) {
        col = Math.min(it.col - 1, n - span);
        if (col < used) row++;
      } else if (used + span > n) {
        row++;
        col = 0;
      }
      used = col + span;
      let x = 0;
      for (let q = 0; q < col; q++) x += sizes[q] + i.gap;
      let w = (span - 1) * i.gap;
      for (let q = col; q < col + span; q++) w += sizes[q];
      out.push({ row, col, x: r3(x), w: r3(w) });
    }
    return { tracks: sizes.map(r3), items: out };
  },
};

const trackTests = [
  { args: [['100px', '1fr', '2fr'], 500, 10], expected: [100, 380 / 3, 760 / 3], name: 'px + 1fr + 2fr with gaps' },
  { args: [['1fr', '1fr', '1fr'], 300, 0], expected: [100, 100, 100], name: 'equal fr' },
  { args: [['200px', '200px'], 500, 0], expected: [200, 200], name: 'only px: no stretching' },
  { args: [['0.5fr', '100px'], 300, 0], expected: [100, 100], name: 'fr sum below 1 uses 1' },
  { args: [['1fr', '1fr'], 100, 20], expected: [40, 40], name: 'gap is subtracted' },
  { args: [['300px', '1fr'], 200, 10], expected: [300, 0], name: 'overflow: fr gets 0' },
  { args: [['1fr'], 250, 10], expected: [250], name: 'single track, no gaps' },
];

const unit: Unit = {
  id: 'css-grid',
  hook: 'Grid is where interviewers check whether you know that `fr` divides what is LEFT after fixed tracks and gaps. Predicting the exact column widths shows you understand the track-sizing algorithm.',
  predict: {
    prompt: 'A 500px grid has `grid-template-columns: 100px 1fr 2fr; gap: 10px`. How wide is the `2fr` column?',
    options: ['250px', '253.3px', '266.7px', '300px'],
    answer: 1,
    explain: 'Fixed track 100px and two 10px gaps leave 500 - 100 - 20 = 380px. One fr is 380 / 3 = 126.7px, so 2fr is 253.3px. Ignoring the gaps gives 266.7px, a common slip.',
  },
  viz,
  simulationNote: 'A simplified track sizer: px, %, fr and repeat(n, ...) with auto-placement. It ignores auto/min-content/minmax() tracks and dense packing.',
  deeper: {
    points: [
      'Track sizing order: fixed lengths and percentages first, then gaps, then fr tracks share what remains (1fr = free space / total fr, at least 1).',
      '`fr` is a share of FREE space, so `1fr` next to a wide image track gets less than the same `1fr` elsewhere. `minmax(0, 1fr)` stops long content from forcing a track wider.',
      'A fr sum below 1 does not fill the space: `0.5fr` takes half of the free space and the rest stays empty.',
      'Auto-placement walks a cursor across the row; an item that does not fit, or an explicit column to the left of the cursor, starts a new row.',
      'A spanning item is as wide as the tracks it covers PLUS the gaps between them.',
    ],
    pitfalls: ['Forgetting that gaps come out of the free space before fr is divided', 'Using `1fr` when you want equal columns regardless of content (use `minmax(0, 1fr)`)', 'Mixing `%` tracks with `gap` and being surprised by overflow'],
  },
  practice: {
    language: 'javascript',
    fnName: 'trackSizes',
    statement: 'Given grid-template-columns tracks like ["100px","1fr","2fr"], the container width and the gap, return each track width. fr tracks share the free space after px tracks and gaps; if the fr factors sum to less than 1, treat the sum as 1; free space never goes below 0.',
    signature: 'function trackSizes(columns, container, gap) {',
    solution: `function trackSizes(columns, container, gap) {
  const px = columns.map((c) => (c.endsWith('px') ? parseFloat(c) : 0));
  const fr = columns.map((c) => (c.endsWith('fr') ? parseFloat(c) : 0));
  const free = Math.max(0, container - @@px.reduce((a, b) => a + b, 0)@@ - @@(columns.length - 1) * gap@@);
  const unit = free / @@Math.max(1, fr.reduce((a, b) => a + b, 0))@@;
  return columns.map((c, i) => @@c.endsWith('fr') ? fr[i] * unit : px[i]@@);
}`,
    compare: 'float',
    tests: trackTests,
  },
  debug: {
    language: 'javascript',
    fnName: 'trackSizes',
    statement: 'The fr columns in this helper add up to more than the container (the grid overflows by the total gap). Fix it.',
    buggy: `function trackSizes(columns, container, gap) {
  const px = columns.map((c) => (c.endsWith('px') ? parseFloat(c) : 0));
  const fr = columns.map((c) => (c.endsWith('fr') ? parseFloat(c) : 0));
  const free = Math.max(0, container - px.reduce((a, b) => a + b, 0));
  const unit = free / Math.max(1, fr.reduce((a, b) => a + b, 0));
  return columns.map((c, i) => (c.endsWith('fr') ? fr[i] * unit : px[i]));
}`,
    fixed: `function trackSizes(columns, container, gap) {
  const px = columns.map((c) => (c.endsWith('px') ? parseFloat(c) : 0));
  const fr = columns.map((c) => (c.endsWith('fr') ? parseFloat(c) : 0));
  const free = Math.max(0, container - px.reduce((a, b) => a + b, 0) - (columns.length - 1) * gap);
  const unit = free / Math.max(1, fr.reduce((a, b) => a + b, 0));
  return columns.map((c, i) => (c.endsWith('fr') ? fr[i] * unit : px[i]));
}`,
    compare: 'float',
    tests: trackTests,
    bugType: 'ignored gaps',
    hint: 'Add up the tracks and the gaps: what must they equal?',
    explanation: 'The gap between tracks is taken from the container before fr is divided. Without subtracting (columns - 1) x gap, the fr tracks claim space that the gaps need, and the grid is wider than its container.',
  },
  boss: {
    title: 'Place items on a grid',
    language: 'javascript',
    fnName: 'placeItems',
    statement:
      'Combine track sizing and auto-placement. Tracks are strings like "100px" or "1fr" (fr share the free space after px and gaps). Items are {span?, col?} where col is an explicit 1-based start column. A cursor moves left to right: an auto item that does not fit in the rest of the row starts a new row; an item with an explicit col that lies left of the cursor also starts a new row. Spans are capped at the number of columns. Return [{row, x, w}] (row is 0-based; w includes the gaps inside a span).',
    starter: `function placeItems(columns, container, gap, items) {
  // your code here
}
`,
    solution: `function placeItems(columns, container, gap, items) {
  const n = columns.length;
  const px = columns.map((c) => (c.endsWith('px') ? parseFloat(c) : 0));
  const fr = columns.map((c) => (c.endsWith('fr') ? parseFloat(c) : 0));
  const free = Math.max(0, container - px.reduce((a, b) => a + b, 0) - (n - 1) * gap);
  const unit = free / Math.max(1, fr.reduce((a, b) => a + b, 0));
  const sizes = columns.map((c, i) => (c.endsWith('fr') ? fr[i] * unit : px[i]));
  const starts = [];
  let x = 0;
  for (const s of sizes) {
    starts.push(x);
    x += s + gap;
  }
  let row = 0;
  let cursor = 0;
  return items.map((it) => {
    const span = Math.min(it.span || 1, n);
    let col;
    if (it.col) {
      col = Math.min(it.col - 1, n - span);
      if (col < cursor) row++;
    } else {
      if (cursor + span > n) {
        row++;
        cursor = 0;
      }
      col = cursor;
    }
    cursor = col + span;
    const w = sizes.slice(col, col + span).reduce((a, b) => a + b, 0) + (span - 1) * gap;
    return { row, x: starts[col], w };
  });
}`,
    compare: 'float',
    tests: [
      {
        args: [['100px', '1fr', '2fr'], 500, 10, [{ span: 2 }, { span: 1 }, { span: 1 }]],
        expected: [
          { row: 0, x: 0, w: 100 + 380 / 3 + 10 },
          { row: 0, x: 110 + 380 / 3 + 10, w: 760 / 3 },
          { row: 1, x: 0, w: 100 },
        ],
        name: 'span, then wrap',
      },
      {
        args: [['1fr', '1fr', '1fr'], 320, 10, [{ col: 3 }, { col: 1 }]],
        expected: [
          { row: 0, x: 220, w: 100 },
          { row: 1, x: 0, w: 100 },
        ],
        name: 'explicit column left of the cursor wraps',
      },
      { args: [['1fr', '1fr'], 210, 10, [{ span: 5 }]], expected: [{ row: 0, x: 0, w: 210 }], name: 'span is capped' },
      {
        args: [['50px', '50px'], 100, 0, [{}, {}, {}]],
        expected: [
          { row: 0, x: 0, w: 50 },
          { row: 0, x: 50, w: 50 },
          { row: 1, x: 0, w: 50 },
        ],
        name: 'plain auto flow',
      },
      { args: [['1fr'], 100, 0, []], expected: [], name: 'no items' },
      {
        args: [['100px', '1fr'], 300, 20, [{ col: 2 }, { span: 2 }]],
        expected: [
          { row: 0, x: 120, w: 180 },
          { row: 1, x: 0, w: 300 },
        ],
        name: 'explicit then full-width span',
      },
    ],
    hints: ['Two small jobs: compute each track width and start x (add the gap after every track), then walk the items with a row/cursor pair.', 'Width of a span = sum of the covered track widths + (span - 1) x gap. Cap span at the column count before using it.'],
    combines: ['css-flexbox', 'css-box-model'],
  },
  quiz: [
    {
      prompt: '`grid-template-columns: repeat(3, 1fr)` is in a container where one cell holds a very long unbroken word. What can happen?',
      options: ['The tracks stay equal because fr is exact', 'The track with the word grows because 1fr means minmax(auto, 1fr)', 'The word is clipped automatically', 'The grid switches to two columns'],
      answer: 1,
      explain: '`1fr` has an automatic minimum of the content size, so wide content can stretch its track. `minmax(0, 1fr)` removes that minimum.',
    },
  ],
};

export default unit;
