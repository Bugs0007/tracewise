import type { Frame, Panel, PredictCheckpoint, Scalar } from './types';

const ANCHOR_RE = /\s*(?:#|\/\/)@([\w-]+)\s*$/;

/** Strip `#@anchor` / `//@anchor` markers and return the clean code plus anchor -> line map. */
export function parseAnchors(code: string): { clean: string; anchors: Record<string, number> } {
  const anchors: Record<string, number> = {};
  const lines = code.replace(/\r\n/g, '\n').replace(/^\n+|\s+$/g, '').split('\n');
  const out = lines.map((line, i) => {
    const m = line.match(ANCHOR_RE);
    if (!m) return line;
    anchors[m[1]] = i + 1;
    return line.slice(0, m.index).replace(/\s+$/, '');
  });
  return { clean: out.join('\n'), anchors };
}

const MAX_FRAMES = 1500;

/**
 * Records frames while an algorithm runs. Generators call `step()` at
 * interesting moments; panels and vars are deep-cloned so later mutation of
 * the algorithm's own state never rewrites history.
 */
export class Recorder {
  readonly frames: Frame[] = [];
  readonly anchors: Record<string, number>;
  ops = 0;
  truncated = false;

  constructor(code: string) {
    this.anchors = parseAnchors(code).anchors;
  }

  /** count an elementary operation (comparison, write, visit) */
  op(n = 1): void {
    this.ops += n;
  }

  line(at: string | number | undefined): number {
    if (at === undefined) return 0;
    if (typeof at === 'number') return at;
    const l = this.anchors[at];
    if (l === undefined) throw new Error(`Unknown code anchor "${at}"`);
    return l;
  }

  /** attach an authored predict-the-next-step checkpoint to the frame recorded last */
  attachPredict(p: PredictCheckpoint): void {
    const f = this.frames[this.frames.length - 1];
    if (f) f.predict = p;
  }

  step(at: string | number | undefined, caption: string, panels: Panel[], vars: Record<string, unknown> = {}): void {
    if (this.frames.length >= MAX_FRAMES) {
      this.truncated = true;
      return;
    }
    this.frames.push({
      line: this.line(at),
      caption,
      panels: structuredClone(panels),
      vars: normaliseVars(vars),
      ops: this.ops,
    });
  }
}

export function fmt(v: unknown): Scalar {
  if (v === null || v === undefined) return v === null ? null : 'None';
  if (typeof v === 'number') return Number.isFinite(v) ? v : v > 0 ? '∞' : '-∞';
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  try {
    const s = JSON.stringify(v, (_k, x) => (x instanceof Set ? [...x] : x instanceof Map ? Object.fromEntries(x) : x === Infinity ? '∞' : x));
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  } catch {
    return String(v);
  }
}

function normaliseVars(vars: Record<string, unknown>): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = fmt(v);
  return out;
}
