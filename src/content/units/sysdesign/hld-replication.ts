import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, TimelineEvent, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
def write(key, value):
    version = leader.apply(key, value)                  #@apply
    for f in followers:
        send(f, version, key, value)                    #@ship
    if sync:
        wait_for_ack(followers[0])                      #@wait
    return version                                      #@ack

def read(key, last_version, read_your_writes):
    f = pick_follower()                                 #@pick
    if read_your_writes and f.applied < last_version:   #@check
        f = leader                                      #@fallback
    return f.get(key)                                   #@read
`;

interface In {
  mode: string;
  lag: number;
  readDelay: number;
  routing: string;
}

type Ev = { t: number; pri: number; kind: 'write' | 'apply1' | 'apply2' | 'ack' | 'read' };

function plan(mode: string, lag: number, readDelay: number) {
  const ackAt = mode === 'sync' ? lag : 0;
  const readAt = ackAt + readDelay;
  return { ackAt, readAt, f1At: lag, f2At: lag * 2 };
}

const viz: VizDef<In> = {
  id: 'hld-replication',
  title: 'Leader/follower replication and stale reads',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'Replication mode', kind: 'select', options: ['async', 'sync'], default: 'async' },
    { key: 'lag', label: 'Follower 1 lag (ms)', kind: 'number', default: 40, help: 'Follower 2 is twice as slow.' },
    { key: 'readDelay', label: 'Client reads this many ms after the ack', kind: 'number', default: 10 },
    { key: 'routing', label: 'Read routing', kind: 'select', options: ['any follower', 'read-your-writes'], default: 'any follower' },
  ],
  presets: [
    { label: 'Stale read (async)', input: { mode: 'async', lag: 40, readDelay: 10, routing: 'any follower' } },
    { label: 'Read-your-writes fix', input: { mode: 'async', lag: 40, readDelay: 10, routing: 'read-your-writes' } },
    { label: 'Sync replication', input: { mode: 'sync', lag: 40, readDelay: 10, routing: 'any follower' } },
    { label: 'Late read (lag over)', input: { mode: 'async', lag: 20, readDelay: 60, routing: 'any follower' } },
  ],
  run(input) {
    const mode = needOneOf('mode', input.mode, ['async', 'sync'] as const);
    const routing = needOneOf('routing', input.routing, ['any follower', 'read-your-writes'] as const);
    const lag = needInt('lag', input.lag, 1, 100);
    const readDelay = needInt('readDelay', input.readDelay, 0, 200);
    const { ackAt, readAt, f1At, f2At } = plan(mode, lag, readDelay);
    const r = new Recorder(code);
    const state = { L: 1, F1: 1, F2: 1 };
    let ver = 1;
    const lanes: Record<string, TimelineEvent[]> = { Leader: [], 'Follower 1': [], 'Follower 2': [], Client: [] };
    let now = 0;
    let readFrom = '';
    let value = 1;
    const tones = (): Record<string, Tone> => ({ L: state.L === ver ? 'done' : 'default', F1: state.F1 === ver ? 'done' : 'error', F2: state.F2 === ver ? 'done' : 'error' });
    const view = (read?: { to: string; tone: Tone }): Panel[] => {
      const t = tones();
      const nodes = [
        gnode('C', 'Client', 50, 90, { shape: 'actor' }),
        gnode('L', 'Leader', 190, 90, { tone: t.L, badge: `x=${state.L}`, shape: 'cylinder' }),
        gnode('F1', 'Follower 1', 350, 40, { tone: t.F1, badge: `x=${state.F1}`, shape: 'cylinder' }),
        gnode('F2', 'Follower 2', 350, 140, { tone: t.F2, badge: `x=${state.F2}`, shape: 'cylinder' }),
      ];
      const edges = [
        gedge('C', 'L', { label: 'writes' }),
        gedge('L', 'F1', { dashed: true, label: `+${lag}ms`, tone: state.F1 === ver ? 'done' : 'frontier' }),
        gedge('L', 'F2', { dashed: true, label: `+${lag * 2}ms`, tone: state.F2 === ver ? 'done' : 'frontier' }),
      ];
      if (read) edges.push(gedge('C', read.to, { label: 'read', tone: read.tone, curve: read.to === 'L' ? 22 : 0, flow: true }));
      return [
        graph(nodes, edges, 420, 180, 'Cluster'),
        { type: 'timeline', title: `Timeline (t = ${now} ms)`, lanes: Object.entries(lanes).map(([label, events]) => ({ label, events: [...events] })), tMax: Math.max(readAt, f2At) + 20, now, unit: 'ms' },
      ];
    };
    const evs = ([
      { t: 0, pri: 0, kind: 'write' },
      { t: f1At, pri: 1, kind: 'apply1' },
      { t: f2At, pri: 1, kind: 'apply2' },
      { t: ackAt, pri: 2, kind: 'ack' },
      { t: readAt, pri: 3, kind: 'read' },
    ] as Ev[]).sort((a, b) => a.t - b.t || a.pri - b.pri);

    r.step(undefined, `All three nodes hold x=1. A client will write x=2 (${mode} replication)`, view(), { x: 1, mode });
    for (const e of evs) {
      now = e.t;
      if (e.kind === 'write') {
        ver = 2;
        state.L = 2;
        lanes.Leader.push({ t: now, label: 'x=2', tone: 'swap' });
        lanes.Client.push({ t: now, label: 'write x=2', tone: 'active' });
        r.op();
        r.step('apply', 'Leader applies x=2 first; followers still have x=1', view(), { t: now, leader: 2, f1: state.F1, f2: state.F2 });
        r.step('ship', `Change log shipped: follower 1 gets it at t=${f1At}, follower 2 at t=${f2At}`, view(), { t: now, f1At, f2At });
      } else if (e.kind === 'apply1') {
        state.F1 = 2;
        lanes['Follower 1'].push({ t: now, label: 'x=2', tone: 'done' });
        r.op();
        r.step(undefined, `t=${now}: follower 1 applies x=2`, view(), { t: now, f1: 2 });
      } else if (e.kind === 'apply2') {
        state.F2 = 2;
        lanes['Follower 2'].push({ t: now, label: 'x=2', tone: 'done' });
        r.op();
        r.step(undefined, `t=${now}: follower 2 applies x=2`, view(), { t: now, f2: 2 });
      } else if (e.kind === 'ack') {
        lanes.Client.push({ t: now, label: 'ack', tone: 'found' });
        if (mode === 'sync') r.step('wait', `Sync: leader waits for follower 1 before replying (t=${now})`, view(), { t: now, waitingFor: 'F1' });
        r.step('ack', mode === 'sync' ? `t=${now}: client gets "ok" after a follower confirmed` : `t=${now}: client gets "ok" immediately, before any follower has it`, view(), { t: now, version: 2 });
      } else {
        lanes.Client.push({ t: now, label: 'read x', tone: 'compare' });
        r.step('pick', `t=${now}: the load balancer sends the read to follower 1`, view({ to: 'F1', tone: 'compare' }), { t: now, 'F1.applied': state.F1 });
        readFrom = 'F1';
        if (routing === 'read-your-writes') {
          r.step('check', `Client wrote version 2; follower 1 has version ${state.F1}${state.F1 < 2 ? ' → too old' : ' → fresh enough'}`, view({ to: 'F1', tone: state.F1 < 2 ? 'error' : 'found' }), { lastVersion: 2, applied: state.F1 });
          if (state.F1 < 2) {
            readFrom = 'L';
            r.step('fallback', 'Fallback: this read goes to the leader instead', view({ to: 'L', tone: 'found' }), { f: 'leader' });
          }
        }
        value = readFrom === 'L' ? state.L : state.F1;
        const stale = value < 2;
        lanes.Client.push({ t: now, label: `got x=${value}`, tone: stale ? 'error' : 'found' });
        r.step('read', stale ? `Client reads x=${value} from ${readFrom === 'L' ? 'leader' : 'follower 1'}: its own write vanished` : `Client reads x=${value}: its own write is visible`, view({ to: readFrom, tone: stale ? 'error' : 'found' }), { value, stale });
      }
    }
    const result = { ackAt, readAt, readFrom, value, stale: value < 2 };
    r.step(undefined, result.stale ? 'Result: stale read — the client could not see what it just wrote' : 'Result: the read returned the latest value', [kvPanel('Outcome', { ackAt, readAt, readFrom, value, stale: result.stale }, { stale: result.stale ? 'error' : 'found' })], { value });
    return { frames: r.frames, result };
  },
  reference(input) {
    const lag = input.lag;
    const ackAt = input.mode === 'sync' ? lag : 0;
    const readAt = ackAt + input.readDelay;
    const followerFresh = readAt >= lag;
    const toLeader = input.routing === 'read-your-writes' && !followerFresh;
    const value = toLeader || followerFresh ? 2 : 1;
    return { ackAt, readAt, readFrom: toLeader ? 'L' : 'F1', value, stale: value < 2 };
  },
};

const clusterCode = `class Cluster:
    def __init__(self, followers):
        self.version = 0
        self.leader = {}
        self.log = []
        self.followers = [{"data": {}, "applied": 0} for _ in range(followers)]

    def write(self, key, value):
        self.version += 1
        self.leader[key] = value
        self.log.append((self.version, key, value))
        return self.version

    def replicate(self, i, upto):
        f = self.followers[i]
        for v, k, val in self.log:
            if f["applied"] < v <= upto:
                f["data"][k] = val
                f["applied"] = v

    def read(self, key, i, min_version=0):
        f = self.followers[i]
        if f["applied"] < min_version:
            return self.leader.get(key)
        return f["data"].get(key)`;

const ops = (...n: string[]) => n;

const clusterTests = [
  { args: [ops('Cluster', 'write', 'read', 'replicate', 'read'), [[2], ['x', 1], ['x', 0], [0, 1], ['x', 0]]], expected: [null, 1, null, null, 1], name: 'lagging follower, then caught up' },
  { args: [ops('Cluster', 'write', 'read', 'read'), [[2], ['x', 5], ['x', 0, 1], ['x', 1, 0]]], expected: [null, 1, 5, null], name: 'read-your-writes falls back to the leader' },
  { args: [ops('Cluster', 'write', 'write', 'replicate', 'read', 'read'), [[1], ['x', 1], ['x', 2], [0, 1], ['x', 0], ['x', 0, 2]]], expected: [null, 1, 2, null, 1, 2], name: 'partially replicated log' },
  { args: [ops('Cluster', 'write', 'replicate', 'read', 'read'), [[2], ['k', 'a'], [1, 1], ['k', 1, 1], ['k', 0, 1]]], expected: [null, 1, null, 'a', 'a'], name: 'min_version satisfied vs fallback' },
  { args: [ops('Cluster', 'read'), [[1], ['nope', 0]]], expected: [null, null], name: 'missing key' },
    ];

const unit: Unit = {
  id: 'hld-replication',
  hook: 'Every read-scaling design copies data to followers, and every copy is a little behind. Interviewers want you to name the anomaly (a user cannot see their own write) and the fix, not just say "add replicas".',
  predict: {
    prompt: 'A user saves their profile; the app acks after the leader commits and the next page load reads from a random follower. 50 ms later the page shows the old profile. Which statement best explains it?',
    options: ['The write failed silently on the leader', 'Async replication: the follower had not applied the write yet', 'The database lost the update', 'Caches cannot be used with replicas'],
    answer: 1,
    explain: 'The leader acknowledged before shipping the change to followers finished. The read landed on a follower that was still behind. Nothing was lost; the copy was just late.',
  },
  viz,
  deeper: {
    points: [
      'Leader/follower: all writes go to one node, which streams an ordered change log to followers. Followers serve reads, which scales read throughput.',
      'Async replication acks fast and survives slow followers, but a leader crash can lose acknowledged writes and followers serve stale data (replication lag).',
      'Sync replication to every follower makes a single slow node block all writes. A common compromise is semi-sync: one follower is synchronous, the rest async.',
      'Read-your-writes: route a user to the leader (or a follower whose applied version is at least their last written version) for a short while after they write.',
      'Failover: promote the most caught-up follower. Un-replicated writes on the old leader are lost or must be reconciled.',
    ],
    complexity: { time: 'Write: leader + wait for sync followers', space: 'N copies of the data' },
    pitfalls: ['Reading a lagging follower right after a write', 'Treating "replicated" as "backed up" (a bad DELETE replicates too)', 'Making every follower synchronous so one slow node stalls all writes'],
  },
  practice: {
    language: 'python',
    fnName: 'Cluster',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `Cluster(followers)`. `write(key, value)` bumps a version, stores on the leader, appends to a log and returns the version. `replicate(i, upto)` applies logged writes up to version `upto` to follower `i`. `read(key, i, min_version=0)` reads follower `i`, but falls back to the leader if the follower has applied fewer than `min_version` versions.',
    signature: 'class Cluster:',
    solution: `class Cluster:
    def __init__(self, followers):
        self.version = 0
        self.leader = {}
        self.log = []
        self.followers = [{"data": {}, "applied": 0} for _ in range(followers)]

    def write(self, key, value):
        self.version += @@1@@
        self.leader[key] = value
        self.log.append((self.version, key, value))
        return self.version

    def replicate(self, i, upto):
        f = self.followers[i]
        for v, k, val in self.log:
            if @@f["applied"] < v <= upto@@:
                f["data"][k] = val
                f["applied"] = @@v@@

    def read(self, key, i, min_version=0):
        f = self.followers[i]
        if @@f["applied"] < min_version@@:
            return @@self.leader.get(key)@@
        return f["data"].get(key)`,
    tests: clusterTests,
  },
  debug: {
    language: 'python',
    fnName: 'Cluster',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'The read-your-writes fallback is broken: users still see old values right after saving, and fresh followers needlessly hit the leader. Find the bug.',
    buggy: clusterCode.replace('if f["applied"] < min_version:', 'if f["applied"] > min_version:'),
    fixed: clusterCode,
    tests: clusterTests,
    bugType: 'inverted comparison',
    hint: 'When should the read be sent to the leader: when the follower is ahead of the version you need, or behind it?',
    explanation: 'The follower is too old when its applied version is LOWER than the version the client last wrote. The inverted `>` sends fresh followers to the leader and lets lagging followers answer with stale data.',
  },
  boss: {
    title: 'Stale read detector',
    statement:
      'Events are `["w", t, key, value]` writes (applied to the leader at once and to the follower at time `t + lag`) and `["r", t, key]` reads from the follower, in time order. Return a list with one `[value_seen, stale]` pair per read. `value_seen` is the newest write to that key with `t_write + lag <= t_read` (or `None`). `stale` is True when the leader already held a different value at read time.',
    language: 'python',
    fnName: 'follower_reads',
    starter: `def follower_reads(events, lag):
    # your code here
    pass
