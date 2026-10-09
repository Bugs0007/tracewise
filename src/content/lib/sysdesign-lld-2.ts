// Shared helpers for the second LLD batch (OOP principles, UML, DIP and the eight design patterns).
//  - scenarioViz: a participants diagram + running sequence/log/state, driven by a simulate() that returns "beats"
//  - Python harness snippets shared by several tasks
import { Recorder } from '@/engine/recorder';
import type { InputField, Panel, Scalar, SequenceMessage, Tone, VizDef } from '@/engine/types';
import { clip, designPanel, kv, log, type Design } from '@/content/lib/sysdesign-lld';

export interface Beat {
  /** code anchor the frame points at */
  at: string;
  caption: string;
  /** replaces the base diagram for this beat (dynamic diagrams) */
  design?: Design;
  tones?: Record<string, Tone>;
  edgeTones?: Record<string, Tone>;
  /** appended to the running sequence diagram */
  msg?: SequenceMessage;
  /** appended to the running log */
  log?: { text: string; tone?: Tone };
  state?: Record<string, Scalar>;
  stateTitle?: string;
  /** extra panels shown after the diagram */
  extra?: Panel[];
  vars?: Record<string, unknown>;
}

export interface Scenario<R> {
  beats: Beat[];
  result: R;
}

export interface ScenarioSpec<I, R> {
  id: string;
  title: string;
  code: string;
  design: Design;
  diagramTitle: string;
  size?: { width: number; height: number };
  /** when set, messages are drawn as a sequence diagram; otherwise only the log is shown */
  actors?: string[];
  sequenceTitle?: string;
  logTitle?: string;
  stateTitle?: string;
  inputs: InputField[];
  presets: { label: string; input: Partial<I> }[];
  simulate: (input: I) => Scenario<R>;
  reference: (input: I) => R;
}

export function scenarioViz<I, R>(spec: ScenarioSpec<I, R>): VizDef<I> {
  return {
    id: spec.id,
    title: spec.title,
    code: spec.code,
    language: 'python',
    inputs: spec.inputs,
    presets: spec.presets,
    run(input) {
      const sc = spec.simulate(input);
      const r = new Recorder(spec.code);
      const msgs: SequenceMessage[] = [];
      const lines: { text: string; tone?: Tone }[] = [];
      for (const b of sc.beats) {
        r.op();
        if (b.msg) msgs.push(b.msg);
        if (b.log) lines.push(b.log);
        const panels: Panel[] = [designPanel(spec.diagramTitle, b.design ?? spec.design, b.tones, b.edgeTones, spec.size)];
        if (spec.actors && msgs.length) {
          const shown = msgs.slice(-6);
          panels.push({ type: 'sequence', title: spec.sequenceTitle ?? 'Calls so far', actors: spec.actors, messages: shown, active: shown.length - 1 });
        }
        if (b.extra) panels.push(...b.extra);
        if (b.state) panels.push(kv(b.stateTitle ?? spec.stateTitle ?? 'State', b.state));
        if (lines.length) panels.push(log(spec.logTitle ?? 'Log', lines, 8));
        r.step(b.at, clip(b.caption), panels, b.vars ?? {});
      }
      return { frames: r.frames, result: sc.result };
    },
    reference: spec.reference,
  };
}

/** Throws a readable error for an unknown token in a strings input. */
export function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  const v = value.trim() as T;
  if (!allowed.includes(v)) throw new Error(`Unknown ${what} "${value}". Choose from: ${allowed.join(', ')}`);
  return v;
}

/** Splits "key:rest" on the first colon. */
export function splitEvent(raw: string): [string, string | undefined] {
  const i = raw.indexOf(':');
  if (i < 0) return [raw.trim().toLowerCase(), undefined];
  return [raw.slice(0, i).trim().toLowerCase(), raw.slice(i + 1).trim()];
}

// ───────────────────────── Python harness snippets ─────────────────────────

/** Calls fn(*args); an exception becomes the string "!ExceptionName". */
export const RUN_SAFE_FN = `
def run_safe_fn(fn, *args):
    try:
        return fn(*args)
    except Exception as e:
        return '!' + type(e).__name__
`;

/**
 * Fluent builders: run_chain(cls, init_args, calls). Each call is [name, *args].
 * Returns [every_non_build_call_returned_self, [results of build calls, "!Err" for failures]].
 */
export const RUN_CHAIN = `
def run_chain(cls, init, calls):
    obj = cls(*init)
    chained = True
    builds = []
    for name, *args in calls:
        try:
            r = getattr(obj, name)(*args)
        except Exception as e:
            if name == 'build':
                builds.append('!' + type(e).__name__)
            else:
                builds.append('!' + name + ':' + type(e).__name__)
            continue
        if name == 'build':
            builds.append(r)
        elif r is not obj:
            chained = False
    return [chained, builds]
`;
