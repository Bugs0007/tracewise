import type { CasesFile, ProblemContent } from '@/dsa/types';

/** Build the "Type it yourself" task from a problem's shared cases file. */
export function taskFrom(cases: unknown, signature: string, harness?: string): ProblemContent['task'] {
  const c = cases as CasesFile;
  return { fnName: c.fn, signature, tests: c.cases, compare: c.compare, ...(harness ? { harness, adapter: 'adapter' } : {}) };
}
