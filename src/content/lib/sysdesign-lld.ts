// Shared helpers for the low-level-design units (OOP, SOLID, UML, design patterns).
//  - class-diagram model (Design) rendered as a graph panel of rect class nodes
//  - the "refactor, then replay a change request" runner used by the five SOLID units
//  - Python harness snippets used by several practice / debug / boss tasks
import { Recorder } from '@/engine/recorder';
import type { ChartPanel, GraphEdge, GraphNode, GraphPanel, KVPanel, LogPanel, Panel, Tone, VizDef, VizResult } from '@/engine/types';

// ───────────────────────── class diagram model ─────────────────────────

export type ClsKind = 'class' | 'interface' | 'abstract';
export type RelKind = 'inherits' | 'implements' | 'uses' | 'depends' | 'composes' | 'aggregates' | 'assoc';

export interface Cls {
  id: string;
  name: string;
  methods: string[];
  attrs?: string[];
  kind?: ClsKind;
  x: number;
  y: number;
  /** concerns (reasons to change) whose code lives in this class */
  owns?: string[];
}

export interface Rel {
  from: string;
  to: string;
  kind: RelKind;
  label?: string;
  curve?: number;
}

export interface Design {
  classes: Cls[];
  rels: Rel[];
}

const REL_STYLE: Record<RelKind, { label: string; dashed: boolean }> = {
  inherits: { label: 'is-a', dashed: false },
  implements: { label: 'implements', dashed: true },
  uses: { label: 'uses', dashed: true },
  depends: { label: 'depends', dashed: true },
  composes: { label: '◆ owns', dashed: false },
  aggregates: { label: '◇ has', dashed: false },
  assoc: { label: 'knows', dashed: false },
};

export function nodeSub(c: Cls): string {
  const attrs = c.attrs?.length ? c.attrs.join(', ') : '';
  const methods = c.methods.join(' · ');
  return attrs && methods ? `${attrs} │ ${methods}` : attrs || methods;
}

function nodeSize(c: Cls): { w: number; h: number } {
  const sub = nodeSub(c);
  const w = Math.ceil(Math.max(c.name.length * 8 + 26, sub.length * 5.2 + 24, 96) / 2) * 2;
  return { w, h: sub ? 46 : 34 };
}

export function clsNode(c: Cls, tone: Tone = 'default'): GraphNode {
  const { w, h } = nodeSize(c);
  const sub = nodeSub(c);
  return {
    id: c.id,
    label: c.name,
    x: c.x,
    y: c.y,
    shape: 'rect',
    w,
    h,
    tone,
    sub: sub || undefined,
    tags: c.kind && c.kind !== 'class' ? [`«${c.kind}»`] : undefined,
  };
}

/** Throws if two class boxes overlap (so content authors catch layout mistakes during validation). */
export function assertNoOverlap(classes: Cls[]): void {
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i];
      const b = classes[j];
      const sa = nodeSize(a);
      const sb = nodeSize(b);
      const dx = Math.abs(a.x - b.x) - (sa.w + sb.w) / 2;
      const dy = Math.abs(a.y - b.y) - (sa.h + sb.h) / 2;
      if (dx < 8 && dy < 18) throw new Error(`Class boxes ${a.id} and ${b.id} overlap in the diagram layout`);
    }
  }
}

export function designPanel(title: string, d: Design, tones: Record<string, Tone> = {}, edgeTones: Record<string, Tone> = {}, size = { width: 700, height: 330 }): GraphPanel {
  assertNoOverlap(d.classes);
  const ids = new Set(d.classes.map((c) => c.id));
  const edges: GraphEdge[] = d.rels.map((r) => {
    if (!ids.has(r.from) || !ids.has(r.to)) throw new Error(`Relationship ${r.from} -> ${r.to} references a missing class`);
    const st = REL_STYLE[r.kind];
    return { from: r.from, to: r.to, label: r.label ?? st.label, directed: true, dashed: st.dashed, tone: edgeTones[`${r.from}>${r.to}`], curve: r.curve };
  });
  return { type: 'graph', title, nodes: d.classes.map((c) => clsNode(c, tones[c.id] ?? 'default')), edges, width: size.width, height: size.height };
}

