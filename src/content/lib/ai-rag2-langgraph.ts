// Shared helpers for the RAG (fusion, HyDE, context, evaluation, failures) and LangGraph units.
// Everything here is deterministic. The "embeddings" used by visualizers are plain bag-of-words
// vectors computed in TypeScript; they illustrate the ideas, they are not a real model.
import type { GraphEdge, GraphNode, GraphPanel, KVPanel, LogPanel, Scalar, Tone } from '@/engine/types';

export const SIM_NOTE = 'deterministic mock models; no real LLM is called';
export const LG_NOTE = 'a tiny pure-Python re-implementation of the LangGraph ideas; the real library is not used';

export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const r3 = (n: number): number => Math.round(n * 1000) / 1000;
export const r4 = (n: number): number => Math.round(n * 10000) / 10000;

export function kvPanel(title: string, entries: Record<string, unknown>, tones: Record<string, Tone> = {}): KVPanel {
  return {
    type: 'kv',
    title,
    entries: Object.entries(entries).map(([k, v]) => ({ k, v: scalar(v), tone: tones[k] })),
  };
}

export function logPanel(title: string, lines: { text: string; tone?: Tone }[], keep = 8): LogPanel {
  return { type: 'log', title, lines: lines.slice(-keep) };
}

export function scalar(v: unknown): Scalar {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------------------------
// Tokenizer: a TypeScript port of minillm.tokenize (words > 4 letters are cut into 4-letter pieces)
// ---------------------------------------------------------------------------------------------
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const w of text.match(/[A-Za-z]+|\d+|[^\sA-Za-z\d]/g) ?? []) {
    if (/^[A-Za-z]+$/.test(w) && w.length > 4) {
      const pieces: string[] = [];
      for (let j = 0; j < w.length; j += 4) pieces.push(w.slice(j, j + 4));
      out.push(pieces[0]);
      for (const p of pieces.slice(1)) out.push('##' + p);
    } else out.push(w);
  }
  return out;
}

export const countTokens = (text: string): number => tokenize(text).length;

// ---------------------------------------------------------------------------------------------
// Bag-of-words vectors for the retrieval demos
// ---------------------------------------------------------------------------------------------
const STOP = new Set(
  'a an the and or of to in on at for from with by is are was were be been it its this that these those i my me you your we our do does did can how what when why which who not no as if so than then there here will would should could has have had into out up'.split(' '),
);

/** Lowercase words without stop words, with a very light stemmer so "emailed" ~ "email". */
export function terms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  return words
    .filter((w) => !STOP.has(w))
    .map((w) => {
      if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
      if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
      return w;
    });
}

export type Vec = Map<string, number>;

