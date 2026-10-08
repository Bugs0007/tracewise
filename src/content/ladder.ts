// The scaffold-fading typing ladder. All four levels are derived from one
// annotated reference solution, so authors write each task once.
import type { Lang, PracticeTask } from './types';

export type LadderLevel = 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<LadderLevel, string> = {
  1: 'Fill the blanks',
  2: 'Complete the body',
  3: 'Signature only',
  4: 'Blank page',
};

export type Segment = { kind: 'text'; text: string } | { kind: 'blank'; answer: string; index: number };

const BLANK_RE = /@@([\s\S]*?)@@/g;

export function parseBlanks(solution: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  let index = 0;
  for (const m of solution.matchAll(BLANK_RE)) {
    if (m.index! > last) segs.push({ kind: 'text', text: solution.slice(last, m.index) });
    segs.push({ kind: 'blank', answer: m[1], index: index++ });
    last = m.index! + m[0].length;
  }
  if (last < solution.length) segs.push({ kind: 'text', text: solution.slice(last) });
  return segs;
}

export function cleanSolution(solution: string): string {
  return solution.replace(BLANK_RE, '$1');
}

export function blankCount(solution: string): number {
  return [...solution.matchAll(BLANK_RE)].length;
}

export function fillBlanks(segs: Segment[], answers: string[]): string {
  return segs.map((s) => (s.kind === 'text' ? s.text : answers[s.index] ?? '')).join('');
}

const norm = (s: string) => s.replace(/\s+/g, '').replace(/"/g, "'");

export function blankMatches(answer: string, typed: string): boolean {
  return norm(answer) === norm(typed);
}

export function commentPrefix(lang: Lang): string {
  return lang === 'python' ? '#' : '//';
}

/** Level 2: lines containing a blank become TODO comments (consecutive ones collapse). */
export function deriveSkeleton(task: PracticeTask): string {
  if (task.skeleton) return task.skeleton;
  const c = commentPrefix(task.language);
  const out: string[] = [];
  let prevIndent: string | null = null;
  for (const line of task.solution.split('\n')) {
    if (line.includes('@@')) {
      const indent = line.match(/^\s*/)![0];
      // collapse consecutive TODO lines only at the same depth so the block structure stays visible
      if (prevIndent !== indent) out.push(`${indent}${c} TODO`);
      prevIndent = indent;
    } else {
      out.push(line);
      prevIndent = null;
    }
  }
  return out.join('\n').replace(/@@/g, '');
}

/** Level 3: signature plus an empty body. */
export function signatureStarter(task: PracticeTask): string {
  const sig = task.signature.replace(/\s+$/, '');
  if (task.language === 'python') {
    const lastIndent = (sig.split('\n').pop() ?? '').match(/^\s*/)![0];
    return `${sig}\n${lastIndent}    # your code here\n${lastIndent}    pass\n`;
  }
  if (sig.endsWith('{')) return `${sig}\n  // your code here\n}\n`;
  return `${sig}\n`;
}

export function levelStarter(task: PracticeTask, level: LadderLevel): string {
  switch (level) {
    case 1:
      return cleanSolution(task.solution);
    case 2:
      return deriveSkeleton(task);
    case 3:
      return signatureStarter(task);
    case 4:
      return `${commentPrefix(task.language)} Define \`${task.fnName}\` from scratch.\n`;
  }
}

/** Promotion rules: pass -> +1 level next time; 3 fails at a level -> drop one. */
export function nextLadderState(level: LadderLevel, fails: number, passed: boolean): { level: LadderLevel; fails: number; changed: 'up' | 'down' | null } {
  if (passed) {
    return level < 4 ? { level: (level + 1) as LadderLevel, fails: 0, changed: 'up' } : { level, fails: 0, changed: null };
  }
  const f = fails + 1;
  if (f >= 3 && level > 1) return { level: (level - 1) as LadderLevel, fails: 0, changed: 'down' };
  return { level, fails: f, changed: null };
}
