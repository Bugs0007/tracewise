// Types for the NeetCode 150 track. A problem is data (this file's shapes) plus a
// trace generator (a VizDef from the shared visualizer engine).
import type { VizDef } from '@/engine/types';
import type { CompareMode, TestCase } from '@/content/types';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type TopicId =
  | 'arrays-hashing'
  | 'two-pointers'
  | 'sliding-window'
  | 'stack'
  | 'binary-search'
  | 'linked-list'
  | 'trees'
  | 'tries'
  | 'heap'
  | 'backtracking'
  | 'graphs'
  | 'advanced-graphs'
  | 'dp-1d'
  | 'dp-2d'
  | 'greedy'
  | 'intervals'
  | 'math-geometry'
  | 'bit-manipulation';

export type PatternId = string;

export interface ProblemMeta {
  /** LeetCode slug; unique across the 150 */
  id: string;
  /** 1..150, NeetCode order */
  n: number;
  title: string;
  topic: TopicId;
  difficulty: Difficulty;
  patterns: PatternId[];
  leetcode: string;
  /** premium problems: a free equivalent */
  free?: { label: string; url: string };
}

export interface TopicMeta {
  id: TopicId;
  title: string;
  /** one line for the index */
  blurb: string;
}

export interface Pattern {
  id: PatternId;
  label: string;
  /** what this pattern is, in a sentence; shown as feedback in "Spot the pattern" */
  blurb: string;
}

export interface ProblemContent {
  /** 2-3 sentences in our own words */
  summary: string;
  /** a small example of our own (not the original statement's) */
  example: { input: string; output: string; note?: string };
  pattern: {
    answer: PatternId;
    options: PatternId[];
    why: string;
    /** feedback for specific wrong picks, e.g. a technique that also works but is not the pattern being taught */
    notes?: Record<PatternId, string>;
  };
  /** 2-3 progressive hints */
  hints: string[];
  explanation: {
    insight: string;
    brute: string;
    optimal: string;
    walkthrough: string[];
    edgeCases: string[];
    whyItWorks: string[];
  };
  complexity: { time: { big: string; why: string }; space: { big: string; why: string } };
  /** the Python solution including #@anchor markers (use parseAnchors(...).clean for display) */
  solution: string;
  task: {
    fnName: string;
    /** what the learner starts from in "Type it yourself" */
    signature: string;
    tests: TestCase[];
    compare?: CompareMode;
    harness?: string;
    adapter?: string;
  };
  /** the trace generator */
  viz: VizDef;
  /** maps a test case's args to the visualizer's input, so the test-suite can run the trace on every case */
  fromArgs: (args: any[]) => Record<string, unknown>;
}

export interface BossQuestion {
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface TopicContent {
  /** the core idea in a few lines */
  intro: string[];
  /** a reusable Python template */
  template: { title: string; code: string }[];
  /** "how to recognise this pattern" */
  checklist: string[];
  boss: {
    /** mixed pattern-recognition quiz, timed */
    quiz: BossQuestion[];
    seconds: number;
    /** the problem solved with hints, visualizer and reference turned off */
    problem: string;
    note: string;
  };
}

/** shape of a `.cases.json` file */
export interface CasesFile {
  fn: string;
  compare?: CompareMode;
  cases: TestCase[];
}
