// Pure traffic model for the architecture builder drill. Deterministic and
// deliberately simple: each component has a capacity (requests/second) and a
// latency; traffic is pushed along the learner's wiring and every component's
// utilisation is computed. Anything over 100% is the bottleneck.

export type Kind = 'client' | 'cdn' | 'lb' | 'app' | 'cache' | 'db' | 'replica' | 'queue' | 'worker';

export interface KindInfo {
  label: string;
  capacity: number; // requests per second
  latency: number; // ms added per request that passes through
  help: string;
}

export const KINDS: Record<Kind, KindInfo> = {
  client: { label: 'Clients', capacity: Infinity, latency: 0, help: 'Where traffic comes from.' },
  cdn: { label: 'CDN', capacity: 100_000, latency: 5, help: 'Serves static assets from the edge (absorbs the static share of traffic).' },
  lb: { label: 'Load balancer', capacity: 50_000, latency: 2, help: 'Spreads requests evenly across the app servers behind it.' },
  app: { label: 'App server', capacity: 1_000, latency: 20, help: 'Runs your code. ~1k req/s each.' },
  cache: { label: 'Cache', capacity: 50_000, latency: 1, help: 'Answers repeated reads from memory (hit ratio from the scenario).' },
  db: { label: 'DB primary', capacity: 1_500, latency: 15, help: 'Source of truth. Takes all writes and any reads that reach it.' },
  replica: { label: 'Read replica', capacity: 2_000, latency: 15, help: 'Takes reads off the primary (eventually consistent).' },
  queue: { label: 'Queue', capacity: 20_000, latency: 2, help: 'Buffers async writes so the request returns fast.' },
  worker: { label: 'Worker', capacity: 400, latency: 0, help: 'Drains the queue into the database. ~400 jobs/s each.' },
};

export interface ANode {
  id: string;
  kind: Kind;
  x: number;
  y: number;
}

export interface AEdge {
  from: string;
  to: string;
}

export interface Scenario {
  id: string;
  title: string;
  brief: string;
  reads: number;
  writes: number;
  /** share of read traffic that is static assets */
  staticShare: number;
  cacheHit: number;
  /** writes may be processed asynchronously through a queue */
  asyncWrites: boolean;
  p99Budget: number;
  /** must survive losing one app server */
  redundancy: boolean;
}

export const SCENARIOS: Scenario[] = [
  { id: 'blog', title: 'Personal blog', brief: '300 reads/s, 10 writes/s. Keep p99 under 100 ms.', reads: 300, writes: 10, staticShare: 0.5, cacheHit: 0.8, asyncWrites: false, p99Budget: 100, redundancy: false },
  { id: 'news', title: 'News site on launch day', brief: '8,000 reads/s (half are images/JS/CSS), 50 writes/s. Survive losing one app server. p99 under 120 ms.', reads: 8000, writes: 50, staticShare: 0.5, cacheHit: 0.85, asyncWrites: false, p99Budget: 120, redundancy: true },
  { id: 'shop', title: 'Flash sale shop', brief: '4,000 reads/s and 2,500 order writes/s for ten minutes. Orders may be processed asynchronously. Survive losing one app server. p99 under 150 ms.', reads: 4000, writes: 2500, staticShare: 0.3, cacheHit: 0.6, asyncWrites: true, p99Budget: 150, redundancy: true },
  { id: 'feed', title: 'Social feed reads', brief: '12,000 reads/s of mostly dynamic data (10% static), 200 writes/s. p99 under 120 ms. Survive losing one app server.', reads: 12000, writes: 200, staticShare: 0.1, cacheHit: 0.75, asyncWrites: false, p99Budget: 120, redundancy: true },
];

export interface SimResult {
  load: Record<string, number>;
  util: Record<string, number>;
  edgeLoad: Record<string, number>;
  p99: number;
  problems: string[];
  /** informational, not failures */
  notes: string[];
  bottleneck: string | null;
  passed: boolean;
}

const key = (a: string, b: string) => `${a}>${b}`;

