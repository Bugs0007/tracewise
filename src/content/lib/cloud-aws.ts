// Shared helpers for the AWS service units (M6): architecture-diagram panels,
// small caption/log/kv helpers, and the CIDR and wildcard maths several units use.
import type { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, GraphPanel, KVPanel, ListPanel, LogPanel, NotePanel, Panel, Scalar, Tone } from '@/engine/types';

export const SIM_NOTE = "A simplified model of the service's behaviour, not AWS itself. Real limits, timings and edge cases differ, and the practice code models the rules rather than calling any AWS API.";

export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Keep captions within the 90 character budget. */
export function cap(s: string): string {
  return s.length > 90 ? s.slice(0, 89) + '…' : s;
}

/** Record a frame with a length-safe caption. */
export function frame(r: Recorder, at: string | number | undefined, caption: string, panels: Panel[], vars: Record<string, unknown> = {}): void {
  r.step(at, cap(caption), panels, vars);
}

export interface ArchNode {
  id: string;
  label: string;
  x: number;
  y: number;
  shape?: GraphNode['shape'];
  w?: number;
  h?: number;
  sub?: string;
}

export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface ArchState {
  /** node id -> tone */
  tones?: Record<string, Tone>;
  /** node id -> small text under the node (queue depth, instance count ...) */
  badges?: Record<string, string>;
  /** node id -> sub label */
  subs?: Record<string, string>;
  /** edge key "from>to" that carries the request right now */
  flow?: string | null;
  /** edge key -> tone (the flow edge defaults to `active`) */
  edgeTones?: Record<string, Tone>;
  /** edge key -> label override */
  edgeLabels?: Record<string, string>;
}

/** Build an architecture diagram panel. Edges are directed; the active edge animates a token. */
export function arch(title: string, width: number, height: number, nodes: ArchNode[], edges: ArchEdge[], st: ArchState = {}): GraphPanel {
  const gn: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    x: n.x,
    y: n.y,
    shape: n.shape ?? 'rect',
    w: n.w,
    h: n.h,
    sub: st.subs?.[n.id] ?? n.sub,
    tone: st.tones?.[n.id] ?? 'default',
    badge: st.badges?.[n.id],
  }));
  const ge: GraphEdge[] = edges.map((e) => {
    const key = `${e.from}>${e.to}`;
    const on = st.flow === key;
    return {
      from: e.from,
      to: e.to,
      directed: true,
      dashed: e.dashed,
      label: st.edgeLabels?.[key] ?? e.label,
      tone: st.edgeTones?.[key] ?? (on ? 'active' : undefined),
      flow: on ? true : undefined,
    };
  });
  return { type: 'graph', title, nodes: gn, edges: ge, width, height };
}

export function logPanel(title: string, lines: { text: string; tone?: Tone }[], keep = 7): LogPanel {
  return { type: 'log', title, lines: lines.slice(-keep) };
}

export function kvPanel(title: string, entries: Record<string, Scalar>, tones: Record<string, Tone> = {}): KVPanel {
  return { type: 'kv', title, entries: Object.entries(entries).map(([k, v]) => ({ k, v, tone: tones[k] })) };
}

export function listPanel(title: string, labels: string[], tones: Record<number, Tone> = {}, subs: Record<number, string> = {}, emptyText = '(none)'): ListPanel {
  return {
    type: 'list',
    title,
    orientation: 'vertical',
    items: labels.map((label, i) => ({ id: `${i}:${label}`, label, tone: tones[i], sub: subs[i] })),
    emptyText,
  };
}

export function note(text: string, tone?: Tone): NotePanel {
  return { type: 'note', text, tone };
}

// ─── CIDR maths ─────────────────────────────────────────────────

export function ipToInt(ip: string): number {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) throw new Error(`"${ip}" is not an IPv4 address`);
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) throw new Error(`"${ip}" is not an IPv4 address`);
    n = n * 256 + Number(p);
  }
  return n;
}

export function parseCidr(c: string): { base: number; bits: number } {
  const [ip, b] = c.trim().split('/');
  const bits = Number(b);
  if (b === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error(`"${c}" is not a CIDR block like 10.0.0.0/16`);
  return { base: ipToInt(ip), bits };
}

/** Does `cidr` contain `ip`? Compares the leading `bits` bits by shifting the host part away. */
export function inCidr(cidr: string, ip: string): boolean {
  const { base, bits } = parseCidr(cidr);
  const shift = 32 - bits;
  return Math.floor(ipToInt(ip) / 2 ** shift) === Math.floor(base / 2 ** shift);
}

/** Independent formulation for references: compare binary-string prefixes. */
export function inCidrBinary(cidr: string, ip: string): boolean {
  const [b, bits] = cidr.split('/');
  const bin = (x: string) => x.split('.').map((o) => Number(o).toString(2).padStart(8, '0')).join('');
  const n = Number(bits);
  return bin(b).slice(0, n) === bin(ip).slice(0, n);
}

// ─── Wildcards ─────────────────────────────────────────────────

/** Glob match where `*` is any run of characters and `?` exactly one. Iterative with single-star backtracking. */
export function globMatch(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === text[t])) {
      p++;
      t++;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++;
      mark = t;
    } else if (star >= 0) {
      p = star + 1;
      t = ++mark;
    } else return false;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

/** Independent formulation for references: translate to a regular expression. */
export function globRegex(pattern: string, text: string): boolean {
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + re + '$', 's').test(text);
}

/** Deterministic toy hash (31-multiplier, 32-bit) used by the DynamoDB-style partitioner. */
export function hash31(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Hidden Python helper for tasks: `in_cidr(ip, cidr)` using shifts. */
export const CIDR_HARNESS = `
def in_cidr(ip, cidr):
    base, bits = cidr.split("/")
    shift = 32 - int(bits)
    def to_int(a):
        n = 0
        for part in a.split("."):
            n = n * 256 + int(part)
        return n
    return to_int(ip) >> shift == to_int(base) >> shift
`;
