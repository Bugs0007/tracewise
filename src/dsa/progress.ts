// Selectors over the track progress that lives in the main save (SaveData.dsa).
import type { DsaProblemProgress, DsaSave } from '@/store/save';
import { useApp } from '@/store/store';
import { PROBLEMS, TOPICS, problemsOf } from './catalog';
import type { ProblemMeta, TopicId } from './types';

export type ProblemState = 'solved' | 'review' | 'started' | 'new';

export function problemState(p: DsaProblemProgress | undefined): ProblemState {
  if (!p) return 'new';
  if (p.status) return p.status;
  return p.typed || p.hints || p.predictTotal || p.pattern !== undefined ? 'started' : 'new';
}

export interface TopicProgress {
  total: number;
  solved: number;
  review: number;
  started: number;
}

export function topicProgress(dsa: DsaSave, topic: TopicId): TopicProgress {
  const list = problemsOf(topic);
  let solved = 0;
  let review = 0;
  let started = 0;
  for (const p of list) {
    const s = problemState(dsa.problems[p.id]);
    if (s === 'solved') solved++;
    else if (s === 'review') review++;
    else if (s === 'started') started++;
  }
  return { total: list.length, solved, review, started };
}

export function trackProgress(dsa: DsaSave): { total: number; solved: number; review: number } {
  let solved = 0;
  let review = 0;
  for (const p of PROBLEMS) {
    const s = problemState(dsa.problems[p.id]);
    if (s === 'solved') solved++;
    else if (s === 'review') review++;
  }
  return { total: PROBLEMS.length, solved, review };
}

/** The problem to resume: the most recently touched unsolved one, else the first untouched one. */
export function nextProblem(dsa: DsaSave): ProblemMeta | null {
  const touched = PROBLEMS.filter((p) => dsa.problems[p.id] && problemState(dsa.problems[p.id]) !== 'solved').sort((a, b) => ((dsa.problems[b.id].lastSeen ?? '') > (dsa.problems[a.id].lastSeen ?? '') ? 1 : -1));
  return touched[0] ?? PROBLEMS.find((p) => problemState(dsa.problems[p.id]) !== 'solved') ?? null;
}

/** Award a topic badge once every problem in it is marked solved. */
export function awardTopicBadgeIfDone(topic: TopicId): void {
  const st = useApp.getState();
  const prog = topicProgress(st.dsa, topic);
  if (prog.total && prog.solved === prog.total) st.addBadge(`dsa:${topic}`, `${TOPICS.find((t) => t.id === topic)?.title ?? topic} complete`);
}

export const useDsa = () => useApp((s) => s.dsa);
