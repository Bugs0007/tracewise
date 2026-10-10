// Structural checks for panels and frames. Used by the tests and by the gallery;
// returns human-readable problems (empty array = well formed).
import type { Frame, Panel, Tone } from '@/engine/types';

const TONES = new Set<Tone>(['default', 'active', 'compare', 'swap', 'visited', 'frontier', 'done', 'found', 'error', 'muted', 'path', 'new']);
const PANEL_TYPES = new Set(['array', 'grid', 'graph', 'list', 'buckets', 'sequence', 'timeline', 'chart', 'log', 'kv', 'intervals', 'note']);

export function checkPanel(p: Panel): string[] {
  const bad: string[] = [];
  const tone = (t: unknown, where: string) => {
    if (t !== undefined && !TONES.has(t as Tone)) bad.push(`${where}: unknown tone "${String(t)}"`);
  };
  if (!PANEL_TYPES.has(p.type)) return [`unknown panel type ${(p as { type: string }).type}`];
  switch (p.type) {
    case 'array': {
      if (!Array.isArray(p.values)) bad.push('array: values missing');
      for (const [i, t] of Object.entries(p.tones ?? {})) {
        tone(t, `array tone[${i}]`);
        if (Number(i) < 0 || Number(i) >= p.values.length) bad.push(`array: tone index ${i} outside 0..${p.values.length - 1}`);
      }
      for (const [name, i] of Object.entries(p.pointers ?? {})) if (!Number.isInteger(i) || i < -1 || i > p.values.length) bad.push(`array: pointer "${name}" = ${i} is out of range`);
      if (p.range && (p.range.from > p.range.to + 1 || p.range.from < 0 || p.range.to >= p.values.length + 1)) bad.push(`array: range ${p.range.from}..${p.range.to} is invalid`);
      if (p.indexLabels && p.indexLabels.length !== p.values.length) bad.push('array: indexLabels length differs from values');
      if (p.ids && p.ids.length !== p.values.length) bad.push('array: ids length differs from values');
      break;
    }
    case 'grid': {
      const w = p.cells[0]?.length ?? 0;
      if (p.cells.some((r) => r.length !== w)) bad.push('grid: ragged rows');
      for (const [rc, t] of Object.entries(p.tones ?? {})) {
        tone(t, `grid tone[${rc}]`);
        const [r, c] = rc.split(',').map(Number);
        if (!(r >= 0 && r < p.cells.length && c >= 0 && c < w)) bad.push(`grid: tone cell ${rc} is outside the grid`);
      }
      for (const a of p.arrows ?? []) for (const [r, c] of [a.from, a.to]) if (!(r >= 0 && r < p.cells.length && c >= 0 && c < w)) bad.push(`grid: arrow endpoint ${r},${c} is outside the grid`);
      if (p.rowLabels && p.rowLabels.length !== p.cells.length) bad.push('grid: rowLabels length differs from rows');
      if (p.colLabels && p.colLabels.length !== w) bad.push('grid: colLabels length differs from columns');
      break;
    }
    case 'graph': {
      const ids = new Set(p.nodes.map((n) => n.id));
      if (ids.size !== p.nodes.length) bad.push('graph: duplicate node ids');
      for (const n of p.nodes) tone(n.tone, `graph node ${n.id}`);
      for (const e of p.edges) {
        if (!ids.has(e.from) || !ids.has(e.to)) bad.push(`graph: edge ${e.from}->${e.to} references a missing node`);
        tone(e.tone, `graph edge ${e.from}->${e.to}`);
      }
      break;
    }
    case 'list':
      for (const it of p.items) tone(it.tone, `list item ${it.label}`);
      break;
    case 'kv':
      for (const e of p.entries) tone(e.tone, `kv ${e.k}`);
      break;
    case 'intervals':
      for (const it of p.items) {
        tone(it.tone, 'interval');
        if (!(it.end >= it.start)) bad.push(`intervals: ${it.start}..${it.end} ends before it starts`);
      }
      break;
    default:
      break;
  }
  return bad;
}

export function checkFrame(f: Frame, lines: number, where = 'frame'): string[] {
  const bad: string[] = [];
  if (f.line < 0 || f.line > lines) bad.push(`${where}: line ${f.line} is outside 1..${lines}`);
  if (!f.caption) bad.push(`${where}: no caption`);
  if (!f.panels.length) bad.push(`${where}: no panels`);
  for (const p of f.panels) bad.push(...checkPanel(p).map((m) => `${where}: ${m}`));
  if (f.predict) {
    if (f.predict.options.length < 2) bad.push(`${where}: predict needs at least 2 options`);
    if (new Set(f.predict.options).size !== f.predict.options.length) bad.push(`${where}: predict options repeat`);
    if (f.predict.answer < 0 || f.predict.answer >= f.predict.options.length) bad.push(`${where}: predict answer out of range`);
  }
  return bad;
}
