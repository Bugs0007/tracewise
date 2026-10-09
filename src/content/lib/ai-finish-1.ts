// Shared helpers for the finishing batch of AI units: attention, RAG pipeline stages and the
// LangGraph-style units. Everything is deterministic; nothing calls a real model.
import type { GraphPanel, GridPanel, Tone } from '@/engine/types';
import { DOCS, tfVec, cosine, terms, type Doc, type Vec } from '@/content/lib/ai-rag2-langgraph';

export { SIM_NOTE, LG_NOTE, r2, r3, r4, kvPanel, logPanel, stateKv, changedKeys, showState, flowPanel, lineNodes, rankDocs, DOC_BY_ID, PY_DOCS } from '@/content/lib/ai-rag2-langgraph';
export type { FlowNode, FlowEdge, FlowState } from '@/content/lib/ai-rag2-langgraph';

/** Heat-map grid: values are shown and coloured by magnitude. */
export function heatGrid(title: string, cells: number[][], rowLabels: string[], colLabels: string[], tones: Record<string, Tone> = {}): GridPanel {
  return { type: 'grid', title, cells, rowLabels, colLabels, heat: true, tones };
}

export function softmax(xs: number[]): number[] {
  if (!xs.length) return [];
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / t);
}

/** Metadata attached to each support-centre document (used by the index and failure units). */
export const DOC_META: Record<string, { topic: string; lang: string }> = {
  d1: { topic: 'billing', lang: 'en' },
  d2: { topic: 'shipping', lang: 'en' },
  d3: { topic: 'account', lang: 'en' },
  d4: { topic: 'account', lang: 'en' },
  d5: { topic: 'returns', lang: 'en' },
  d6: { topic: 'returns', lang: 'en' },
  d7: { topic: 'billing', lang: 'en' },
  d8: { topic: 'shipping', lang: 'en' },
};

export const topTerms = (v: Vec, n = 3): string => [...v.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([t]) => t).join(' ');

export { DOCS, tfVec, cosine, terms };
export type { Doc, Vec };

/** Python source for a small hidden corpus with metadata, used by several RAG tasks. */
export const PY_CORPUS =
  'CORPUS = ' +
  JSON.stringify(DOCS.map((d) => ({ id: d.id, text: d.text, topic: DOC_META[d.id].topic }))) +
  '\n';

export type { GraphPanel };

/** FNV-1a hash of a string, reduced to `mod` buckets. */
function fnv(s: string, mod: number): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return x % mod;
}

/** A toy embedding for the visualizers: hashed bag of words, unit length. Python tasks use minillm.embed. */
export function toyEmbed(text: string, dim = 32): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const t of terms(text)) v[fnv(t, dim)] += 1;
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}

export const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0);

// Concept map: a stand-in for "the model knows refund and reimbursed mean the same thing".
export const CONCEPTS: [string, RegExp][] = [
  ['REFUND', /^(refund|return|reimburs|money|back|price)/],
  ['DELIVERY', /^(deliver|arriv|ship|packag|parcel|track|warehouse)/],
  ['ACCESS', /^(password|reset|sign|login|locked|account|authent|code)/],
  ['WARRANTY', /^(warrant|repair|replac|defect|hardware)/],
  ['BILLING', /^(invoice|billing|bill|month)/],
  ['GIFT', /^(gift|card)/],
];

export const conceptOf = (term: string): string | undefined => CONCEPTS.find(([, re]) => re.test(term))?.[0];

/**
 * A mock cross-encoder: it reads query and document together. Every query term earns 1 point for an
 * exact match in the document, 0.7 for a related concept, and the sum is divided by the number of terms.
 */
export function crossScore(query: string, doc: string): number {
  const q = [...new Set(terms(query))];
  if (!q.length) return 0;
  const dt = terms(doc);
  const dc = new Set(dt.map(conceptOf).filter(Boolean));
  let s = 0;
  for (const t of q) {
    if (dt.includes(t)) s += 1;
    else if (conceptOf(t) && dc.has(conceptOf(t))) s += 0.7;
  }
  return s / q.length;
}

// ---------------------------------------------------------------------------------------------
// RAG failure traces: one recorded pipeline run per failure mode (shared by the viz and the tasks)
// ---------------------------------------------------------------------------------------------
export interface TraceChunk {
  id: string;
  text: string;
  version: string;
  score: number;
}

export interface RagTrace {
  question: string;
  gold: string;
  index_model: string;
  query_model: string;
  want: Record<string, string> | null;
  filter: Record<string, string> | null;
  chunks: TraceChunk[];
  context_tokens: number;
  budget: number;
  answer: string;
  citations: string[];
}

