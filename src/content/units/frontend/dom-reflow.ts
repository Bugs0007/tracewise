import { Recorder } from '@/engine/recorder';
import type { GraphPanel, ListItem, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function renderFrame(ops) {
  let layoutDirty = false, paintDirty = false, compositeDirty = false;   //@init
  let layouts = 0;
  for (const op of ops) {                                    //@loop
    if (op.kind === 'write') {
      const stage = stageOf(op.prop);                        //@classify
      if (stage === 'layout') layoutDirty = paintDirty = compositeDirty = true;   //@layoutWrite
      else if (stage === 'paint') paintDirty = compositeDirty = true;             //@paintWrite
      else compositeDirty = true;                            //@compositeWrite
    } else if (readsLayout(op.prop) && layoutDirty) {        //@read
      layouts++; layoutDirty = false;                        //@force
    }
  }
  if (layoutDirty) layouts++;                                //@frameLayout
  // paint if paintDirty, composite if compositeDirty
}
`;

const LAYOUT_PROPS = new Set(['width', 'height', 'margin', 'padding', 'top', 'left', 'fontSize', 'display']);
const PAINT_PROPS = new Set(['color', 'background', 'boxShadow', 'visibility', 'outline']);
const READS = new Set(['offsetHeight', 'offsetWidth', 'scrollTop', 'clientHeight', 'getBoundingClientRect']);

function stageOf(prop: string): 'layout' | 'paint' | 'composite' {
  if (LAYOUT_PROPS.has(prop)) return 'layout';
  if (PAINT_PROPS.has(prop)) return 'paint';
  return 'composite';
}

interface In {
  ops: string[];
}

function parse(tok: string): { kind: 'read' | 'write'; prop: string } {
  const [kind, prop] = tok.split(':').map((s) => s.trim());
  if ((kind !== 'read' && kind !== 'write') || !prop) throw new Error(`Use read:prop or write:prop (got "${tok}")`);
  return { kind, prop };
}

const STAGE_NODES = ['Style', 'Layout', 'Paint', 'Composite'];

function pipeline(tones: Record<string, Tone>): GraphPanel {
  return {
    type: 'graph',
    title: 'Pipeline stages',
    directed: true,
    width: 420,
    height: 70,
    nodes: STAGE_NODES.map((s, i) => ({ id: s, label: s, x: 50 + i * 106, y: 34, shape: 'pill' as const, w: 90, h: 30, tone: tones[s] })),
    edges: STAGE_NODES.slice(1).map((s, i) => ({ from: STAGE_NODES[i], to: s, directed: true })),
  };
}

const viz: VizDef<In> = {
  id: 'dom-reflow',
  title: 'Reflow, repaint, composite',
  code,
  language: 'javascript',
  inputs: [{ key: 'ops', label: 'Operations in one frame', kind: 'strings', default: ['write:width', 'read:offsetHeight', 'write:height', 'read:offsetHeight', 'write:color'], help: 'write:width, read:offsetHeight, write:transform ...', maxItems: 14 }],
  presets: [
    { label: 'Layout thrashing', input: { ops: ['write:width', 'read:offsetHeight', 'write:width', 'read:offsetHeight', 'write:width', 'read:offsetHeight'] } },
    { label: 'Batched (reads first)', input: { ops: ['read:offsetHeight', 'read:offsetHeight', 'read:offsetHeight', 'write:width', 'write:width', 'write:width'] } },
    { label: 'Transform only', input: { ops: ['write:transform', 'read:offsetHeight', 'write:opacity'] } },
    { label: 'Paint only', input: { ops: ['write:color', 'write:background', 'read:offsetWidth'] } },
  ],
  run({ ops }) {
    const r = new Recorder(code);
    const list = ops.map(parse);
    let layoutDirty = false;
    let paintDirty = false;
    let compositeDirty = false;
    let layouts = 0;
    let forced = 0;
    const stageTone: Record<string, Tone> = {};
    const itemTones: Tone[] = list.map(() => 'default');
    const subs: (string | undefined)[] = list.map(() => undefined);
    const panels = (cur: number) => {
      const items: ListItem[] = list.map((o, i) => ({ label: `${o.kind} ${o.prop}`, tone: i === cur ? 'active' : itemTones[i], sub: subs[i] }));
      return [
        { type: 'list' as const, title: 'Script in this frame', items, orientation: 'vertical' as const, startLabel: 'first', endLabel: 'last' },
        pipeline(stageTone),
        { type: 'kv' as const, entries: [{ k: 'layouts so far', v: layouts }, { k: 'forced (sync) layouts', v: forced, tone: forced ? ('error' as Tone) : undefined }, { k: 'dirty', v: [layoutDirty && 'layout', paintDirty && 'paint', compositeDirty && 'composite'].filter(Boolean).join(' + ') || 'nothing' }] },
      ];
    };
    const setDirtyTones = () => {
      stageTone.Style = 'default';
      stageTone.Layout = layoutDirty ? 'frontier' : 'default';
      stageTone.Paint = paintDirty ? 'frontier' : 'default';
      stageTone.Composite = compositeDirty ? 'frontier' : 'default';
    };
    setDirtyTones();
    r.step('init', `${list.length} operations in one frame. Nothing is dirty yet.`, panels(-1), { layouts });
    list.forEach((op, i) => {
      r.op();
      if (op.kind === 'write') {
        const stage = stageOf(op.prop);
        r.step('classify', `Write ${op.prop}: a ${stage}-level property`, panels(i), { prop: op.prop, stage });
        if (stage === 'layout') layoutDirty = paintDirty = compositeDirty = true;
        else if (stage === 'paint') paintDirty = compositeDirty = true;
        else compositeDirty = true;
        itemTones[i] = stage === 'layout' ? 'swap' : stage === 'paint' ? 'compare' : 'found';
        setDirtyTones();
        const line = stage === 'layout' ? 'layoutWrite' : stage === 'paint' ? 'paintWrite' : 'compositeWrite';
        r.step(line, stage === 'layout' ? 'Layout is now dirty (so are paint and composite) — recalculation is deferred' : stage === 'paint' ? 'Only paint is dirty — geometry is untouched' : 'Composite-only change: no layout, no paint', panels(i), { layoutDirty });
      } else if (READS.has(op.prop) && layoutDirty) {
        layouts++;
        forced++;
        layoutDirty = false;
        itemTones[i] = 'error';
        subs[i] = 'forced layout';
        setDirtyTones();
        stageTone.Layout = 'error';
        r.step('force', `Reading ${op.prop} while layout is dirty forces a synchronous layout (#${layouts})`, panels(i), { layouts });
        setDirtyTones();
      } else {
        itemTones[i] = 'done';
        subs[i] = READS.has(op.prop) ? 'layout is clean: cached' : 'not a layout read';
        r.step('read', READS.has(op.prop) ? `Read ${op.prop}: layout is clean, the browser answers from cache` : `Read ${op.prop}: does not need layout`, panels(i), { layouts });
      }
    });
    if (layoutDirty) layouts++;
    stageTone.Layout = layoutDirty ? 'done' : 'default';
    stageTone.Paint = paintDirty ? 'done' : 'default';
    stageTone.Composite = compositeDirty ? 'done' : 'default';
    stageTone.Style = layoutDirty || paintDirty || compositeDirty ? 'done' : 'default';
    r.step('frameLayout', `Frame end: ${layouts} layout(s), ${paintDirty ? 1 : 0} paint, ${compositeDirty ? 1 : 0} composite`, panels(-1), { layouts });
    return { frames: r.frames, result: { layouts, paints: paintDirty ? 1 : 0, composites: compositeDirty ? 1 : 0 } };
  },
  reference({ ops }) {
    let layoutDirty = false;
    let paint = 0;
    let comp = 0;
    let layouts = 0;
    for (const o of ops.map(parse)) {
      if (o.kind === 'write') {
        const s = stageOf(o.prop);
        if (s === 'layout') layoutDirty = true;
        if (s !== 'composite') paint = 1;
        comp = 1;
      } else if (layoutDirty && READS.has(o.prop)) {
        layouts += 1;
        layoutDirty = false;
      }
    }
    return { layouts: layouts + (layoutDirty ? 1 : 0), paints: paint, composites: comp };
  },
};