export function tfVec(text: string): Vec {
  const m: Vec = new Map();
  for (const t of terms(text)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const w = b.get(k);
    if (w) dot += v * w;
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---------------------------------------------------------------------------------------------
// A tiny support-centre corpus used by several RAG visualizers
// ---------------------------------------------------------------------------------------------
export interface Doc {
  id: string;
  text: string;
  /** schematic 2-D map position (0..400) */
  x: number;
  y: number;
}

export const DOCS: Doc[] = [
  { id: 'd1', text: 'Gift cards never expire and can be applied at checkout to any order.', x: 120, y: 120 },
  { id: 'd2', text: 'Standard delivery takes 3 to 5 business days and express delivery arrives the next day.', x: 310, y: 70 },
  { id: 'd3', text: 'To reset a password choose Forgot password on the sign-in page and a reset link is emailed to you.', x: 80, y: 310 },
  { id: 'd4', text: 'Two-factor authentication adds a one-time code at sign-in to protect your account.', x: 150, y: 345 },
  { id: 'd5', text: 'Items can be returned within 30 days and the purchase price is reimbursed to the original payment method.', x: 60, y: 60 },
  { id: 'd6', text: 'Hardware defects are repaired or replaced for 24 months after delivery under the warranty.', x: 320, y: 320 },
  { id: 'd7', text: 'Invoices are generated on the first of each month and can be downloaded from the billing page.', x: 130, y: 40 },
  { id: 'd8', text: 'A tracking number is emailed once your package leaves the warehouse so you can follow the parcel.', x: 350, y: 120 },
];

export const DOC_BY_ID: Record<string, Doc> = Object.fromEntries(DOCS.map((d) => [d.id, d]));

export interface Ranked {
  id: string;
  score: number;
}

/** Rank documents by cosine similarity to a vector; ties break by id so results are stable. */
export function rankDocs(q: Vec, docs: Doc[] = DOCS): Ranked[] {
  return docs
    .map((d) => ({ id: d.id, score: cosine(q, tfVec(d.text)) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// LangGraph-style flow diagrams
// ---------------------------------------------------------------------------------------------
export interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  sub?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  curve?: number;
}

export interface FlowState {
  /** node currently running */
  active?: string;
  /** nodes that already ran */
  done?: string[];
  /** node the graph is paused in front of */
  paused?: string;
  /** node that failed */
  failed?: string;
  /** edge just followed */
  taken?: [string, string];
  /** nodes that have a checkpoint written after them */
  saved?: string[];
  /** badges shown under nodes */
  badges?: Record<string, string>;
}

export function flowPanel(title: string, nodes: FlowNode[], edges: FlowEdge[], st: FlowState = {}, size = { width: 560, height: 220 }): GraphPanel {
  const done = new Set(st.done ?? []);
  const saved = new Set(st.saved ?? []);
  const gn: GraphNode[] = nodes.map((n) => {
    const terminal = n.id === 'START' || n.id === 'END';
    let tone: Tone = terminal ? 'muted' : 'default';
    if (done.has(n.id)) tone = 'visited';
    if (st.paused === n.id) tone = 'compare';
    if (st.active === n.id) tone = 'active';
    if (st.failed === n.id) tone = 'error';
    if (n.id === 'END' && done.has('END')) tone = 'done';
    return {
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      shape: terminal ? 'circle' : 'pill',
      w: terminal ? undefined : 96,
      h: terminal ? undefined : 36,
      tone,
      sub: n.sub,
      badge: st.badges?.[n.id] ?? (saved.has(n.id) ? 'saved' : undefined),
    };
  });
  const ge: GraphEdge[] = edges.map((e) => {
    const taken = st.taken && st.taken[0] === e.from && st.taken[1] === e.to;
    return { from: e.from, to: e.to, label: e.label, dashed: e.dashed, curve: e.curve, directed: true, tone: taken ? 'path' : undefined, flow: taken || undefined };
  });
  return { type: 'graph', title, nodes: gn, edges: ge, directed: true, width: size.width, height: size.height };
}

/** Evenly spaced nodes along one row, START first and END last. */
export function lineNodes(labels: [string, string][], y = 110, width = 560): FlowNode[] {
  const all: [string, string][] = [['START', 'START'], ...labels, ['END', 'END']];
  const gap = (width - 60) / (all.length - 1);
  return all.map(([id, label], i) => ({ id, label, x: 30 + gap * i, y }));
}

/** Python source that defines DOCS (list of {"id","text"}) and DIM for tasks that retrieve. */
export const PY_DOCS = 'DIM = 64\nDOCS = ' + JSON.stringify(DOCS.map((d) => ({ id: d.id, text: d.text }))) + '\n';

export interface HydeCase {
  label: string;
  question: string;
  /** what the mock LLM "writes" as a hypothetical answer */
  hypo: string;
  gold: string;
}

export const HYDE_CASES: HydeCase[] = [
  {
    label: 'money back',
    question: 'How do I get my money back?',
    hypo: 'Customers can return their items within 30 days and the purchase price is reimbursed to the original payment method as a refund.',
    gold: 'd5',
  },
  {
    label: 'package missing',
    question: "My package hasn't shown up, what now?",
    hypo: 'Check the tracking number that was emailed when the package left the warehouse and follow the parcel; standard delivery takes 3 to 5 business days.',
    gold: 'd8',
  },
  {
    label: 'locked out',
    question: "I can't get in to my account",
    hypo: 'Choose Forgot password on the sign-in page and a reset link is emailed to you so you can set a new password.',
    gold: 'd3',
  },
  {
    label: 'warranty (bad hypothesis)',
    question: 'How long is the warranty?',
    hypo: 'Standard delivery takes 3 to 5 business days and express delivery arrives the next day.',
    gold: 'd6',
  },
];

/** Compact JSON for state panels. */
export function showState(s: Record<string, unknown>): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(s)) out[k] = scalar(Array.isArray(v) || (v && typeof v === 'object') ? JSON.stringify(v) : v);
  return out;
}

/** Keys whose value differs between two states (for highlighting what a node changed). */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

export function stateKv(title: string, state: Record<string, unknown>, changed: string[] = []): KVPanel {
  const tones: Record<string, Tone> = {};
  for (const k of changed) tones[k] = 'new';
  return kvPanel(title, showState(state), tones);
}
