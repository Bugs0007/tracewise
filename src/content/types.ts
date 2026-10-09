// Declarative content schema. A unit is pure data plus a visualizer definition;
// the UI renders it, the runner checks it, and the content test-suite verifies
// that every solution passes, every bug fails, and every visualizer agrees
// with its reference implementation. See docs/CONTENT_SCHEMA.md.
import type { VizDef } from '@/engine/types';

export type Lang = 'python' | 'javascript' | 'typescript' | 'jsx';

export interface TestCase {
  args: unknown[];
  expected: unknown;
  /** short label shown in the results list */
  name?: string;
}

/**
 * exact     deep equality (default)
 * unordered top-level array order ignored
 * nested    order ignored at top level and in each inner array (subsets, groups)
 * float     numbers compared with 1e-6 tolerance (deep)
 */
export type CompareMode = 'exact' | 'unordered' | 'nested' | 'float';

/** A DOM interaction/assertion step for `jsx` tasks, run in the sandboxed iframe. */
export type ReactStep =
  | { click: string }
  | { type: string; value: string }
  | { expectText: string; in?: string }
  | { expectNoText: string; in?: string }
  | { expectCount: string; n: number }
  | { expectRenders: string; n: number };

export interface ReactTest {
  name: string;
  steps: ReactStep[];
}

export interface TaskBase {
  language: Lang;
  /** function / class / component the tests call */
  fnName: string;
  tests?: TestCase[];
  reactTests?: ReactTest[];
  compare?: CompareMode;
  /** hidden helper code prepended before the learner's code (e.g. ListNode) */
  harness?: string;
  /** name of a harness function called as adapter(fn, ...args) instead of fn(...args) */
  adapter?: string;
}

/** The typing ladder task. `solution` marks blanks with @@...@@. */
export interface PracticeTask extends TaskBase {
  /** one or two sentences: what to implement */
  statement: string;
  /** the first line(s) learners get at level 3, e.g. "def binary_search(nums, target):" */
  signature: string;
  /** reference solution; wrap level-1 blanks in @@ @@ */
  solution: string;
  /** optional explicit level-2 skeleton; otherwise lines containing blanks become TODO comments */
  skeleton?: string;
}

export interface DebugTask extends TaskBase {
  statement: string;
  /** realistic broken code; must FAIL at least one test */
  buggy: string;
  /** a corrected version; must PASS all tests */
  fixed: string;
  /** e.g. "off-by-one", "wrong base case", "stale closure" */
  bugType: string;
  hint: string;
  explanation: string;
}

export interface BossTask extends TaskBase {
  title: string;
  statement: string;
  starter: string;
  /** reference solution, shown only after the final hint */
  solution: string;
  /** [nudge, bigger hint]; the third tier reveals the solution */
  hints: [string, string];
  /** units whose ideas this combines (for the review queue / map) */
  combines?: string[];
}

export interface Question {
  prompt: string;
  code?: string;
  codeLang?: Lang | 'text';
  options: string[];
  answer: number;
  explain: string;
}

export interface Unit {
  id: string;
  /** one or two lines: why interviewers care */
  hook: string;
  /** asked before the visualizer is shown */
  predict: Question;
  viz: VizDef;
  /** overrides for the visualizer's default input */
  vizInput?: Record<string, unknown>;
  deeper?: {
    points: string[];
    complexity?: { time: string; space: string };
    pitfalls?: string[];
  };
  practice: PracticeTask;
  debug: DebugTask;
  boss: BossTask;
  /** extra short questions used by the review queue */
  quiz?: Question[];
  /** honest note shown when a concept is simulated (mini-Django, Next.js-style, mock LLM) */
  simulationNote?: string;
  /** an extra hands-on widget shown under the visualizer in the Watch step */
  interactive?: 'architect';
}