const MEASURE = `function measureLayouts(fn, n) {
  const stats = { layouts: 0, dirty: false };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = { style: {} };
    for (const p of ['width', 'minHeight']) {
      let v = '';
      Object.defineProperty(row.style, p, {
        get() { return v; },
        set(x) { v = x; stats.dirty = true; },
      });
    }
    Object.defineProperty(row, 'offsetHeight', {
      get() {
        if (stats.dirty) { stats.layouts++; stats.dirty = false; }
        return 20 + i * 10;
      },
    });
    rows.push(row);
  }
  fn(rows);
  if (stats.dirty) stats.layouts++;
  return { layouts: stats.layouts, heights: rows.map((r) => r.style.minHeight) };
}`;

const COUNT_SETS = `  const layoutWrites = new Set(['width', 'height', 'margin', 'padding', 'top', 'left', 'fontSize', 'display']);
  const layoutReads = new Set(['offsetHeight', 'offsetWidth', 'scrollTop', 'clientHeight', 'getBoundingClientRect']);`;

const unit: Unit = {
  id: 'dom-reflow',
  hook: 'Jank questions come down to one skill: knowing which style change costs layout, which costs only paint, and which is nearly free (composite). Interviewers also love "layout thrashing" because the fix is a one-line reordering.',
  predict: {
    prompt: 'You animate a box by changing one property per frame. Which choice does the LEAST work for the browser?',
    options: ['`left: 10px → 20px`', '`transform: translateX(10px)`', '`background-color: red → blue`', '`width: 100px → 200px`'],
    answer: 1,
    explain: '`left` and `width` change geometry, so layout (reflow) runs and everything after it re-runs. `background-color` skips layout but repaints. `transform` (and `opacity`) can be handled by the compositor on an already-painted layer: no layout, no paint.',
  },
  viz,
  simulationNote: 'The model keeps three dirty flags and counts layouts exactly like the code panel; real engines batch more cleverly, but the forced-layout rule is the real one.',
  deeper: {
    points: [
      'Pipeline: style → layout (geometry) → paint (pixels per layer) → composite (stack layers). A change re-runs its own stage and everything after it.',
      'Layout-triggering: width, height, margin, padding, top/left, font-size, display. Paint-only: color, background, box-shadow, visibility. Composite-only: transform, opacity (the cheap ones to animate).',
      'The browser defers layout until the frame ends. Reading `offsetHeight`, `getBoundingClientRect()`, `scrollTop` and similar while layout is dirty forces a synchronous layout.',
      'Layout thrashing is write, read, write, read in a loop: each read forces a fresh layout. Batch all reads first, then all writes (or use `requestAnimationFrame` / FastDOM style scheduling).',
      'Toggle classes instead of many inline styles, and use `will-change` sparingly to promote a layer you really animate.',
    ],
    pitfalls: ['Reading `offsetWidth` inside a loop that also sets styles', 'Animating `top`/`left`/`height` instead of `transform`', 'Overusing `will-change`, which costs memory for every promoted layer'],
  },
  practice: {
    language: 'javascript',
    fnName: 'countLayouts',
    statement: 'Operations are strings like `"write:width"` or `"read:offsetHeight"`. A write to a layout property makes layout dirty. A read of a layout-reading property while dirty forces a layout (and cleans it). If layout is still dirty at the end of the frame, it runs once more. Return the number of layouts.',
    signature: 'function countLayouts(ops) {',
    solution: `function countLayouts(ops) {
${COUNT_SETS}
  let dirty = false;
  let layouts = 0;
  for (const op of ops) {
    const [kind, prop] = @@op.split(':')@@;
    if (kind === 'write' && layoutWrites.has(prop)) {
      @@dirty = true@@;
    } else if (kind === 'read' && @@layoutReads.has(prop) && dirty@@) {
      @@layouts++@@;
      dirty = false;
    }
  }
  @@if (dirty) layouts++@@;
  return layouts;
}`,
    tests: [
      { args: [['write:width', 'write:height', 'read:offsetHeight']], expected: 1, name: 'one forced layout' },
      { args: [['write:width', 'read:offsetHeight', 'write:width', 'read:offsetHeight']], expected: 2, name: 'thrashing' },
      { args: [['read:offsetHeight', 'read:offsetWidth', 'write:width', 'write:height']], expected: 1, name: 'reads first, end-of-frame layout' },
      { args: [['write:transform', 'read:offsetHeight', 'write:opacity']], expected: 0, name: 'composite-only' },
      { args: [['write:color', 'read:offsetHeight']], expected: 0, name: 'paint-only' },
      { args: [[]], expected: 0, name: 'empty' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'fitRows',
    adapter: 'measureLayouts',
    harness: MEASURE,
    statement: '`fitRows(rows)` sets every row to width 100px and minHeight equal to its measured height. With many rows it triggers a layout per row. Make it do a single layout (the heights written must stay the same).',
    buggy: `function fitRows(rows) {
  for (const row of rows) {
    row.style.width = '100px';
    row.style.minHeight = row.offsetHeight + 'px';
  }
}`,
    fixed: `function fitRows(rows) {
  const heights = rows.map((row) => row.offsetHeight);
  rows.forEach((row, i) => {
    row.style.width = '100px';
    row.style.minHeight = heights[i] + 'px';
  });
}`,
    tests: [
      { args: [3], expected: { layouts: 1, heights: ['20px', '30px', '40px'] }, name: '3 rows' },
      { args: [1], expected: { layouts: 1, heights: ['20px'] }, name: '1 row' },
      { args: [5], expected: { layouts: 1, heights: ['20px', '30px', '40px', '50px', '60px'] }, name: '5 rows' },
      { args: [0], expected: { layouts: 0, heights: [] }, name: 'no rows' },
    ],
    bugType: 'layout thrashing',
    hint: 'Each loop iteration writes a style and then reads `offsetHeight`. What does that read cost when layout is dirty?',
    explanation: 'The write dirties layout and the next row\'s read forces it to be recomputed, once per row. Collect all measurements first (reads), then apply all styles (writes): one layout at the end of the frame.',
  },
  boss: {
    title: 'Thrash report',
    statement:
      'Write `thrashReport(ops)` for operations like `"write:left"` / `"read:scrollTop"`. Layout-writes: width, height, margin, padding, top, left, fontSize, display. Layout-reads: offsetHeight, offsetWidth, scrollTop, clientHeight, getBoundingClientRect. Other props (color, transform, opacity...) never dirty layout. Return `{ before, after }`: layouts the sequence causes as written (forced layouts plus one at frame end if still dirty) and layouts if all reads were moved first, keeping each group in order.',
    language: 'javascript',
    fnName: 'thrashReport',
    starter: `function thrashReport(ops) {
  return { before: 0, after: 0 };
}`,
    solution: `function thrashReport(ops) {
${COUNT_SETS}
  const count = (list) => {
    let dirty = false;
    let layouts = 0;
    for (const op of list) {
      const [kind, prop] = op.split(':');
      if (kind === 'write' && layoutWrites.has(prop)) dirty = true;
      else if (kind === 'read' && layoutReads.has(prop) && dirty) {
        layouts++;
        dirty = false;
      }
    }
    return layouts + (dirty ? 1 : 0);
  };
  const reads = ops.filter((o) => o.startsWith('read:'));
  const writes = ops.filter((o) => o.startsWith('write:'));
  return { before: count(ops), after: count([...reads, ...writes]) };
}`,
    tests: [
      { args: [['write:width', 'read:offsetHeight', 'write:width', 'read:offsetHeight', 'write:width', 'read:offsetHeight']], expected: { before: 3, after: 1 }, name: 'classic thrash' },
      { args: [['read:offsetHeight', 'read:scrollTop', 'write:left', 'write:top']], expected: { before: 1, after: 1 }, name: 'already batched' },
      { args: [['write:transform', 'read:offsetHeight', 'write:opacity', 'read:getBoundingClientRect']], expected: { before: 0, after: 0 }, name: 'composite thrash is harmless' },
      { args: [['write:color', 'read:offsetWidth', 'write:left', 'read:scrollTop', 'write:left']], expected: { before: 2, after: 1 }, name: 'mixed' },
      { args: [[]], expected: { before: 0, after: 0 }, name: 'empty' },
    ],
    hints: ['Write one helper that counts layouts for a list of ops (dirty flag + counter), then call it twice.', 'For `after`, build `[...reads, ...writes]` with two `filter` calls so order inside each group is kept.'],
    combines: ['dom-reflow', 'dom-crp'],
  },
};

export default unit;