const RETURN_TEXT = 'Items can be returned within 30 days and the purchase price is reimbursed to the original payment method.';
const HEALTHY: RagTrace = {
  question: 'How many days do I have to return an item?',
  gold: '30 days',
  index_model: 'embed-v2',
  query_model: 'embed-v2',
  want: null,
  filter: null,
  chunks: [
    { id: 'd5', text: RETURN_TEXT, version: 'v2', score: 0.71 },
    { id: 'd6', text: 'Hardware defects are repaired or replaced for 24 months after delivery under the warranty.', version: 'v2', score: 0.35 },
  ],
  context_tokens: 480,
  budget: 4096,
  answer: 'You can return items within 30 days. [d5]',
  citations: ['d5'],
};

export const TRACE_LABELS = ['healthy', 'answer split by chunking', 'wrong embedding model', 'missing metadata filter', 'context stuffing', 'hallucinated citation', 'nothing relevant retrieved', 'model ignores the evidence'] as const;

export const RAG_TRACES: Record<string, RagTrace> = {
  healthy: HEALTHY,
  'answer split by chunking': {
    ...HEALTHY,
    chunks: [
      { id: 'd5a', text: 'Items can be returned within 30 ', version: 'v2', score: 0.66 },
      { id: 'd5b', text: 'days and the purchase price is reimbursed to the original payment method.', version: 'v2', score: 0.52 },
    ],
    answer: 'I could not find how long the return window is.',
    citations: [],
  },
  'wrong embedding model': {
    ...HEALTHY,
    index_model: 'embed-small-v1',
    query_model: 'embed-large-v2',
    chunks: [
      { id: 'd7', text: 'Invoices are generated on the first of each month and can be downloaded from the billing page.', version: 'v2', score: 0.08 },
      { id: 'd1', text: 'Gift cards never expire and can be applied at checkout to any order.', version: 'v2', score: 0.06 },
    ],
    answer: 'Invoices are generated on the first of each month. [d7]',
    citations: ['d7'],
  },
  'missing metadata filter': {
    ...HEALTHY,
    want: { version: 'v2' },
    filter: null,
    chunks: [
      { id: 'd5-old', text: 'Items can be returned within 14 days and the purchase price is reimbursed to the original payment method.', version: 'v1', score: 0.82 },
      { id: 'd5', text: RETURN_TEXT, version: 'v2', score: 0.8 },
    ],
    answer: 'Returns are accepted within 14 days. [d5-old]',
    citations: ['d5-old'],
  },
  'context stuffing': {
    ...HEALTHY,
    chunks: [
      { id: 'c1', text: 'Gift cards never expire and can be applied at checkout to any order.', version: 'v2', score: 0.4 },
      { id: 'c2', text: 'Standard delivery takes 3 to 5 business days and express delivery arrives the next day.', version: 'v2', score: 0.38 },
      { id: 'c3', text: 'Two-factor authentication adds a one-time code at sign-in to protect your account.', version: 'v2', score: 0.37 },
      { id: 'c4', text: RETURN_TEXT, version: 'v2', score: 0.36 },
      { id: 'c5', text: 'Invoices are generated on the first of each month and can be downloaded from the billing page.', version: 'v2', score: 0.35 },
      { id: 'c6', text: 'A tracking number is emailed once your package leaves the warehouse so you can follow the parcel.', version: 'v2', score: 0.33 },
    ],
    context_tokens: 6200,
    answer: 'The provided documents do not say how long returns are accepted.',
    citations: [],
  },
  'hallucinated citation': { ...HEALTHY, answer: 'You can return items within 30 days. [d12]', citations: ['d12'] },
  'nothing relevant retrieved': {
    ...HEALTHY,
    chunks: [
      { id: 'd7', text: 'Invoices are generated on the first of each month and can be downloaded from the billing page.', version: 'v2', score: 0.12 },
      { id: 'd1', text: 'Gift cards never expire and can be applied at checkout to any order.', version: 'v2', score: 0.1 },
    ],
    answer: 'I am not sure about the return window.',
    citations: [],
  },
  'model ignores the evidence': { ...HEALTHY, answer: 'Returns are accepted within 90 days. [d5]' },
};

// ---------------------------------------------------------------------------------------------
// Python harness shared by the LangGraph tasks: a tiny node library, so tests can pass plain JSON
// ---------------------------------------------------------------------------------------------
export const PY_LG_NODES = `import copy

END = "END"

def _upper(s):
    return {"text": s["text"].upper()}

def _exclaim(s):
    return {"text": s["text"] + "!"}

def _count(s):
    return {"length": len(s["text"])}

def _tag(s):
    return {"tags": s.get("tags", []) + [s["text"][:1]]}

def _sneaky(s):
    s["text"] = "MUTATED"
    return {"seen": True}

NODE_LIB = {"upper": _upper, "exclaim": _exclaim, "count": _count, "tag": _tag, "sneaky": _sneaky}
`;
