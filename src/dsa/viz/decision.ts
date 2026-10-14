// "Decision step": the pattern for any if/else that moves a pointer or picks a side.
//
// A pointer moving is the result of a decision, not the decision itself. To make the
// "why" visible, a trace generator records the decision as its own frame, built from:
//
//   decisionView({ title, condition, expr, values, result, answer, keep, discard, verdict })
//        the test, the values it compares, whether it held, what it keeps and discards,
//        and one plain-language sentence.
//   roleTones(n, { window, ruler, compared, keep, discard })
//        array tones where a yardstick (ruler), a kept side and a discarded side look
//        different, so one colour never means two things.
//   valueRangeView(...)
//        a number line with the ruler's value range as a bar and the target as a marker.
//
// Recommended frame order for one loop iteration: [compute] -> [decide: set up the ruler]
// -> [decide: run the test] -> [apply: keep/discard, move the pointer]. Put the predict
// checkpoint on the frame BEFORE the answer is revealed, one per question, in that order.
import type { ArrayPanel, DecisionPanel, IntervalsPanel, Scalar, Tone } from '@/engine/types';
import { arrayView, intervalsView } from './prims';

export type DecisionStep = Omit<DecisionPanel, 'type'>;

/** Build the decision card. `result: null` shows the test before it is evaluated. */
export function decisionView(step: DecisionStep): DecisionPanel {
  return { type: 'decision', ...step, values: step.values.map((v) => ({ ...v })) };
}

/** A comparison chain with the values filled in: chain([3, 18, 12], ['<', '≤']) -> "3 < 18 ≤ 12". */
export function chain(values: readonly Scalar[], ops: readonly string[]): string {
  if (ops.length !== values.length - 1) throw new Error('chain: need one operator between each pair of values');
  return values.map((v, i) => (i < ops.length ? `${v} ${ops[i]}` : String(v))).join(' ');
}

export type Span = readonly [from: number, to: number];

export const isEmpty = (s: Span): boolean => s[0] > s[1];

/** "indices 4..6 (values 6, 9, 12)", or "nothing" for an empty span */
export function spanText(s: Span, values: readonly Scalar[]): string {
  if (isEmpty(s)) return 'nothing (that side is empty)';
  const vs = values.slice(s[0], s[1] + 1);
  return `indices ${s[0]}..${s[1]} (value${vs.length > 1 ? 's' : ''} ${vs.join(', ')})`;
}

export interface RoleOpts {
  /** cells outside this inclusive span are already out of play: muted */
  window?: Span;
  /** the yardstick used to run a test: dashed outline */
  ruler?: Span;
  /** the cells whose values were actually compared: highlighted on top of the ruler */
  compared?: readonly number[];
  /** the side that stays: solid fill */
  keep?: Span;
  /** the side that goes: faded and struck through */
  discard?: Span;
}

/** Array tones for a decision. Later roles win: window < ruler < keep/discard < compared. */
export function roleTones(n: number, o: RoleOpts): Record<number, Tone> {
  const tones: Record<number, Tone> = {};
  const paint = (s: Span | undefined, tone: Tone) => {
    if (!s) return;
    for (let i = Math.max(0, s[0]); i <= Math.min(n - 1, s[1]); i++) tones[i] = tone;
  };
  if (o.window) for (let i = 0; i < n; i++) if (i < o.window[0] || i > o.window[1]) tones[i] = 'muted';
  paint(o.ruler, 'ruler');
  paint(o.keep, 'keep');
  paint(o.discard, 'discard');
  for (const i of o.compared ?? []) if (i >= 0 && i < n) tones[i] = 'compare';
  return tones;
}

/**
 * A number line for a value-range test: the ruler's range as a dashed bar, the target as a marker.
 * The axis always reaches the target, so a target outside the bar is obvious at a glance.
 * `inside: null` draws the marker neutral (the test has not been run yet).
 */
export function valueRangeView(o: { range: readonly [number, number]; target: number; inside: boolean | null; title?: string; rangeLabel?: string; targetLabel?: string; also?: readonly number[] }): IntervalsPanel {
  const [a, b] = o.range;
  const all = [a, b, o.target, ...(o.also ?? [])];
  const pad = Math.max(1, Math.round((Math.max(...all) - Math.min(...all)) * 0.06));
  const mark = o.targetLabel ?? `target ${o.target}`;
  return intervalsView([{ start: a, end: b, label: o.rangeLabel ?? `${a} … ${b}`, tone: 'ruler' }], {
    title: o.title ?? 'Value range of the sorted half',
    min: Math.floor(Math.min(...all)) - pad,
    max: Math.ceil(Math.max(...all)) + pad,
    marks: [{ at: o.target, label: o.inside === null ? mark : `${mark} ${o.inside ? '✓ inside' : '✗ outside'}`, tone: o.inside === null ? 'active' : o.inside ? 'keep' : 'compare' }],
  });
}

/** An array panel in decision mode: roles from `roleTones`, optional bracket around one span. */
export function roleArray(values: readonly Scalar[], o: RoleOpts & { title?: string; pointers?: Record<string, number>; bars?: boolean; bracket?: { span: Span; label: string; tone?: Tone } }): ArrayPanel {
  const { title, pointers, bracket, bars, ...roles } = o;
  return arrayView(values, {
    title,
    bars,
    tones: roleTones(values.length, roles),
    pointers,
    window: bracket && !isEmpty(bracket.span) ? { from: bracket.span[0], to: bracket.span[1], label: bracket.label, tone: bracket.tone } : undefined,
  });
}