export function cloneDesign(d: Design): Design {
  return structuredClone(d);
}

// ───────────────────────── refactor steps ─────────────────────────

export interface Step {
  /** code anchor the frame points at */
  at: string;
  caption: string;
  add?: Cls[];
  update?: (Partial<Cls> & { id: string })[];
  remove?: string[];
  addRels?: Rel[];
  removeRels?: [string, string][];
}

export interface StepResult {
  design: Design;
  added: string[];
  changed: string[];
  newEdges: string[];
}

export function applyStep(d: Design, s: Step): StepResult {
  const design = cloneDesign(d);
  const added: string[] = [];
  const changed: string[] = [];
  const newEdges: string[] = [];
  for (const id of s.remove ?? []) {
    design.classes = design.classes.filter((c) => c.id !== id);
    design.rels = design.rels.filter((r) => r.from !== id && r.to !== id);
  }
  for (const [from, to] of s.removeRels ?? []) design.rels = design.rels.filter((r) => !(r.from === from && r.to === to));
  for (const u of s.update ?? []) {
    const c = design.classes.find((k) => k.id === u.id);
    if (!c) throw new Error(`Refactor step updates unknown class ${u.id}`);
    Object.assign(c, u);
    changed.push(u.id);
  }
  for (const c of s.add ?? []) {
    design.classes.push(structuredClone(c));
    added.push(c.id);
  }
  for (const r of s.addRels ?? []) {
    design.rels.push({ ...r });
    newEdges.push(`${r.from}>${r.to}`);
  }
  return { design, added, changed, newEdges };
}

export const ownersOf = (d: Design, concern: string): string[] => d.classes.filter((c) => c.owns?.includes(concern)).map((c) => c.id);

/** How many *other* concerns share a class with the one being edited (regression surface). */
export const collateralOf = (d: Design, concern: string): number => d.classes.filter((c) => c.owns?.includes(concern)).reduce((n, c) => n + (c.owns!.length - 1), 0);

// ───────────────────────── SOLID before/after runner ─────────────────────────

export interface SolidSpec {
  id: string;
  title: string;
  code: string;
  before: Design;
  steps: Step[];
  /** change requests the learner can replay: key -> label (and the class a new feature would add) */
  requests: Record<string, { label: string; adds?: string }>;
  start: { at: string; caption: string; flag: string[] };
  finish: { at: string; caption: string };
  simAt: string;
  defaultRequests: string[];
  presets: { label: string; requests: string[] }[];
}

export interface SolidInput {
  requests: string[];
}

export interface SolidResult {
  editsBefore: number[];
  editsAfter: number[];
  collateralBefore: number[];
  collateralAfter: number[];
  totalBefore: number;
  totalAfter: number;
}

const clip = (s: string, n = 90): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');
const nameOf = (d: Design, id: string): string => d.classes.find((c) => c.id === id)?.name ?? id;
const classes = (n: number): string => (n === 1 ? '1 class' : `${n} classes`);

function checkRequests(spec: SolidSpec, keys: string[]): void {
  for (const k of keys) if (!spec.requests[k]) throw new Error(`Unknown change request "${k}". Choose from: ${Object.keys(spec.requests).join(', ')}`);
}

export function solidFinalDesign(spec: SolidSpec): Design {
  return spec.steps.reduce((d, s) => applyStep(d, s).design, spec.before);
}

