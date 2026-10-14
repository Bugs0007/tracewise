import { LESSONS } from './curriculum';

export const STORAGE_KEY = 'tracewise:ai-field-guide:v1';
export interface Practice { practiced?: string; confidence?: 'revisit' | 'steady' | 'strong'; due?: string; note?: string }
export interface GuideProgress { lessons: Record<string, Practice>; last?: string; path: 'full' | 'sprint' }
export const emptyProgress = (): GuideProgress => ({ lessons: {}, path: 'full' });

export function readProgress(): GuideProgress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return emptyProgress();
    const value = raw as Partial<GuideProgress>;
    const lessons: Record<string, Practice> = {};
    for (const lesson of LESSONS) {
      const p = value.lessons?.[lesson.id];
      if (!p || typeof p !== 'object') continue;
      lessons[lesson.id] = {
        practiced: typeof p.practiced === 'string' && Number.isFinite(Date.parse(p.practiced)) ? p.practiced : undefined,
        due: typeof p.due === 'string' && Number.isFinite(Date.parse(p.due)) ? p.due : undefined,
        confidence: ['revisit', 'steady', 'strong'].includes(p.confidence ?? '') ? p.confidence : undefined,
        note: typeof p.note === 'string' ? p.note.slice(0, 6000) : undefined,
      };
    }
    return { lessons, path: value.path === 'sprint' ? 'sprint' : 'full', last: LESSONS.some((l) => l.id === value.last) ? value.last : undefined };
  } catch { return emptyProgress(); }
}

export function reviewed(practice: Practice, confidence: NonNullable<Practice['confidence']>, now = new Date()): Practice {
  const days = confidence === 'revisit' ? 0 : confidence === 'steady' ? 1 : 3;
  return { ...practice, practiced: now.toISOString(), confidence, due: new Date(now.getTime() + days * 86_400_000).toISOString() };
}
export function dueLessons(progress: GuideProgress, now = Date.now()) {
  return LESSONS.filter((l) => progress.lessons[l.id]?.practiced && Date.parse(progress.lessons[l.id].due ?? '') <= now);
}

export function distribution(logits: number[], temperature: number): number[] {
  if (temperature <= 0) return logits.map((_, i) => i === logits.indexOf(Math.max(...logits)) ? 1 : 0);
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp((z - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}
export function nucleus(probabilities: number[], p: number): number[] {
  const sorted = probabilities.map((prob, index) => ({ prob, index })).sort((a, b) => b.prob - a.prob);
  const indices: number[] = [];
  let mass = 0;
  for (const item of sorted) {
    if (mass + Number.EPSILON >= p && indices.length > 0) break;
    indices.push(item.index); mass += item.prob;
  }
  return probabilities.map((v, i) => indices.includes(i) ? v / mass : 0);
}
export function cosine(a: number[], b: number[]): number {
  const denom = Math.hypot(...a) * Math.hypot(...b);
  return denom ? a.reduce((s, x, i) => s + x * b[i], 0) / denom : 0;
}
export function confusion(threshold: number, cases: { score: number; positive: boolean }[]) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const c of cases) {
    if (c.score >= threshold) { if (c.positive) tp++; else fp++; }
    else if (c.positive) fn++; else tn++;
  }
  return { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null };
}
export const tokenCost = (input: number, output: number, inputRate: number, outputRate: number, calls = 1) => (input * inputRate + output * outputRate) * calls / 1_000_000;

export const RETRIEVAL_DOCS = [
  { id: 'current', title: 'Current refund policy', text: 'Returns are eligible within 30 days. Keep the receipt.', lexical: 0.5, dense: 0.96, relevant: true },
  { id: 'exception', title: 'Opened-device exception', text: 'Opened devices are eligible only if defective; proof of purchase is required.', lexical: 0.3, dense: 0.85, relevant: true },
  { id: 'code', title: 'Error NX-401', text: 'NX-401 is a payment authorization failure. Retry after checking card details.', lexical: 0.95, dense: 0.35, relevant: false },
  { id: 'shipping', title: 'Shipping guide', text: 'Delivery usually takes 3–5 business days.', lexical: 0.1, dense: 0.25, relevant: false },
];
