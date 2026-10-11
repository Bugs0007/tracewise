import type { Tone } from '@/engine/types';
import { arrayView, chipsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './time-based-key-value-store.py?raw';
import harness from './time-based-key-value-store.harness.py?raw';
import cases from './time-based-key-value-store.cases.json';

const parse = (line: string): { op: string; a: string[] } => {
  const [op, ...a] = line.trim().split(/\s+/);
  return { op, a };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'time-based-key-value-store',
  title: 'Time Based Key-Value Store',
  solution,
  inputs: [{ key: 'ops', label: 'operations: set key value time / get key time', kind: 'strings', default: ['set a x1 1', 'set a x4 4', 'set a x7 7', 'get a 1', 'get a 5', 'get a 9', 'get b 3'], maxItems: 14 }],
  presets: [
    { label: 'Latest at or before', input: { ops: ['set a x1 1', 'set a x4 4', 'set a x7 7', 'get a 1', 'get a 5', 'get a 9', 'get b 3'] } },
    { label: 'Before the first set', input: { ops: ['set a x5 5', 'get a 2'] } },
    { label: 'Two keys', input: { ops: ['set a p 1', 'set b q 2', 'set a r 3', 'get a 2', 'get b 5'] } },
  ],
  validate: ({ ops }) => {
    const last = new Map<string, number>();
    for (const line of ops) {
      const { op, a } = parse(line);
      if (op === 'set') {
        if (a.length !== 3 || !/^\d+$/.test(a[2])) return 'Use: set key value time (the time is a whole number)';
        if ((last.get(a[0]) ?? 0) >= Number(a[2])) return 'Times for the same key must keep increasing';
        last.set(a[0], Number(a[2]));
      } else if (op === 'get') {
        if (a.length !== 2 || !/^\d+$/.test(a[1])) return 'Use: get key time (the time is a whole number)';
      } else return `Unknown operation "${op}". Use set or get`;
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    const data = new Map<string, [number, string][]>();
    const out: (string | null)[] = [null];
    let asked = 0;
    const store = () => hashMapView([...data].map(([k, v]) => [k, v.map(([t, x]) => `${x}@${t}`)] as [string, string[]]), { title: 'data: key → list of (value @ time), in time order' });
    const results = () => chipsView(out.map((o) => (o === null ? 'None' : o === '' ? '""' : o)), { title: 'results of each call', tones: Object.fromEntries(out.map((o, i) => [i, o === null ? 'default' : 'found'])) as Record<number, Tone> });
    r.step('init', 'Each key keeps a list of (time, value) pairs. Times only increase, so each list is already sorted by time.', [store(), results()], {});
    for (const line of ops) {
      const { op, a } = parse(line);
      r.op();
      if (op === 'set') {
        const [key, value, ts] = [a[0], a[1], Number(a[2])];
        if (!data.has(key)) data.set(key, []);
        data.get(key)!.push([ts, value]);
        out.push(null);
        r.step('set', `set(${key}, ${value}, ${ts}): append (${ts}, ${value}) to the list for ${key}. Appending keeps it sorted.`, [store(), results()], { key, ts });
      } else {
        const [key, ts] = [a[0], Number(a[1])];
        const items = data.get(key) ?? [];
        const times = items.map(([t]) => t);
        let lo = 0;
        let hi = items.length - 1;
        let ans = '';
        let best = -1;
        const view = (mid: number | null, hot: Tone | null = null) => {
          const tones: Record<number, Tone> = {};
          times.forEach((_, i) => {
            if (i < lo || i > hi) tones[i] = 'muted';
          });
          if (best >= 0) tones[best] = 'frontier';
          if (mid !== null && hot) tones[mid] = hot;
          return [store(), arrayView(times, { title: `times for "${key}" (want the latest at or before ${ts})`, tones, pointers: times.length ? { lo, hi, ...(mid !== null ? { mid } : {}) } : undefined, window: lo <= hi && times.length ? { from: lo, to: hi, label: 'still possible', tone: 'active' } : undefined }), results()];
        };
        r.step('items', items.length ? `get(${key}, ${ts}): the list for ${key} has ${items.length} entr${items.length === 1 ? 'y' : 'ies'}. Binary search it by time.` : `get(${key}, ${ts}): there is no list for ${key}, so the answer is "".`, view(null), { key, ts });
        r.step('bounds', `lo = ${lo}, hi = ${hi}.`, view(null), { lo, hi });
        r.step('ans', 'ans starts as "" (used when every stored time is later than the query).', view(null), { ans: '""' });
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          r.step('mid', `mid = ${mid}: time ${times[mid]}.`, view(mid, 'active'), { lo, hi, mid });
          const ok = times[mid] <= ts;
          if (asked < 2) {
            asked++;
            r.predict(ok ? 'ok' : 'late', `Stored time ${times[mid]} versus the query time ${ts}. Is this entry usable?`, ['Yes: it is at or before the query. Remember it and look for a later usable one (right)', 'No: it is after the query. Look earlier (left)'], ok ? 0 : 1, ok ? 'A usable entry; a later one might also qualify, so search right.' : 'Too new; everything to the right is newer still.');
          }
          if (ok) {
            ans = items[mid][1];
            best = mid;
            r.step('take', `${times[mid]} ≤ ${ts}: ${items[mid][1]} is a candidate. Keep it and search to the right for a later one.`, view(mid, 'found'), { ans });
            lo = mid + 1;
            r.step('goRight', `lo = ${lo}.`, view(null), { lo, hi });
          } else {
            hi = mid - 1;
            r.step('goLeft', `${times[mid]} > ${ts}: too new. hi = ${hi}.`, view(null), { lo, hi });
          }
        }
        out.push(ans);
        r.step('done', ans ? `Return ${ans}: the value at the latest time not after ${ts}.` : 'No usable entry: return "".', view(null), { result: ans || '""' });
      }
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    const data = new Map<string, [number, string][]>();
    const out: (string | null)[] = [null];
    for (const line of ops) {
      const { op, a } = parse(line);
      if (op === 'set') {
        data.set(a[0], [...(data.get(a[0]) ?? []), [Number(a[2]), a[1]]]);
        out.push(null);
      } else {
        let best = '';
        for (const [t, v] of data.get(a[0]) ?? []) if (t <= Number(a[1])) best = v;
        out.push(best);
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Design a store where every value is saved together with a timestamp. A lookup gives a key and a time and must return the value that was stored for that key at the latest timestamp not after the given time (or an empty string if there is none). Timestamps for a key only ever increase.',
  example: ['set("a", "x", 2), set("a", "y", 6), get("a", 4), get("a", 1)', '"x" then ""', 'At time 4 the latest earlier value is "x" (stored at 2). At time 1 nothing had been stored yet.'],
  pattern: ['binary-search', ['binary-search', 'hash-lookup', 'design', 'heap'], 'Each key’s history is a list sorted by time, so "latest at or before t" is a binary search for the rightmost entry whose time is ≤ t.', {
    'hash-lookup': 'The hash map finds the key’s list, but finding the right time inside the list needs binary search.',
    design: 'It is a design problem; the part that makes get fast is the binary search over each list.',
    heap: 'Nothing here needs repeated min or max extraction.',
  }],
  hints: [
    'How would you store the history of one key so that you can look up "the value at time t"?',
    'Because timestamps only increase, appending keeps each key’s list sorted by time. What search is fast on a sorted list?',
    'On get, binary search for the last entry whose time is ≤ the query. Remember the value each time you find a usable entry and keep searching to the right.',
  ],
  insight: 'A hash map from key to a time-sorted list; get is a binary search for the rightmost time that is not after the query.',
  brute: 'Scan the key’s list on get: O(n) per call.',
  optimal: 'set appends in O(1); get binary searches in O(log n).',
  walk: ['Store data as a dict mapping each key to a list of (timestamp, value) pairs.', 'set appends a pair. Increasing timestamps keep the list sorted.', 'get fetches the list (empty if the key is unknown) and binary searches with lo, hi.', 'If the middle time is ≤ the query, remember its value and move lo right; otherwise move hi left. Return the remembered value ("" if none).'],
  edge: ['Unknown key.', 'Query earlier than the first stored time.', 'Query later than every stored time (returns the last value).', 'Several keys interleaved.'],
  works: ['The entries with time ≤ query form a prefix of the sorted list. Binary search finds the end of that prefix, and the last entry in it is the answer.', 'Remembering the value at every successful probe and continuing right guarantees the final remembered value is the rightmost usable one.'],
  time: ['O(log n)', 'get halves the list each step; set is just an O(1) append.'],
  space: ['O(n)', 'Every stored pair is kept.'],
  solution,
  cases,
  sig: 'class TimeMap:\n    def __init__(self):\n        pass\n\n    def set(self, key, value, timestamp):\n        pass\n\n    def get(self, key, timestamp):\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => `${o} ${((args as (string | number)[][])[i + 1]).join(' ')}`) }),
});
