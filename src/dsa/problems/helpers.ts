import type { VizDef } from '@/engine/types';
import type { CasesFile, PatternId, ProblemContent } from '@/dsa/types';

/** Build the "Type it yourself" task from a problem's shared cases file. */
export function taskFrom(cases: unknown, signature: string, harness?: string): ProblemContent['task'] {
  const c = cases as CasesFile;
  return { fnName: c.fn, signature, tests: c.cases, compare: c.compare, ...(harness ? { harness, adapter: 'adapter' } : {}) };
}

type Pair = [big: string, why: string];

/** A compact way to write a problem: flat keys, assembled into the full ProblemContent. */
export interface ProblemSpec {
  summary: string;
  /** [input, output, note?] in our own words and numbers */
  example: [string, string, string?];
  /** [answer, options (3-4), why, notes for specific wrong picks] */
  pattern: [PatternId, PatternId[], string, Record<PatternId, string>?];
  hints: string[];
  insight: string;
  brute: string;
  optimal: string;
  walk: string[];
  edge: string[];
  works: string[];
  time: Pair;
  space: Pair;
  solution: string;
  cases: unknown;
  /** what the learner starts from */
  sig: string;
  harness?: string;
  viz: VizDef<any>;
  fromArgs: ProblemContent['fromArgs'];
}

export function problem(s: ProblemSpec): ProblemContent {
  return {
    summary: s.summary,
    example: { input: s.example[0], output: s.example[1], note: s.example[2] },
    pattern: { answer: s.pattern[0], options: s.pattern[1], why: s.pattern[2], notes: s.pattern[3] },
    hints: s.hints,
    explanation: { insight: s.insight, brute: s.brute, optimal: s.optimal, walkthrough: s.walk, edgeCases: s.edge, whyItWorks: s.works },
    complexity: { time: { big: s.time[0], why: s.time[1] }, space: { big: s.space[0], why: s.space[1] } },
    solution: s.solution,
    task: taskFrom(s.cases, s.sig, s.harness),
    viz: s.viz as VizDef,
    fromArgs: s.fromArgs,
  };
}

/** A python visualizer whose code is the solution itself (so the executing line always matches). */
export function vizOf<I>(v: Omit<VizDef<I>, 'code' | 'language'> & { solution: string }): VizDef<I> {
  const { solution, ...rest } = v;
  return { ...rest, code: solution, language: 'python' };
}
