// Kahn's topological sort, traced. Shared by Course Schedule (does an order exist?) and Course Schedule II (give one).
import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, graphView } from './prims';
import type { TraceRecorder } from './trace';

export function kahnTrace(r: TraceRecorder, n: number, edges: EdgeSpec[], mode: 'can' | 'order'): { order: number[]; ok: boolean } {
  const ids = Array.from({ length: n }, (_, i) => String(i));
  const graph: number[][] = Array.from({ length: n }, () => []);
  const indegree = Array(n).fill(0) as number[];
  const queue: number[] = [];
  const order: number[] = [];
  const tones: Record<string, Tone> = {};
  const view = () => [
    graphView(ids, edges, { title: 'prerequisites (an arrow a → b means "take a before b"); badge = unmet prerequisites', directed: true, layout: 'circle', size: { width: 380, height: 260 }, tones, badges: Object.fromEntries(ids.map((id, i) => [id, String(indegree[i])])) }),
    chipsView(queue, { title: 'queue: courses with nothing left to wait for', startLabel: 'front', endLabel: 'back' }),
    chipsView(order, { title: mode === 'can' ? 'courses finished' : 'order so far' }),
  ];
  r.step('graph', 'Build the graph: for each pair, an edge from the prerequisite to the course that needs it.', view(), {});
  for (const e of edges) {
    graph[Number(e.from)].push(Number(e.to));
    indegree[Number(e.to)]++;
  }
  r.step('indegree', `indegree[c] counts how many prerequisites course c still waits for: [${indegree.join(', ')}].`, view(), {});
  for (let i = 0; i < n; i++) if (indegree[i] === 0) { queue.push(i); tones[String(i)] = 'frontier'; }
  r.step('seed', `Courses with no prerequisites can start now: [${queue.join(', ')}]. They go into the queue.`, view(), {});
  r.predict('start', 'Kahn’s algorithm repeatedly takes a course with zero unmet prerequisites. What happens if a cycle exists?', ['The courses on the cycle never reach zero, so they are never taken', 'The algorithm loops forever', 'The cycle is skipped and everything still finishes'], 0, 'On a cycle every course waits for another course on the cycle, so none of their counts ever hit zero.');
  let askedDec = false;
  while (queue.length) {
    r.op();
    const cur = queue.shift() as number;
    tones[String(cur)] = 'active';
    order.push(cur);
    r.step('pop', mode === 'can' ? `Take course ${cur}: it counts as finished.` : `Take course ${cur} and append it to the order.`, view(), { cur });
    for (const nxt of graph[cur]) {
      if (!askedDec) {
        askedDec = true;
        r.predictChoice('dec', `Course ${cur} is finished. Course ${nxt} needed it and still waits for ${indegree[nxt]}. How many now?`, String(indegree[nxt] - 1), [String(indegree[nxt]), String(indegree[nxt] + 1), '0'], cur, 'One prerequisite fewer: subtract 1.');
      }
      indegree[nxt]--;
      r.step('dec', `Course ${nxt} now waits for ${indegree[nxt]} prerequisite${indegree[nxt] === 1 ? '' : 's'}.`, view(), {});
      if (indegree[nxt] === 0) {
        queue.push(nxt);
        tones[String(nxt)] = 'frontier';
        r.step('zero', `Nothing is left to wait for: course ${nxt} joins the queue.`, view(), {});
      }
    }
    tones[String(cur)] = 'done';
  }
  const ok = order.length === n;
  for (let i = 0; i < n; i++) if (!order.includes(i)) tones[String(i)] = 'compare';
  r.step('done', ok ? `All ${n} courses were taken${mode === 'order' ? `: order [${order.join(', ')}]` : ''}.` : `Only ${order.length} of ${n} courses could be taken: the rest sit on a cycle (or depend on one).`, view(), { result: ok });
  return { order, ok };
}
