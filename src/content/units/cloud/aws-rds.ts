import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, kvPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def failover(writes, fail_at, cfg):
    if cfg["multi_az"]:
        recovered = fail_at + cfg["detect"] + cfg["promote"] + cfg["dns_ttl"]   #@multi
    else:
        recovered = fail_at + cfg["detect"] + cfg["restore"]                    #@single
    last_backup = fail_at // cfg["backup_every"] * cfg["backup_every"]          #@backup
    out, lost = [], 0
    for t in writes:                                                            #@loop
        if t < fail_at:
            out.append("ok")                                                    #@ok
            if not cfg["multi_az"] and t >= last_backup:
                lost += 1                                                       #@lost
        elif t < recovered:
            out.append("error")                                                 #@error
        else:
            out.append("ok")                                                    #@after
    return {"recovered_at": recovered, "outcomes": out, "lost": lost}
`;

interface In {
  writes: number[];
  failAt: number;
  detect: number;
  promote: number;
  dnsTtl: number;
  restore: number;
  backupEvery: number;
  multiAZ: string;
}

const MODES = ['Multi-AZ', 'Single-AZ'];

interface Cfg {
  writes: number[];
  failAt: number;
  detect: number;
  promote: number;
  dnsTtl: number;
  restore: number;
  backupEvery: number;
  multi: boolean;
}

function clean(i: In): Cfg {
  const writes = [...i.writes].filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  for (const [k, v] of Object.entries({ detect: i.detect, promote: i.promote, dnsTtl: i.dnsTtl, restore: i.restore })) if (!(v >= 0)) throw new Error(`${k} must be 0 or more`);
  if (!(i.backupEvery >= 1)) throw new Error('Backup interval must be at least 1 second');
  if (!(i.failAt >= 0)) throw new Error('Failure time must be 0 or more');
  return { writes, failAt: i.failAt, detect: i.detect, promote: i.promote, dnsTtl: i.dnsTtl, restore: i.restore, backupEvery: i.backupEvery, multi: i.multiAZ === MODES[0] };
}

function outcome(c: Cfg) {
  const recovered = c.multi ? c.failAt + c.detect + c.promote + c.dnsTtl : c.failAt + c.detect + c.restore;
  return { recovered, lastBackup: Math.floor(c.failAt / c.backupEvery) * c.backupEvery };
}

const NODES: ArchNode[] = [
  { id: 'app', label: 'App', x: 50, y: 125, shape: 'actor' },
  { id: 'dns', label: 'DB endpoint (DNS)', x: 190, y: 125, shape: 'pill' },
  { id: 'primary', label: 'Primary', x: 360, y: 45, shape: 'cylinder', sub: 'AZ-a' },
  { id: 'standby', label: 'Standby', x: 360, y: 125, shape: 'cylinder', sub: 'AZ-b' },
  { id: 'replica', label: 'Read replica', x: 360, y: 205, shape: 'cylinder', sub: 'async' },
  { id: 'backup', label: 'Snapshots (S3)', x: 565, y: 45, shape: 'cylinder' },
];
const EDGES: ArchEdge[] = [
  { from: 'app', to: 'dns' },
  { from: 'dns', to: 'primary' },
  { from: 'dns', to: 'standby' },
  { from: 'primary', to: 'standby', label: 'sync' },
  { from: 'primary', to: 'replica', label: 'async', dashed: true },
  { from: 'primary', to: 'backup', label: 'backup', dashed: true },
];

type Phase = 'healthy' | 'crashed' | 'detected' | 'promoted' | 'recovered';

const viz: VizDef<In> = {
  id: 'aws-rds',
  title: 'RDS failover timeline',
  code,
  language: 'python',
  inputs: [
    { key: 'writes', label: 'Application write times (s)', kind: 'numbers', default: [0, 60, 120, 200, 240, 260, 300, 330, 400], maxItems: 14 },
    { key: 'failAt', label: 'Primary fails at (s)', kind: 'number', default: 250 },
    { key: 'detect', label: 'Failure detection (s)', kind: 'number', default: 30 },
    { key: 'promote', label: 'Standby promotion (s)', kind: 'number', default: 60 },
    { key: 'dnsTtl', label: 'DNS flip / cache (s)', kind: 'number', default: 20 },
    { key: 'restore', label: 'Single-AZ restore time (s)', kind: 'number', default: 240 },
    { key: 'backupEvery', label: 'Backup every (s)', kind: 'number', default: 300 },
    { key: 'multiAZ', label: 'Deployment', kind: 'select', default: MODES[0], options: MODES },
  ],
  presets: [
    { label: 'Multi-AZ failover', input: {} },
    { label: 'Single-AZ crash (restore from backup)', input: { multiAZ: MODES[1] } },
    { label: 'Slow DNS cache', input: { dnsTtl: 120, writes: [200, 260, 300, 380, 420, 500] } },
    { label: 'No failure inside the writes', input: { failAt: 1000 } },
  ],
  run(input) {
    const c = clean(input);
    const { recovered, lastBackup } = outcome(c);
    const r = new Recorder(code);
    const tDetect = c.failAt + c.detect;
    const tPromote = c.multi ? tDetect + c.promote : recovered;
    type Ev = { t: number; rank: number; kind: 'fail' | 'detect' | 'promote' | 'recovered' | 'write' };
    const evs = ([
      { t: c.failAt, rank: 0, kind: 'fail' },
      { t: tDetect, rank: 1, kind: 'detect' },
      ...(c.multi ? [{ t: tPromote, rank: 2, kind: 'promote' as const }] : []),
      { t: recovered, rank: 3, kind: 'recovered' },
      ...c.writes.map((t) => ({ t, rank: 4, kind: 'write' as const })),
    ] as Ev[]).sort((a, b) => a.t - b.t || a.rank - b.rank);
    const log: { text: string; tone?: Tone }[] = [];
    const out: string[] = [];
    let lost = 0;
    let phase: Phase = 'healthy';
    const lastT = Math.max(recovered + 30, ...c.writes) + 10;
    const view = (now: number, flow: string | null, extra: Record<string, Tone> = {}): Panel[] => {
      const tones: Record<string, Tone> = { app: 'default', primary: 'active', standby: c.multi ? 'visited' : 'muted', replica: 'visited', ...extra };
      const edgeTones: Record<string, Tone> = {};
      let target: 'primary' | 'standby' = 'primary';
      if (phase === 'crashed' || phase === 'detected') tones.primary = 'error';
      if (phase === 'detected' && c.multi) tones.standby = 'compare';
      if (phase === 'promoted') {
        tones.primary = 'error';
        tones.standby = 'new';
      }
      if (phase === 'recovered') {
        if (c.multi) {
          tones.primary = 'error';
          tones.standby = 'found';
          target = 'standby';
        } else tones.primary = 'found';
      }
      edgeTones[`dns>${target === 'primary' ? 'standby' : 'primary'}`] = 'muted';
      if (phase === 'crashed' || phase === 'detected' || phase === 'promoted') edgeTones['dns>primary'] = 'error';
      const down = c.writes.length && now >= c.failAt ? [{ t: c.failAt, dur: Math.max(0.5, Math.min(now, recovered) - c.failAt), label: 'down', tone: 'error' as Tone }] : [];
      return [
        arch('Topology', 640, 250, NODES, EDGES, { tones, flow, edgeTones, subs: { standby: c.multi ? 'AZ-b' : 'not deployed' }, badges: { dns: phase === 'recovered' && c.multi ? `-> standby` : '' } }),
        { type: 'timeline', title: 'Timeline (seconds)', lanes: [{ label: 'Writes', events: c.writes.slice(0, out.length).map((t, i) => ({ t, label: out[i] === 'ok' ? '' : 'x', tone: (out[i] === 'ok' ? 'found' : 'error') as Tone })) }, { label: 'Database', events: down }], tMax: lastT, now },
        kvPanel('State', { mode: input.multiAZ, 'recovered at': c.failAt > now ? '?' : recovered, 'writes lost': lost, 'last backup': c.multi ? 'n/a (sync copy)' : lastBackup }, { 'writes lost': lost ? 'error' : 'found' }),
        logPanel('Events', log),
    ];
    };
    frame(r, c.multi ? 'multi' : 'single', c.multi ? `Multi-AZ: recovery = detect ${c.detect} + promote ${c.promote} + DNS ${c.dnsTtl}s` : `Single-AZ: recovery = detect ${c.detect} + restore ${c.restore}s`, view(0, null), { recovered_at: recovered });
    frame(r, 'backup', `Last backup before the failure was at t=${lastBackup}`, view(0, null), { last_backup: lastBackup });
    for (const e of evs) {
      r.op();
      if (e.kind === 'fail') {
        phase = 'crashed';
        log.push({ text: `t=${e.t} primary fails`, tone: 'error' });
        frame(r, 'loop', `t=${e.t}: the primary crashes`, view(e.t, null), { t: e.t });
      } else if (e.kind === 'detect') {
        phase = 'detected';
        log.push({ text: `t=${e.t} failure detected`, tone: 'compare' });
        frame(r, 'loop', c.multi ? `t=${e.t}: failure detected, standby chosen for promotion` : `t=${e.t}: failure detected, restore from snapshot begins`, view(e.t, null), { t: e.t });
      } else if (e.kind === 'promote') {
        phase = 'promoted';
        log.push({ text: `t=${e.t} standby promoted`, tone: 'new' });
        frame(r, 'loop', `t=${e.t}: standby promoted, waiting for DNS to point at it`, view(e.t, null), { t: e.t });
      } else if (e.kind === 'recovered') {
        phase = 'recovered';
        log.push({ text: `t=${e.t} service restored`, tone: 'found' });
        frame(r, 'after', c.multi ? `t=${e.t}: endpoint now resolves to the standby. Writes work again` : `t=${e.t}: restored database online (state from t=${lastBackup})`, view(e.t, null), { recovered_at: e.t });
      } else {
        const target = phase === 'recovered' && c.multi ? 'standby' : 'primary';
        if (e.t < c.failAt) {
          out.push('ok');
          const isLost = !c.multi && e.t >= lastBackup;
          if (isLost) lost++;
          log.push({ text: `t=${e.t} write ok${isLost ? ' (not in last backup)' : ''}`, tone: 'found' });
          frame(r, isLost ? 'lost' : 'ok', isLost ? `t=${e.t}: write acknowledged, but newer than the last backup` : `t=${e.t}: write acknowledged and copied to the standby`, view(e.t, `dns>${target}`), { t: e.t, lost });
        } else if (e.t < recovered) {
          out.push('error');
          log.push({ text: `t=${e.t} write fails`, tone: 'error' });
          frame(r, 'error', `t=${e.t}: write fails, database unreachable until t=${recovered}`, view(e.t, 'app>dns', { dns: 'error' }), { t: e.t });
        } else {
          out.push('ok');
          log.push({ text: `t=${e.t} write ok`, tone: 'found' });
          frame(r, 'after', `t=${e.t}: write succeeds again`, view(e.t, `dns>${target}`), { t: e.t });
        }
      }
    }
    frame(r, 'loop', `${out.filter((x) => x === 'error').length} writes failed, ${lost} acknowledged writes lost`, view(lastT, null), { errors: out.filter((x) => x === 'error').length, lost });
    return { frames: r.frames, result: { recovered_at: recovered, outcomes: out, lost } };
  },
  reference(input) {
    const c = clean(input);
    const recovered = c.failAt + c.detect + (c.multi ? c.promote + c.dnsTtl : c.restore);
    const lastBackup = c.failAt - (c.failAt % c.backupEvery);
    return {
      recovered_at: recovered,
      outcomes: c.writes.map((t) => (t >= c.failAt && t < recovered ? 'error' : 'ok')),
      lost: c.multi ? 0 : c.writes.filter((t) => t < c.failAt && t >= lastBackup).length,
    };
  },
};

const CFG = { detect: 30, promote: 60, dns_ttl: 20, restore: 240, backup_every: 300, multi_az: true };
const CFG1 = { ...CFG, multi_az: false };

const unit: Unit = {
  id: 'aws-rds',
  hook: 'RDS design questions boil down to: what survives a failure, how long is the outage, and what do read replicas actually buy you? Multi-AZ is for availability, replicas are for read scaling, and backups are for recovery.',
  predict: {
    prompt: 'Your app is read-heavy and the RDS primary is at 90% CPU. A teammate enables Multi-AZ to "fix the load". What does that do for read capacity?',
    options: ['Doubles it, since the standby serves reads', 'Nothing: the standby is not readable, it only takes over on failure', 'Halves latency by serving reads from a second AZ', 'It moves reads to a read replica automatically'],
    answer: 1,
    explain: 'In classic Multi-AZ the synchronous standby is idle until failover. To scale reads add read replicas (asynchronous, readable, possibly slightly stale).',
  },
  viz,
  deeper: {
    points: [
      '**Multi-AZ**: a synchronous standby in another AZ. Commits wait for both copies, so failover loses no committed data. Recovery takes tens of seconds to minutes (detect, promote, DNS).',
      '**Read replicas**: asynchronous copies that serve reads. They lag, so a read right after a write may be stale. A replica can be promoted manually for disaster recovery, including cross-region.',
      '**Backups**: automated daily snapshots plus transaction logs give point-in-time restore. A restore builds a *new* instance, so it is slow and the endpoint changes.',
      'Clients must reconnect after failover: keep DNS caching short and retry connections instead of holding forever-open sockets.',
      'RPO (data you can lose) and RTO (time to recover) map directly to this: Multi-AZ ~ zero RPO, minutes of RTO; restore from backup ~ minutes of RPO, longer RTO.',
    ],
    pitfalls: ['Treating a read replica as a backup (it copies deletes too)', 'Pointing reporting queries at the primary', 'Assuming failover is instant and having no connection retry'],
  },
  practice: {
    language: 'python',
    fnName: 'pick_topology',
    statement: 'Return `{"multi_az": ..., "read_replicas": ..., "cross_region": ...}`. Multi-AZ is on when `needs_ha` is true. Use one read replica per 4 reads-per-write of `read_write_ratio` (whole numbers, at most 5). `cross_region` is true when a disaster-recovery region name is given (not None).',
    signature: 'def pick_topology(needs_ha, read_write_ratio, dr_region):',
    solution: `def pick_topology(needs_ha, read_write_ratio, dr_region):
    replicas = @@min(5, read_write_ratio // 4)@@
    return {
        "multi_az": @@needs_ha@@,
        "read_replicas": replicas,
        "cross_region": @@dr_region is not None@@,
    }`,
    tests: [
      { args: [true, 1, null], expected: { multi_az: true, read_replicas: 0, cross_region: false }, name: 'HA only' },
      { args: [false, 4, null], expected: { multi_az: false, read_replicas: 1, cross_region: false }, name: 'one replica at ratio 4' },
      { args: [true, 11, 'eu-west-1'], expected: { multi_az: true, read_replicas: 2, cross_region: true }, name: 'ratio 11 and a DR region' },
      { args: [false, 100, null], expected: { multi_az: false, read_replicas: 5, cross_region: false }, name: 'replicas are capped at five' },
      { args: [false, 3, 'us-west-2'], expected: { multi_az: false, read_replicas: 0, cross_region: true }, name: 'DR without replicas' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'failover',
    statement: 'The dashboard reports one extra failed write: a write that arrives exactly when the new primary becomes reachable is rejected. Fix `failover`.',
    buggy: `def failover(writes, fail_at, cfg):
    recovered = fail_at + cfg["detect"] + cfg["promote"] + cfg["dns_ttl"]
    out = []
    for t in writes:
        if t < fail_at:
            out.append("ok")
        elif t <= recovered:
            out.append("error")
        else:
            out.append("ok")
    return {"recovered_at": recovered, "outcomes": out}`,
    fixed: `def failover(writes, fail_at, cfg):
    recovered = fail_at + cfg["detect"] + cfg["promote"] + cfg["dns_ttl"]
    out = []
    for t in writes:
        if t < fail_at:
            out.append("ok")
        elif t < recovered:
            out.append("error")
        else:
            out.append("ok")
    return {"recovered_at": recovered, "outcomes": out}`,
    tests: [
      { args: [[0, 10, 20], 100, CFG], expected: { recovered_at: 210, outcomes: ['ok', 'ok', 'ok'] }, name: 'no failure yet' },
      { args: [[99, 100, 150, 209], 100, CFG], expected: { recovered_at: 210, outcomes: ['ok', 'error', 'error', 'error'] }, name: 'outage window' },
      { args: [[210, 300], 100, CFG], expected: { recovered_at: 210, outcomes: ['ok', 'ok'] }, name: 'exactly at recovery works' },
      { args: [[100], 100, { ...CFG, detect: 0, promote: 0, dns_ttl: 0 }], expected: { recovered_at: 100, outcomes: ['ok'] }, name: 'instant failover' },
    ],
    bugType: 'off-by-one (inclusive end of outage)',
    hint: 'The outage is the half-open interval [fail_at, recovered). Which comparison treats `recovered` itself as still down?',
    explanation: 'The service is back at `recovered`, so a write at that instant succeeds. `t <= recovered` extends the outage by one tick; use `t < recovered`.',
  },
  boss: {
    title: 'Failover with data loss',
    statement: 'Write `failover(writes, fail_at, cfg)` returning `{"recovered_at", "outcomes", "lost"}`. `cfg` has detect, promote, dns_ttl, restore, backup_every, multi_az. Multi-AZ recovers at `fail_at + detect + promote + dns_ttl`, single-AZ at `fail_at + detect + restore`. Writes before `fail_at` are "ok", writes in `[fail_at, recovered_at)` are "error", later ones "ok". `lost` counts "ok" writes made before the failure that the system forgot: always 0 for Multi-AZ (synchronous copy); for single-AZ every write with `t >= last_backup` and `t < fail_at`, where `last_backup = fail_at // backup_every * backup_every`.',
    language: 'python',
    fnName: 'failover',
    starter: `def failover(writes, fail_at, cfg):
    pass
`,
    solution: `def failover(writes, fail_at, cfg):
    if cfg["multi_az"]:
        recovered = fail_at + cfg["detect"] + cfg["promote"] + cfg["dns_ttl"]
    else:
        recovered = fail_at + cfg["detect"] + cfg["restore"]
    last_backup = fail_at // cfg["backup_every"] * cfg["backup_every"]
    out, lost = [], 0
    for t in writes:
        if t < fail_at:
            out.append("ok")
            if not cfg["multi_az"] and t >= last_backup:
                lost += 1
        elif t < recovered:
            out.append("error")
        else:
            out.append("ok")
    return {"recovered_at": recovered, "outcomes": out, "lost": lost}`,
    tests: [
      { args: [[0, 60, 260, 400], 250, CFG], expected: { recovered_at: 360, outcomes: ['ok', 'ok', 'error', 'ok'], lost: 0 }, name: 'Multi-AZ loses nothing' },
      { args: [[0, 60, 260, 600], 250, CFG1], expected: { recovered_at: 520, outcomes: ['ok', 'ok', 'error', 'ok'], lost: 2 }, name: 'single-AZ loses writes since last backup' },
      { args: [[10, 290, 310, 315], 320, CFG1], expected: { recovered_at: 590, outcomes: ['ok', 'ok', 'ok', 'ok'], lost: 2 }, name: 'last backup at 300' },
      { args: [[10, 290, 310], 320, { ...CFG1, backup_every: 20 }], expected: { recovered_at: 590, outcomes: ['ok', 'ok', 'ok'], lost: 0 }, name: 'backup just before the crash' },
      { args: [[], 50, CFG], expected: { recovered_at: 160, outcomes: [], lost: 0 }, name: 'no writes' },
      { args: [[360, 359], 250, CFG], expected: { recovered_at: 360, outcomes: ['ok', 'error'], lost: 0 }, name: 'boundary of the outage window' },
    ],
    hints: ['Compute `recovered` first from the deployment type, then walk the writes comparing each time with `fail_at` and `recovered`.', 'Count a lost write only for single-AZ writes with `last_backup <= t < fail_at`; `last_backup` uses integer division.'],
    combines: ['aws-ec2'],
  },
  quiz: [
    {
      prompt: 'You need to survive the loss of an entire AWS Region with minimal data loss. Which feature fits best?',
      options: ['Multi-AZ', 'A cross-region read replica that can be promoted', 'A larger instance', 'Automated backups only'],
      answer: 1,
      explain: 'Multi-AZ stays inside one region. A cross-region replica (or cross-region backup copy) lets you stand up the database elsewhere.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
