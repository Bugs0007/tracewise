// Shared helpers for the M6 "cloud & devops" units (devops-net batch): caption
// guard, sequence-diagram builder, small panel builders, and the service
// catalogue used by cloud-scenarios (plus its Python twin for hidden harnesses).
import type { Recorder } from '@/engine/recorder';
import type { KVPanel, ListItem, ListPanel, LogPanel, Panel, Scalar, SequenceMessage, SequencePanel, Tone } from '@/engine/types';

/** Keep captions short and on one line. */
export const cap = (s: string, n = 90): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');

/** Recorder.step with the caption length guard applied. */
export function step(r: Recorder, at: string | number | undefined, caption: string, panels: Panel[], vars: Record<string, unknown> = {}): void {
  r.step(at, cap(caption), panels, vars);
}

export const short = (s: string, n = 14): string => (s.length <= n ? s : s.slice(0, n) + '…');

export function kv(title: string, entries: Record<string, Scalar>, tones: Record<string, Tone> = {}): KVPanel {
  return { type: 'kv', title, entries: Object.entries(entries).map(([k, v]) => ({ k, v, tone: tones[k] })) };
}

export function log(title: string, lines: { text: string; tone?: Tone }[], keep = 8): LogPanel {
  return { type: 'log', title, lines: lines.slice(-keep) };
}

export function list(title: string, items: ListItem[], opts: Partial<ListPanel> = {}): ListPanel {
  return { type: 'list', title, items, orientation: 'vertical', ...opts };
}

/** Sequence-diagram builder: push messages, then take a panel snapshot. */
export class Seq {
  readonly messages: SequenceMessage[] = [];
  constructor(
    readonly actors: string[],
    readonly title?: string,
  ) {}

  send(from: string, to: string, label: string, tone?: Tone, dashed = false): number {
    this.messages.push({ from, to, label, tone, dashed });
    return this.messages.length - 1;
  }

  panel(): SequencePanel {
    return { type: 'sequence', title: this.title, actors: this.actors, messages: this.messages.map((m) => ({ ...m })), active: this.messages.length - 1 };
  }
}

// ───────────────────────── service catalogue (cloud-scenarios) ─────────────────────────

export interface Service {
  name: string;
  tags: string[];
  cost: number;
}

export const CATALOGUE: Service[] = [
  { name: 'Lambda', tags: ['serverless', 'event-driven', 'short-tasks', 'pay-per-use', 'auto-scale'], cost: 2 },
  { name: 'EC2', tags: ['vm', 'long-running', 'custom-os', 'gpu', 'steady-load'], cost: 5 },
  { name: 'Fargate', tags: ['containers', 'long-running', 'serverless', 'auto-scale'], cost: 4 },
  { name: 'S3', tags: ['object-storage', 'static-hosting', 'durable', 'pay-per-use'], cost: 1 },
  { name: 'DynamoDB', tags: ['nosql', 'key-value', 'low-latency', 'serverless', 'auto-scale', 'pay-per-use'], cost: 3 },
  { name: 'RDS', tags: ['relational', 'sql', 'transactions', 'managed'], cost: 4 },
  { name: 'SQS', tags: ['queue', 'async', 'decoupling', 'durable', 'serverless'], cost: 1 },
  { name: 'SNS', tags: ['pubsub', 'fan-out', 'async', 'serverless'], cost: 1 },
  { name: 'CloudFront', tags: ['cdn', 'global', 'caching', 'static-hosting'], cost: 2 },
  { name: 'ElastiCache', tags: ['cache', 'in-memory', 'low-latency', 'key-value'], cost: 3 },
];

export interface Requirements {
  must: string[];
  nice: string[];
  avoid: string[];
}

/** Independent TS twin of the Python recommend(): returns surviving service names, best first. */
export function recommendTs(catalogue: Service[], req: Requirements): string[] {
  const rows = catalogue
    .filter((s) => req.must.every((m) => s.tags.includes(m)) && !req.avoid.some((a) => s.tags.includes(a)))
    .map((s) => ({ s, score: req.nice.filter((n) => s.tags.includes(n)).length }));
  rows.sort((a, b) => b.score - a.score || a.s.cost - b.s.cost || (a.s.name < b.s.name ? -1 : a.s.name > b.s.name ? 1 : 0));
  return rows.map((x) => x.s.name);
}

/** Reference Python recommend(), shared as a hidden helper by the cloud-scenarios boss. */
export const RECOMMEND_PY = `
def recommend(catalogue, requirements):
    must = requirements.get("must", [])
    nice = requirements.get("nice", [])
    avoid = requirements.get("avoid", [])
    rows = []
    for svc in catalogue:
        tags = svc["tags"]
        if not all(m in tags for m in must):
            continue
        if any(a in tags for a in avoid):
            continue
        score = len([n for n in nice if n in tags])
        rows.append((-score, svc["cost"], svc["name"]))
    rows.sort()
    return [name for _, _, name in rows]
`;

/** Octal helpers shared by linux-basics (TS side). */
export const BITS = ['r', 'w', 'x'] as const;
