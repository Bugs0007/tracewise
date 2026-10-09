import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { gedge, gnode, graph, logPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
def handle(node, op, value, mode, reachable, total):
    if mode == "CP" and reachable * 2 <= total:        #@quorum
        return "error: unavailable"                    #@reject
    if op == "write":
        node.store = (value, now())                    #@accept
        copy_to_reachable_peers(node)
        return "ok"
    return node.store[0]                               #@serve

def heal(nodes):
    winner = max(nodes, key=lambda n: n.store[1])      #@reconcile
    for n in nodes:
        n.store = winner.store
`;

interface In {
  mode: string;
  healAt: number;
}

type Req = { t: number; op: 'write' | 'read'; node: 'A' | 'B' | 'C'; client: 1 | 2; value?: number };

const viz: VizDef<In> = {
  id: 'hld-cap',
  title: 'CAP: a partition cuts off one replica',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'During a partition prefer', kind: 'select', options: ['CP', 'AP'], default: 'CP', help: 'CP = consistency (reject on the minority side). AP = availability (accept and reconcile later).' },
    { key: 'healAt', label: 'Partition heals at tick', kind: 'number', default: 7 },
  ],
  presets: [
    { label: 'CP: reject on minority', input: { mode: 'CP', healAt: 7 } },
    { label: 'AP: accept and diverge', input: { mode: 'AP', healAt: 7 } },
    { label: 'AP, heals early', input: { mode: 'AP', healAt: 6 } },
  ],
  run(input) {
    const mode = needOneOf('mode', input.mode, ['CP', 'AP'] as const);
    const healAt = needInt('healAt', input.healAt, 6, 8);
    const reqs: Req[] = [
      { t: 0, op: 'write', node: 'A', client: 1, value: 1 },
      { t: 2, op: 'write', node: 'A', client: 1, value: 2 },
      { t: 3, op: 'read', node: 'C', client: 2 },
      { t: 4, op: 'write', node: 'C', client: 2, value: 3 },
      { t: 5, op: 'read', node: 'A', client: 1 },
      { t: healAt + 1, op: 'read', node: 'C', client: 2 },
    ];
    const r = new Recorder(code);
    const store: Record<string, { v: number | null; ts: number }> = { A: { v: null, ts: -1 }, B: { v: null, ts: -1 }, C: { v: null, ts: -1 } };
    let partitioned = false;
    let now = 0;
    const lanes: Record<string, TimelineEvent[]> = { 'Client 1 (A side)': [], 'Client 2 (C side)': [], Network: [] };
    const log: { text: string; tone?: Tone }[] = [];
    let latestAck: number | null = null;
    let accepted = 0;
    let rejected = 0;
    let stale = 0;
    let lost = 0;
    const lane = (c: 1 | 2) => (c === 1 ? 'Client 1 (A side)' : 'Client 2 (C side)');
    const reachable = (n: string) => (!partitioned ? 3 : n === 'C' ? 1 : 2);
    const view = (focus?: string, focusTone?: Tone): Panel[] => {
      const same = (n: string) => store[n].v === store.A.v;
      const nodes = ['A', 'B', 'C'].map((n, i) =>
        gnode(n, `Replica ${n}`, [60, 200, 330][i], i === 2 ? 130 : 60, {
          shape: 'cylinder',
          badge: store[n].v === null ? 'x = —' : `x = ${store[n].v}`,
          tone: n === focus ? focusTone : partitioned && n === 'C' ? 'muted' : same(n) ? 'done' : 'compare',
        }),
      );
      const cut: Tone = 'error';
      const edges = [
        gedge('A', 'B', { directed: false, label: 'sync', tone: 'done' }),
        gedge('A', 'C', { directed: false, dashed: partitioned, tone: partitioned ? cut : 'done', label: partitioned ? 'cut' : undefined }),
        gedge('B', 'C', { directed: false, dashed: partitioned, tone: partitioned ? cut : 'done' }),
      ];
      return [
        graph(nodes, edges, 400, 190, partitioned ? 'Network partitioned: {A, B} | {C}' : 'Network healthy'),
        { type: 'timeline', title: `Client requests (tick ${now})`, lanes: Object.entries(lanes).map(([label, events]) => ({ label, events: [...events] })), tMax: 10, now, unit: 't' },
        logPanel('Responses', log),
      ];
    };
    const copy = (from: string) => {
      for (const n of ['A', 'B', 'C']) if (n !== from && (!partitioned || (n === 'C') === (from === 'C'))) store[n] = { ...store[from] };
    };
    const doHeal = () => {
      now = healAt;
      const versions = new Set(Object.values(store).filter((s) => s.ts > 0).map((s) => s.ts));
      lost = Math.max(0, versions.size - 1);
      lanes.Network.push({ t: now, label: 'heal', tone: 'found' });
      partitioned = false;
      const winner = Object.values(store).reduce((a, b) => (b.ts > a.ts ? b : a));
      r.step('reconcile', lost ? `Partition heals: last-write-wins keeps x=${winner.v} (t=${winner.ts}); ${lost} acked write lost` : `Partition heals: replicas agree on x=${winner.v}`, view(), { winner: winner.v ?? 'none', lost });
      for (const n of ['A', 'B', 'C']) store[n] = { ...winner };
      r.op(3);
      r.step('reconcile', `All replicas now hold x=${winner.v}`, view(), { x: winner.v ?? 'none' });
    };

    r.step(undefined, `Three replicas, mode ${mode}. The partition will isolate replica C`, view(), { mode, healAt });
    let healed = false;
    for (const q of reqs) {
      if (!partitioned && !healed && q.t > 1) {
        now = 1;
        partitioned = true;
        lanes.Network.push({ t: 1, label: 'partition', tone: 'error' });
        r.step(undefined, 'Tick 1: the network splits. C can no longer reach A or B', view(), { partitioned: true });
      }
      if (partitioned && q.t > healAt) {
        doHeal();
        healed = true;
      }
      now = q.t;
      const reach = reachable(q.node);
      const label = q.op === 'write' ? `write x=${q.value}` : 'read x';
      r.step('quorum', `t=${q.t}: ${label} at ${q.node}; it can reach ${reach} of 3 replicas`, view(q.node, 'active'), { node: q.node, reachable: reach, majority: reach * 2 > 3 });
      if (mode === 'CP' && reach * 2 <= 3) {
        rejected++;
        lanes[lane(q.client)].push({ t: q.t, label: `${label} ✗`, tone: 'error' });
        log.push({ text: `t=${q.t} ${label} @${q.node}: unavailable`, tone: 'error' });
        r.step('reject', `${q.node} is in the minority, so it refuses the ${q.op} (503)`, view(q.node, 'error'), { rejected });
        continue;
      }
      accepted++;
      if (q.op === 'write') {
        store[q.node] = { v: q.value!, ts: q.t };
        copy(q.node);
        latestAck = q.value!;
        lanes[lane(q.client)].push({ t: q.t, label, tone: 'swap' });
        log.push({ text: `t=${q.t} ${label} @${q.node}: ok`, tone: 'found' });
        r.step('accept', partitioned && q.node === 'C' ? `${q.node} accepts x=${q.value} alone: the replicas now diverge` : `${q.node} stores x=${q.value} and copies it to its reachable peers`, view(q.node, 'swap'), { x: q.value!, accepted });
      } else {
        const v = store[q.node].v;
        const isStale = v !== latestAck;
        if (isStale) stale++;
        lanes[lane(q.client)].push({ t: q.t, label: `x=${v}`, tone: isStale ? 'error' : 'found' });
        log.push({ text: `t=${q.t} read @${q.node}: x=${v}${isStale ? ' (stale)' : ''}`, tone: isStale ? 'error' : 'found' });
        r.step('serve', isStale ? `${q.node} answers x=${v}, but the latest acked write is x=${latestAck}` : `${q.node} answers x=${v}: the latest acked write`, view(q.node, isStale ? 'error' : 'found'), { read: v ?? 'none', stale: isStale });
      }
    }
    const final = { A: store.A.v, B: store.B.v, C: store.C.v };
    r.step(undefined, mode === 'CP' ? `CP: ${rejected} requests refused, nothing stale, nothing lost` : `AP: every request answered, but ${stale} stale reads and ${lost} lost write`, view(), { accepted, rejected, stale, lost });
    return { frames: r.frames, result: { accepted, rejected, stale, lost, final } };
  },
  reference(input) {
    const final = input.mode === 'CP' ? { A: 2, B: 2, C: 2 } : { A: 3, B: 3, C: 3 };
    return input.mode === 'CP' ? { accepted: 4, rejected: 2, stale: 0, lost: 0, final } : { accepted: 6, rejected: 0, stale: 2, lost: 1, final };
  },
};

const handleTests = [
  { args: ['CP', 'read', 2, 3], expected: 'ok', name: 'CP majority serves' },
  { args: ['CP', 'write', 1, 3], expected: 'unavailable', name: 'CP minority rejects writes' },
  { args: ['CP', 'read', 1, 3], expected: 'unavailable', name: 'CP minority rejects reads' },
  { args: ['AP', 'write', 1, 3], expected: 'diverge', name: 'AP minority accepts and diverges' },
  { args: ['AP', 'read', 1, 3], expected: 'stale', name: 'AP minority may serve stale data' },
  { args: ['AP', 'read', 2, 3], expected: 'ok', name: 'AP majority is normal' },
  { args: ['CP', 'write', 2, 4], expected: 'unavailable', name: '2 of 4 is not a majority' },
];

const unit: Unit = {
  id: 'hld-cap',
  hook: 'CAP is the most quoted and most misquoted theorem in system design. The real question is the one you can answer: when the network splits, does this feature reject requests or risk disagreeing copies?',
  predict: {
    prompt: 'A 3-replica CP store loses the link to replica C. A client talking to C sends a write. What happens?',
    options: ['C accepts it and syncs later', 'C rejects or blocks it because it cannot reach a majority', 'The write goes to A automatically and succeeds', 'All replicas stop serving'],
    answer: 1,
    explain: 'A CP system sacrifices availability on the minority side: C cannot confirm it is current, so it refuses. A and B still hold a majority and keep serving.',
  },
  viz,
  deeper: {
    points: [
      'Partitions are not optional in a distributed system, so the real choice is C or A while partitioned. When the network is healthy you can have both.',
      'CP: only the side with a majority (quorum) may serve. Cost: the minority side returns errors or times out. Fits money, inventory, leader election.',
      'AP: every reachable node answers, possibly with stale data, and concurrent writes diverge. Cost: reconciliation (last-write-wins, vector clocks, CRDTs). Fits carts, feeds, presence.',
      'Last-write-wins is simple but silently drops one side\'s acknowledged write. Merge functions or CRDTs keep both intents.',
      'PACELC extends it: even without a partition there is a trade-off between latency and consistency.',
    ],
    pitfalls: ['Calling a system "CA": a single node is not distributed, and a real network can partition', 'Treating "consistency" in CAP as the same thing as ACID consistency', 'Splitting an even-sized cluster 2/2 so that neither side has a majority'],
  },
  practice: {
    language: 'python',
    fnName: 'handle',
    statement:
      'A node can reach `reachable` of `total` replicas (including itself). A majority is more than half. Return `"ok"` if it has a majority. Without a majority: in `"CP"` mode return `"unavailable"`; in `"AP"` mode return `"diverge"` for a write (it is accepted but will conflict) and `"stale"` for a read.',
    signature: 'def handle(mode, op, reachable, total):',
    solution: `def handle(mode, op, reachable, total):
    majority = @@reachable * 2 > total@@
    if majority:
        return "ok"
    if mode == "CP":
        return @@"unavailable"@@
    if op == "write":
        return @@"diverge"@@
    return @@"stale"@@`,
    tests: handleTests,
  },
  debug: {
    language: 'python',
    fnName: 'handle',
    statement: 'In a 4-node cluster that splits 2/2, BOTH halves keep accepting writes in CP mode, so the data diverges. Find the bug.',
    buggy: `def handle(mode, op, reachable, total):
    majority = reachable * 2 >= total
    if majority:
        return "ok"
    if mode == "CP":
        return "unavailable"
    if op == "write":
        return "diverge"
    return "stale"`,
    fixed: `def handle(mode, op, reachable, total):
    majority = reachable * 2 > total
    if majority:
        return "ok"
    if mode == "CP":
        return "unavailable"
    if op == "write":
        return "diverge"
    return "stale"`,
    tests: handleTests,
    bugType: 'off-by-one (>= vs >)',
    hint: 'How many nodes does a side need in a 4-node cluster to be a strict majority?',
    explanation: 'A majority is MORE than half. With `>=`, a 2-of-4 half counts as a majority, and so does the other 2-of-4 half: split brain. Use a strict `>`.',
  },
  boss: {
    title: 'Reconcile diverged replicas',
    statement:
      'During a partition each replica acknowledged writes `[replica, ts, value]`. Take each replica\'s latest write (highest ts; a later list entry wins a tie). The winner is the replica whose latest write has the highest `(ts, replica name)`. Return `{"winner": [replica, value], "lost": [[replica, value], ...]}` where `lost` lists, sorted by replica name, the other replicas whose latest value differs from the winner\'s value. With no writes return `{"winner": None, "lost": []}`.',
    language: 'python',
    fnName: 'reconcile',
    starter: `def reconcile(writes):
    # your code here
    pass
`,
    solution: `def reconcile(writes):
    latest = {}
    for replica, ts, value in writes:
        if replica not in latest or ts >= latest[replica][0]:
            latest[replica] = (ts, value)
    if not latest:
        return {"winner": None, "lost": []}
    win = max(latest, key=lambda r: (latest[r][0], r))
    lost = [[r, latest[r][1]] for r in sorted(latest) if r != win and latest[r][1] != latest[win][1]]
    return {"winner": [win, latest[win][1]], "lost": lost}`,
    tests: [
      { args: [[['A', 2, 'x2'], ['C', 4, 'x3']]], expected: { winner: ['C', 'x3'], lost: [['A', 'x2']] }, name: 'later timestamp wins' },
      { args: [[['A', 2, 'v'], ['A', 5, 'w'], ['C', 4, 'u']]], expected: { winner: ['A', 'w'], lost: [['C', 'u']] }, name: 'only each replica\'s latest write counts' },
      { args: [[['A', 3, 'k'], ['B', 3, 'k']]], expected: { winner: ['B', 'k'], lost: [] }, name: 'identical values lose nothing' },
      { args: [[]], expected: { winner: null, lost: [] }, name: 'no writes' },
      { args: [[['A', 3, 'p'], ['B', 3, 'q']]], expected: { winner: ['B', 'q'], lost: [['A', 'p']] }, name: 'timestamp tie broken by replica name' },
      { args: [[['C', 1, 'c'], ['A', 2, 'a'], ['B', 2, 'b']]], expected: { winner: ['B', 'b'], lost: [['A', 'a'], ['C', 'c']] }, name: 'three replicas' },
    ],
    hints: ['First reduce the writes to one `(ts, value)` per replica, keeping the highest ts.', '`max(latest, key=lambda r: (latest[r][0], r))` finds the winner; build `lost` from the sorted other replicas whose value differs.'],
    combines: ['hld-consistency', 'hld-replication'],
  },
  quiz: [
    {
      prompt: 'A shopping cart service must keep accepting "add item" even during a partition. Which choice is most natural?',
      options: ['CP with a quorum write', 'AP with a merge (union) of the diverged carts', 'A single leader in one region', 'Reject writes on the minority side'],
      answer: 1,
      explain: 'A cart is available-first: losing an add is worse than briefly disagreeing. Merging the two item sets after the partition keeps everyone\'s intent.',
    },
  ],
};

export default unit;
