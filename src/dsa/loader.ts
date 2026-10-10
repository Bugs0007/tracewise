import { PROBLEM_BY_ID } from './catalog';
import type { ProblemContent, TopicContent, TopicId } from './types';

// Every problem and topic is its own chunk: opening one problem downloads only that problem's
// explanation, solution and trace generator.
const problemLoaders = import.meta.glob<{ default: ProblemContent }>('./problems/*/*.ts');
const topicLoaders = import.meta.glob<{ default: TopicContent }>('./topics/*.ts');

const problemPath = (id: string): string | null => {
  const meta = PROBLEM_BY_ID[id];
  return meta ? `./problems/${meta.topic}/${id}.ts` : null;
};

/** Slugs whose content has been written. The index shows the rest as "soon". */
export const AVAILABLE_PROBLEMS: Set<string> = new Set(
  Object.keys(problemLoaders)
    .map((p) => p.match(/\/([^/]+)\.ts$/)?.[1])
    .filter((x): x is string => !!x && x in PROBLEM_BY_ID),
);

export const hasProblem = (id: string): boolean => AVAILABLE_PROBLEMS.has(id);

const problemCache = new Map<string, Promise<ProblemContent | null>>();
export function loadProblem(id: string): Promise<ProblemContent | null> {
  if (!problemCache.has(id)) {
    const p = problemPath(id);
    const loader = p ? problemLoaders[p] : undefined;
    problemCache.set(id, loader ? loader().then((m) => m.default) : Promise.resolve(null));
  }
  return problemCache.get(id)!;
}

const topicCache = new Map<string, Promise<TopicContent | null>>();
export function loadTopic(id: TopicId): Promise<TopicContent | null> {
  if (!topicCache.has(id)) {
    const loader = topicLoaders[`./topics/${id}.ts`];
    topicCache.set(id, loader ? loader().then((m) => m.default) : Promise.resolve(null));
  }
  return topicCache.get(id)!;
}