export function simulate(nodes: ANode[], edges: AEdge[], s: Scenario): SimResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>();
  for (const e of edges) if (byId.has(e.from) && byId.has(e.to)) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const load: Record<string, number> = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const edgeLoad: Record<string, number> = {};
  const problems: string[] = [];
  const notes: string[] = [];
  const kids = (id: string, kinds: Kind[]) => (out.get(id) ?? []).filter((t) => kinds.includes(byId.get(t)!.kind));
  const add = (from: string, to: string, rps: number) => {
    load[to] += rps;
    edgeLoad[key(from, to)] = (edgeLoad[key(from, to)] ?? 0) + rps;
  };
  let latency = 0;

  const clients = nodes.filter((n) => n.kind === 'client');
  if (!clients.length) return fail('Add a Clients box: traffic has to come from somewhere.');

  // ── route reads and writes from clients toward app servers ──
  const total = s.reads + s.writes;
  const staticRps = s.reads * s.staticShare;
  const dynamicReads = s.reads - staticRps;
  let reachedApps: string[] = [];
  let appInbound = 0;
  for (const c of clients) {
    load[c.id] = total;
    const cdn = kids(c.id, ['cdn'])[0];
    let entry = c.id;
    let toApps = total;
    if (cdn) {
      add(c.id, cdn, total);
      entry = cdn;
      toApps = total - staticRps; // static served at the edge
      latency += KINDS.cdn.latency;
    }
    const lb = kids(entry, ['lb'])[0];
    if (lb) {
      add(entry, lb, toApps);
      latency += KINDS.lb.latency;
      const apps = kids(lb, ['app']);
      if (!apps.length) return fail('The load balancer has no app servers behind it.');
      for (const a of apps) add(lb, a, toApps / apps.length);
      reachedApps = apps;
    } else {
      const apps = kids(entry, ['app']);
      if (apps.length > 1) problems.push('Several app servers but no load balancer: clients can only reach one of them.');
      if (apps[0]) {
        add(entry, apps[0], toApps);
        reachedApps = [apps[0]];
      }
    }
    appInbound += toApps;
  }
  if (!reachedApps.length) return fail('No path from Clients to an App server.');
  latency += KINDS.app.latency;

  // ── from app servers to data stores ──
  const readsAtApp = dynamicReads;
  const writesAtApp = s.writes;
  const appIds = reachedApps;
  const per = (x: number) => x / appIds.length;
  let readsToDb = readsAtApp;
  const first = appIds[0];
  const cache = kids(first, ['cache'])[0];
  if (cache) {
    for (const a of appIds) if (kids(a, ['cache']).includes(cache)) add(a, cache, per(readsAtApp));
    readsToDb = readsAtApp * (1 - s.cacheHit);
    latency += KINDS.cache.latency;
  }
  const db = nodes.find((n) => n.kind === 'db');
  if (!db) return fail('There is no database to store the data.');
  const appsToDb = appIds.filter((a) => kids(a, ['db']).includes(db.id));
  if (!appsToDb.length) return fail('App servers are not connected to the database.');
  const replicas = kids(db.id, ['replica']).filter(Boolean);
  const appToReplicas = replicas.filter((r) => appIds.some((a) => kids(a, ['replica']).includes(r)));
  // reads: replicas if the app talks to them, else primary
  if (appToReplicas.length) {
    for (const r of appToReplicas) for (const a of appIds) if (kids(a, ['replica']).includes(r)) add(a, r, per(readsToDb) / appToReplicas.length);
    // replication stream: shown on the edge, treated as cheap for the replica itself
    for (const r of appToReplicas) edgeLoad[key(db.id, r)] = (edgeLoad[key(db.id, r)] ?? 0) + writesAtApp;
  } else {
    for (const a of appsToDb) add(a, db.id, readsToDb / appsToDb.length);
  }
  // writes: queue → workers → db when async and a queue exists, else straight to primary
  const queue = kids(first, ['queue'])[0];
  if (s.asyncWrites && queue) {
    for (const a of appIds) if (kids(a, ['queue']).includes(queue)) add(a, queue, per(writesAtApp));
    const workers = kids(queue, ['worker']);
    if (!workers.length) problems.push('The queue has no workers: jobs pile up forever.');
    // workers drain at most their own capacity; the queue absorbs the rest (fine for a burst, never for ever)
    const drain = Math.min(writesAtApp, workers.length * KINDS.worker.capacity);
    for (const w of workers) {
      add(queue, w, drain / workers.length);
      if (kids(w, ['db']).includes(db.id)) add(w, db.id, drain / workers.length);
      else problems.push('A worker is not connected to the database.');
    }
    if (workers.length && drain < writesAtApp) notes.push(`Workers drain ${Math.round(drain)}/s of ${Math.round(writesAtApp)}/s: the queue grows by ${Math.round(writesAtApp - drain)}/s and catches up after the burst.`);
    latency += KINDS.queue.latency;
  } else {
    for (const a of appsToDb) add(a, db.id, writesAtApp / appsToDb.length);
    if (s.asyncWrites && !queue) latency += 0;
  }
  latency += KINDS.db.latency;

  // ── utilisation, latency under load ──
  const util: Record<string, number> = {};
  for (const n of nodes) util[n.id] = Number.isFinite(KINDS[n.kind].capacity) ? load[n.id] / KINDS[n.kind].capacity : 0;
  // queueing: heavily utilised components add latency (simple M/M/1-flavoured penalty)
  let p99 = latency;
  for (const n of nodes) {
    const u = util[n.id];
    if (u > 0.7 && u <= 1) p99 += KINDS[n.kind].latency * (u / (1 - u)) * 0.5;
  }
  p99 = Math.round(p99 * 2);
  const over = nodes.filter((n) => util[n.id] > 1).sort((a, b) => util[b.id] - util[a.id]);
  for (const n of over) problems.push(`${KINDS[n.kind].label} is at ${Math.round(util[n.id] * 100)}% — overloaded.`);
  if (!over.length && p99 > s.p99Budget) problems.push(`p99 latency ${p99} ms is over the ${s.p99Budget} ms budget.`);
  if (s.redundancy) {
    if (appIds.length < 2) problems.push('A single app server is a single point of failure.');
    else {
      const survivorLoad = appInbound / (appIds.length - 1);
      if (survivorLoad > KINDS.app.capacity) problems.push(`If one app server dies, the rest run at ${Math.round((survivorLoad / KINDS.app.capacity) * 100)}% — add headroom.`);
    }
  }
  void total;
  const unique = [...new Set(problems)];
  return { load, util, edgeLoad, p99, problems: unique, notes, bottleneck: over[0]?.id ?? null, passed: unique.length === 0 };

  function fail(msg: string): SimResult {
    return { load, util: Object.fromEntries(nodes.map((n) => [n.id, 0])), edgeLoad, p99: 0, problems: [msg], notes: [], bottleneck: null, passed: false };
  }
}