`,
    solution: `def follower_reads(events, lag):
    writes = []
    out = []
    for ev in events:
        if ev[0] == "w":
            writes.append((ev[1], ev[2], ev[3]))
        else:
            t, key = ev[1], ev[2]
            latest = None
            seen = None
            for wt, wk, wv in writes:
                if wk != key or wt > t:
                    continue
                latest = wv
                if wt + lag <= t:
                    seen = wv
            out.append([seen, seen != latest])
    return out`,
    tests: [
      { args: [[['w', 0, 'x', 1], ['r', 5, 'x'], ['r', 10, 'x']], 10], expected: [[null, true], [1, false]], name: 'lag of 10' },
      { args: [[['w', 0, 'x', 1], ['w', 4, 'x', 2], ['r', 12, 'x'], ['r', 14, 'x']], 10], expected: [[1, true], [2, false]], name: 'second write still in flight' },
      { args: [[['r', 1, 'x']], 5], expected: [[null, false]], name: 'nothing written yet' },
      { args: [[['w', 0, 'a', 'u'], ['w', 1, 'b', 'v'], ['r', 5, 'a'], ['r', 5, 'b']], 5], expected: [['u', false], [null, true]], name: 'keys are independent' },
      { args: [[['w', 0, 'x', 7], ['r', 3, 'x']], 0], expected: [[7, false]], name: 'zero lag' },
    ],
    hints: ['Walk the events once, keeping a list of the writes so far. For each read, look through them for the same key.', 'The leader value is the latest write with `wt <= t`; the follower value is the latest with `wt + lag <= t`. Stale means the two differ.'],
    combines: ['hld-consistency'],
  },
  quiz: [
    {
      prompt: 'Which setup gives the strongest guarantee that a write is not lost if the leader dies right after acking?',
      options: ['Async replication to all followers', 'Synchronous (or semi-sync) replication to at least one follower', 'Adding more read replicas', 'Caching reads on the leader'],
      answer: 1,
      explain: 'With async replication an acked write may exist only on the dead leader. Waiting for at least one follower before acking means a surviving node has it.',
    },
  ],
};

export default unit;
