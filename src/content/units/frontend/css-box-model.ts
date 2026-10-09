import { Recorder } from '@/engine/recorder';
import type { GraphNode, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { boxPanel, collapseMargins, computeBox, rectNode, type BoxIn } from '@/content/lib/frontend-css-web';

const code = `
function boxWidth(s) {
  const edge = 2 * (s.padding + s.border);                                   //@edge
  const content = s.boxSizing === 'border-box' ? Math.max(0, s.width - edge) : s.width;  //@content
  const borderBox = content + edge;                                          //@borderBox
  const marginBox = borderBox + 2 * s.margin;                                //@marginBox
  return { content, borderBox, marginBox };                                  //@ret
}

// vertical margins of stacked siblings meet and collapse
function gap(a, b) {                                                         //@gap
  if (a >= 0 && b >= 0) return Math.max(a, b);                               //@pos
  if (a < 0 && b < 0) return Math.min(a, b);                                 //@neg
  return a + b;                                                              //@mixed
}
`;

interface In extends BoxIn {
  margin2: number;
}

function gapPanel(a: number, b: number, collapsed: number) {
  const naive = a + b;
  const sc = Math.min(1.6, 110 / Math.max(Math.abs(naive), Math.abs(collapsed), 1));
  const bw = 120;
  const bh = 34;
  const nodes: GraphNode[] = [];
  const column = (prefix: string, x: number, g: number, tone: 'error' | 'found', title: string) => {
    const gh = Math.max(0, g) * sc;
    nodes.push(rectNode(`${prefix}-a`, `A  (margin-bottom ${a})`, x, 0, bw, bh, 'compare', { sub: undefined }));
    nodes.push(rectNode(`${prefix}-gap`, `${g}px`, x, bh, bw, Math.max(gh, 6), tone, { badge: title }));
    nodes.push(rectNode(`${prefix}-b`, `B  (margin-top ${b})`, x, bh + Math.max(gh, 6), bw, bh, 'compare'));
  };
  column('naive', 0, naive, 'error', 'if margins added');
  column('real', 190, collapsed, 'found', 'collapsed (real)');
  const height = bh * 2 + Math.max(Math.max(0, naive), Math.max(0, collapsed), 6) * sc + 30;
  return { type: 'graph' as const, title: 'Stacked siblings: the gap between A and B', nodes, edges: [], width: 310, height: Math.round(height) };
}

const viz: VizDef<In> = {
  id: 'css-box-model',
  title: 'Box model sizes and margin collapsing',
  code,
  language: 'javascript',
  inputs: [
    { key: 'boxSizing', label: 'box-sizing', kind: 'select', default: 'content-box', options: ['content-box', 'border-box'] },
    { key: 'width', label: 'width (px)', kind: 'number', default: 200 },
    { key: 'padding', label: 'padding (px, each side)', kind: 'number', default: 20 },
    { key: 'border', label: 'border (px, each side)', kind: 'number', default: 5 },
    { key: 'margin', label: 'margin-bottom of A / margin (px)', kind: 'number', default: 16 },
    { key: 'margin2', label: 'margin-top of sibling B (px)', kind: 'number', default: 24 },
  ],
  presets: [
    { label: 'content-box', input: { boxSizing: 'content-box', width: 200, padding: 20, border: 5, margin: 16, margin2: 24 } },
    { label: 'border-box', input: { boxSizing: 'border-box', width: 200, padding: 20, border: 5, margin: 16, margin2: 24 } },
    { label: 'Too narrow for border-box', input: { boxSizing: 'border-box', width: 30, padding: 20, border: 5, margin: 10, margin2: 10 } },
    { label: 'Negative margin', input: { boxSizing: 'content-box', width: 120, padding: 10, border: 2, margin: 30, margin2: -12 } },
  ],
  run(input) {
    const r = new Recorder(code);
    const box: BoxIn = { boxSizing: input.boxSizing, width: input.width, padding: input.padding, border: input.border, margin: input.margin };
    const o = computeBox(box);
    const g = collapseMargins(input.margin, input.margin2);
    const bs = input.boxSizing;
    r.step('edge', `Padding ${box.padding} + border ${box.border} on both sides adds ${o.edge}px of horizontal edge`, [boxPanel(box, 1, 'Content only so far'), { type: 'kv', entries: [{ k: 'box-sizing', v: bs }, { k: 'width', v: box.width }, { k: 'edge', v: o.edge, tone: 'compare' }] }], { width: box.width, edge: o.edge });
    r.op();
    r.step(
      'content',
      bs === 'border-box' ? `border-box: width covers the edges, so content = max(0, ${box.width} - ${o.edge}) = ${o.content}` : `content-box: width sets only the content, so content = ${o.content}`,
      [boxPanel(box, 1, 'Content box'), { type: 'kv', entries: [{ k: 'content width', v: o.content, tone: 'active' }] }],
      { content: o.content },
    );
    r.step('borderBox', `Visible box = ${o.content} + ${o.edge} = ${o.borderBox}px` + (bs === 'border-box' && box.width < o.edge ? ' (edges alone exceed width)' : ''), [boxPanel(box, 3, 'Content + padding + border'), { type: 'kv', entries: [{ k: 'border-box width', v: o.borderBox, tone: 'compare' }] }], { content: o.content, borderBox: o.borderBox });
    r.step('marginBox', `Space it claims in the layout = ${o.borderBox} + 2 x ${box.margin} margin = ${o.marginBox}px`, [boxPanel(box, 4, 'All four layers'), { type: 'kv', entries: [{ k: 'margin-box width', v: o.marginBox, tone: 'frontier' }] }], { marginBox: o.marginBox });
    r.step('ret', `boxWidth returns content ${o.content}, border-box ${o.borderBox}, margin-box ${o.marginBox}`, [{ type: 'grid', cells: [[box.margin, box.border, box.padding, o.content, box.padding, box.border, box.margin]], colLabels: ['margin', 'border', 'padding', 'content', 'padding', 'border', 'margin'], tones: { '0,0': 'muted', '0,1': 'compare', '0,2': 'new', '0,3': 'active', '0,4': 'new', '0,5': 'compare', '0,6': 'muted' } }], { content: o.content, borderBox: o.borderBox, marginBox: o.marginBox });
    r.step('gap', `A's bottom margin ${input.margin} meets B's top margin ${input.margin2}`, [gapPanel(input.margin, input.margin2, g)], { a: input.margin, b: input.margin2 });
    const a = input.margin;
    const b = input.margin2;
    const anchor = a >= 0 && b >= 0 ? 'pos' : a < 0 && b < 0 ? 'neg' : 'mixed';
    const why = anchor === 'pos' ? `both positive: the larger wins, gap = max = ${g}px (not ${a + b})` : anchor === 'neg' ? `both negative: the most negative wins, gap = ${g}px` : `mixed signs: they add, gap = ${a} + ${b} = ${g}px`;
    r.step(anchor, why, [gapPanel(a, b, g), { type: 'kv', entries: [{ k: 'collapsed gap', v: g, tone: 'found' }, { k: 'naive sum', v: a + b, tone: 'error' }] }], { gap: g });
    return { frames: r.frames, result: { content: o.content, borderBox: o.borderBox, marginBox: o.marginBox, gap: g } };
  },
  reference(i) {
    const edge = 2 * (i.padding + i.border);
    const content = i.boxSizing === 'border-box' ? (i.width > edge ? i.width - edge : 0) : i.width;
    const a = i.margin;
    const b = i.margin2;
    const gap = a >= 0 && b >= 0 ? (a > b ? a : b) : a < 0 && b < 0 ? (a < b ? a : b) : a + b;
    return { content, borderBox: content + edge, marginBox: content + edge + i.margin * 2, gap };
  },
};

const st = (o: Record<string, unknown>) => ({ boxSizing: 'content-box', width: 100, paddingLeft: 0, paddingRight: 0, borderLeft: 0, borderRight: 0, ...o });

const widthTests = [
  { args: [st({})], expected: 100, name: 'plain width' },
  { args: [st({ paddingLeft: 10, paddingRight: 10 })], expected: 120, name: 'padding adds' },
  { args: [st({ paddingLeft: 20, paddingRight: 20, borderLeft: 5, borderRight: 5 })], expected: 150, name: 'padding + border add' },
  { args: [st({ boxSizing: 'border-box', paddingLeft: 20, paddingRight: 20, borderLeft: 5, borderRight: 5 })], expected: 100, name: 'border-box keeps width' },
  { args: [st({ boxSizing: 'border-box', width: 30, paddingLeft: 20, paddingRight: 20 })], expected: 40, name: 'border-box cannot go below its edges' },
  { args: [st({ borderLeft: 3, paddingRight: 7 })], expected: 110, name: 'asymmetric edges' },
];

const unit: Unit = {
  id: 'css-box-model',
  hook: 'Half of all "why is my layout 4px too wide?" bugs are the box model. Interviewers use `box-sizing` and margin collapsing to see whether you can predict sizes instead of nudging pixels.',
  predict: {
    prompt: 'An element has `box-sizing: content-box; width: 200px; padding: 20px; border: 5px solid; margin: 10px`. How much horizontal space does it occupy in the layout?',
    options: ['200px', '250px', '260px', '270px'],
    answer: 3,
    explain: 'Content-box width is only the content: 200 + 2 x 20 padding + 2 x 5 border = 250px visible box, plus 2 x 10 margin = 270px of layout space.',
  },
  viz,
  deeper: {
    points: [
      'Four layers from the inside out: content, padding, border, margin. Backgrounds paint under padding and border, never under margin.',
      '`content-box` (the default) makes `width` the content only; `border-box` makes `width` the visible box, so adding padding shrinks the content instead of growing the element.',
      'Most resets set `*, *::before, *::after { box-sizing: border-box }` so `width: 50%` plus padding does not overflow its row.',
      'Vertical margins of adjacent block siblings collapse: positives take the max, negatives take the most negative, mixed signs add. Horizontal margins never collapse.',
      'Margins do not collapse inside flex or grid containers, across a parent that has padding or border, or on floated / absolutely positioned boxes.',
    ],
    pitfalls: ['Forgetting that border counts too when computing a content-box width', 'Expecting `margin: 20px` and `margin: 30px` between siblings to give 50px (it gives 30px)', 'Assuming a child margin stays inside the parent: without padding or border it collapses through the parent edge'],
  },
  practice: {
    language: 'javascript',
    fnName: 'boxWidth',
    statement: 'Given a style object, return the width of the visible box (content + padding + border) that the browser renders. Respect `boxSizing`; a `border-box` can never be narrower than its own padding and border.',
    signature: 'function boxWidth(style) {',
    solution: `function boxWidth(style) {
  const edge = @@style.paddingLeft + style.paddingRight + style.borderLeft + style.borderRight@@;
  if (style.boxSizing === 'border-box') {
    return @@Math.max(style.width, edge)@@;
  }
  return @@style.width + edge@@;
}`,
    tests: widthTests,
  },
  debug: {
    language: 'javascript',
    fnName: 'boxWidth',
    statement: 'A design-system helper reports the wrong rendered width for bordered content-box elements. Find the bug.',
    buggy: `function boxWidth(style) {
  const edge = style.paddingLeft + style.paddingRight;
  if (style.boxSizing === 'border-box') {
    return Math.max(style.width, edge + style.borderLeft + style.borderRight);
  }
  return style.width + edge;
}`,
    fixed: `function boxWidth(style) {
  const edge = style.paddingLeft + style.paddingRight + style.borderLeft + style.borderRight;
  if (style.boxSizing === 'border-box') {
    return Math.max(style.width, edge);
  }
  return style.width + edge;
}`,
    tests: widthTests,
    bugType: 'forgotten border',
    hint: 'Compare the content-box branch with the border-box branch: do both count the same edges?',
    explanation: 'In content-box mode the rendered width is width + padding + BORDER. The buggy code added only padding, so every bordered element came out too narrow. Compute one `edge` that includes all four horizontal pieces and use it in both branches.',
  },
  boss: {
    title: 'Stack height with collapsing margins',
    language: 'javascript',
    fnName: 'stackHeight',
    statement:
      'Block boxes are stacked vertically. Each box has {boxSizing, height, padding, border, marginTop, marginBottom}; padding and border are per side (so they count twice). Return the vertical space from the first box top margin edge to the last box bottom margin edge. Adjoining margins of consecutive boxes collapse (both positive: max, both negative: min, mixed: sum). An empty list is 0.',
    starter: `function stackHeight(boxes) {
  // your code here
}
`,
    solution: `function stackHeight(boxes) {
  if (boxes.length === 0) return 0;
  const gap = (a, b) => {
    if (a >= 0 && b >= 0) return Math.max(a, b);
    if (a < 0 && b < 0) return Math.min(a, b);
    return a + b;
  };
  let total = boxes[0].marginTop;
  boxes.forEach((b, i) => {
    const edge = 2 * (b.padding + b.border);
    total += b.boxSizing === 'border-box' ? Math.max(b.height, edge) : b.height + edge;
    total += i < boxes.length - 1 ? gap(b.marginBottom, boxes[i + 1].marginTop) : b.marginBottom;
  });
  return total;
}`,
    tests: [
      { args: [[]], expected: 0, name: 'empty' },
      { args: [[{ boxSizing: 'content-box', height: 100, padding: 10, border: 0, marginTop: 5, marginBottom: 7 }]], expected: 132, name: 'single box' },
      {
        args: [
          [
            { boxSizing: 'content-box', height: 50, padding: 0, border: 0, marginTop: 0, marginBottom: 20 },
            { boxSizing: 'content-box', height: 50, padding: 0, border: 0, marginTop: 30, marginBottom: 0 },
          ],
        ],
        expected: 130,
        name: 'positive margins collapse to the max',
      },
      {
        args: [
          [
            { boxSizing: 'content-box', height: 50, padding: 0, border: 0, marginTop: 0, marginBottom: 20 },
            { boxSizing: 'content-box', height: 50, padding: 0, border: 0, marginTop: -5, marginBottom: 0 },
          ],
        ],
        expected: 115,
        name: 'mixed signs add',
      },
      {
        args: [
          [
            { boxSizing: 'content-box', height: 50, padding: 0, border: 0, marginTop: 0, marginBottom: -10 },
            { boxSizing: 'content-box', height: 50, padding: 0, border: 0, marginTop: -20, marginBottom: 0 },
          ],
        ],
        expected: 80,
        name: 'negative margins take the most negative',
      },
      {
        args: [
          [
            { boxSizing: 'border-box', height: 100, padding: 10, border: 5, marginTop: 8, marginBottom: 8 },
            { boxSizing: 'border-box', height: 20, padding: 15, border: 5, marginTop: 8, marginBottom: 8 },
          ],
        ],
        expected: 8 + 100 + 8 + 40 + 8,
        name: 'border-box heights',
      },
    ],
    hints: ['Break it into two parts you already know: the visible height of each box (like boxWidth, vertically) and the gap between neighbours.', 'The first top margin and the last bottom margin are added as-is; only margins BETWEEN two boxes collapse.'],
    combines: ['css-flexbox'],
  },
  quiz: [
    {
      prompt: 'Two stacked blocks: the first has `margin-bottom: 20px`, the second `margin-top: 30px`. How far apart are their borders?',
      options: ['20px', '30px', '50px', '10px'],
      answer: 1,
      explain: 'Adjoining positive vertical margins collapse to the larger one: 30px.',
    },
    {
      prompt: 'Which setting makes `width: 100%` plus `padding: 16px` fit exactly inside the parent?',
      options: ['`box-sizing: border-box`', '`box-sizing: content-box`', '`overflow: hidden`', '`margin: auto`'],
      answer: 0,
      explain: 'With border-box the 100% already includes padding and border, so the content shrinks instead of the element overflowing.',
    },
  ],
};

export default unit;