export function solidReference(spec: SolidSpec, input: SolidInput): SolidResult {
  checkRequests(spec, input.requests);
  const after = solidFinalDesign(spec);
  // independent formulation: build a concern -> owners index for each design, then look requests up
  const index = (d: Design): Map<string, Cls[]> => {
    const m = new Map<string, Cls[]>();
    for (const c of d.classes) for (const k of c.owns ?? []) m.set(k, [...(m.get(k) ?? []), c]);
    return m;
  };
  const ib = index(spec.before);
  const ia = index(after);
  const edits = (m: Map<string, Cls[]>) => input.requests.map((k) => (m.get(k) ?? []).length);
  const coll = (m: Map<string, Cls[]>) => input.requests.map((k) => (m.get(k) ?? []).reduce((n, c) => n + (c.owns?.length ?? 1) - 1, 0));
  const eb = edits(ib);
  const ea = edits(ia);
  return { editsBefore: eb, editsAfter: ea, collateralBefore: coll(ib), collateralAfter: coll(ia), totalBefore: eb.reduce((a, b) => a + b, 0), totalAfter: ea.reduce((a, b) => a + b, 0) };
}

export function solidViz(spec: SolidSpec): VizDef<SolidInput> {
  const tally = (title: string, rows: Record<string, string | number>): KVPanel => ({ type: 'kv', title, entries: Object.entries(rows).map(([k, v]) => ({ k, v })) });
  const moves = (lines: string[]): LogPanel => ({ type: 'log', title: 'Refactor moves', lines: lines.map((text, i) => ({ text, tone: i === lines.length - 1 ? ('new' as Tone) : ('default' as Tone) })) });
  return {
    id: spec.id,
    title: spec.title,
    code: spec.code,
    language: 'python',
    inputs: [
      {
        key: 'requests',
        label: 'Change requests to replay',
        kind: 'strings',
        default: spec.defaultRequests,
        help: `Comma-separated keys: ${Object.entries(spec.requests)
          .map(([k, v]) => `${k} (${v.label})`)
          .join('; ')}`,
        maxItems: 6,
      },
    ],
    presets: spec.presets.map((p) => ({ label: p.label, input: { requests: p.requests } })),
    run(input) {
      checkRequests(spec, input.requests);
      const r = new Recorder(spec.code);
      let design = cloneDesign(spec.before);
      const flagged = Object.fromEntries(spec.start.flag.map((id) => [id, 'error' as Tone]));
      const beforeOwners = Object.keys(spec.requests).reduce<Record<string, string>>((acc, k) => {
        const o = ownersOf(spec.before, k);
        acc[spec.requests[k].label] = o.length ? o.map((id) => nameOf(spec.before, id)).join(', ') : '—';
        return acc;
      }, {});
      r.op();
      r.step(spec.start.at, spec.start.caption, [designPanel('Before: the violating design', design, flagged), tally('Who changes for each request (before)', beforeOwners)], { classes: design.classes.length });
      const log: string[] = [];
      spec.steps.forEach((s, i) => {
        r.op();
        const res = applyStep(design, s);
        design = res.design;
        const tones: Record<string, Tone> = {};
        for (const id of res.changed) tones[id] = 'swap';
        for (const id of res.added) tones[id] = 'new';
        const edgeTones: Record<string, Tone> = {};
        for (const k of res.newEdges) edgeTones[k] = 'new';
        log.push(`${i + 1}. ${s.caption}`);
        r.step(s.at, clip(s.caption), [designPanel(`Refactor step ${i + 1} of ${spec.steps.length}`, design, tones, edgeTones), moves(log)], { step: i + 1, classes: design.classes.length });
      });
      const afterDesign = design;
      const done = Object.fromEntries(afterDesign.classes.map((c) => [c.id, 'done' as Tone]));
      r.step(spec.finish.at, clip(spec.finish.caption), [designPanel('After: the fixed design', afterDesign, done), moves(log)], { classes: afterDesign.classes.length });

      const res: SolidResult = { editsBefore: [], editsAfter: [], collateralBefore: [], collateralAfter: [], totalBefore: 0, totalAfter: 0 };
      input.requests.forEach((k, i) => {
        const req = spec.requests[k];
        const ob = ownersOf(spec.before, k);
        const oa = ownersOf(afterDesign, k);
        const cb = collateralOf(spec.before, k);
        const ca = collateralOf(afterDesign, k);
        res.editsBefore.push(ob.length);
        res.editsAfter.push(oa.length);
        res.collateralBefore.push(cb);
        res.collateralAfter.push(ca);
        res.totalBefore += ob.length;
        res.totalAfter += oa.length;
        r.op();
        r.step(
          spec.simAt,
          clip(`"${req.label}" in the old design: ${classes(ob.length)} to edit${ob.length ? ' (' + ob.map((id) => nameOf(spec.before, id)).join(', ') + ')' : ''}`),
          [
            designPanel(`Old design, request ${i + 1}: ${req.label}`, spec.before, Object.fromEntries(ob.map((id) => [id, 'error' as Tone]))),
            tally('Classes edited so far', { 'old design': res.totalBefore, 'new design': res.totalAfter - oa.length }),
          ],
          { request: k, edits_old: ob.length, unrelated_concerns_at_risk: cb },
        );
        const tones: Record<string, Tone> = Object.fromEntries(oa.map((id) => [id, 'swap' as Tone]));
        const addNote = req.adds ? ` + new ${req.adds}` : '';
        r.step(
          spec.simAt,
          clip(`Same request in the new design: ${classes(oa.length)} to edit${oa.length ? ' (' + oa.map((id) => nameOf(afterDesign, id)).join(', ') + ')' : addNote}`),
          [designPanel(`New design, request ${i + 1}: ${req.label}`, afterDesign, tones), tally('Classes edited so far', { 'old design': res.totalBefore, 'new design': res.totalAfter })],
          { request: k, edits_new: oa.length, unrelated_concerns_at_risk: ca },
        );
      });
      if (input.requests.length) {
        const chart: ChartPanel = {
          type: 'chart',
          title: 'Existing classes edited per request',
          kind: 'bar',
          xLabel: 'request #',
          yLabel: 'classes edited',
          series: [
            { label: 'old design', points: res.editsBefore.map((v, i) => [i + 1, v] as [number, number]), tone: 'error' },
            { label: 'new design', points: res.editsAfter.map((v, i) => [i + 1, v] as [number, number]), tone: 'found' },
          ],
        };
        r.step(
          spec.simAt,
          `Totals: ${res.totalBefore} edits before, ${res.totalAfter} after; unrelated concerns at risk ${res.collateralBefore.reduce((a, b) => a + b, 0)} → ${res.collateralAfter.reduce((a, b) => a + b, 0)}`,
          [chart, tally('Summary', { 'edits (old design)': res.totalBefore, 'edits (new design)': res.totalAfter, 'concerns at risk (old)': res.collateralBefore.reduce((a, b) => a + b, 0), 'concerns at risk (new)': res.collateralAfter.reduce((a, b) => a + b, 0) })],
          { edits_old: res.totalBefore, edits_new: res.totalAfter },
        );
      } else {
        r.step(spec.simAt, 'No change requests given: add keys such as ' + Object.keys(spec.requests)[0], [designPanel('New design', afterDesign, done)], {});
      }
      return { frames: r.frames, result: res } satisfies VizResult;
    },
    reference: (input) => solidReference(spec, input),
  };
}

// ───────────────────────── small panel helpers ─────────────────────────

export function kv(title: string, rows: Record<string, string | number | boolean | null>, tones: Record<string, Tone> = {}): KVPanel {
  return { type: 'kv', title, entries: Object.entries(rows).map(([k, v]) => ({ k, v, tone: tones[k] })) };
}

export function log(title: string, lines: { text: string; tone?: Tone }[], keep = 9): LogPanel {
  return { type: 'log', title, lines: lines.slice(-keep) };
}

export function note(text: string, tone: Tone = 'default'): Panel {
  return { type: 'note', text, tone };
}

export { clip };

// ───────────────────────── Python harness snippets ─────────────────────────

/** Like run_ops but an exception becomes the string "!ExceptionName" so tests can assert contracts. */
export const OPS_SAFE = `
def run_ops_safe(cls, ops, params):
    out = []
    obj = None
    for op, args in zip(ops, params):
        try:
            if obj is None:
                obj = cls(*args)
                out.append(None)
            else:
                out.append(getattr(obj, op)(*args))
        except Exception as e:
            out.append('!' + type(e).__name__)
    return out
`;
