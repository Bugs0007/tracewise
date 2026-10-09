import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { fmtBig, kvPanel, needNum, notePanel, r2 } from '@/content/lib/sysdesign-hld-2';

const code = `
import math

def estimate(dau, req_per_user, reads_per_write, payload_kb, years, peak_factor, per_server, target_util):
    per_day = dau * req_per_user                                   #@perDay
    avg_qps = per_day / 86400                                      #@avg
    peak_qps = avg_qps * peak_factor                               #@peak
    write_qps = peak_qps / (reads_per_write + 1)                   #@split
    read_qps = peak_qps - write_qps
    writes_per_day = per_day / (reads_per_write + 1)
    gb_per_day = writes_per_day * payload_kb / 1e6                 #@daily
    tb_total = gb_per_day * 365 * years / 1000                     #@total
    mb_per_s = peak_qps * payload_kb / 1000                        #@bw
    servers = math.ceil(peak_qps / (per_server * target_util))     #@servers
    return {"peak_qps": peak_qps, "tb_total": tb_total, "servers": servers}   #@done
`;

interface In {
  dau: number;
  reqPerUser: number;
  readsPerWrite: number;
  payloadKb: number;
  years: number;
  peakFactor: number;
  perServer: number;
  targetUtil: number;
}

function calc(i: In) {
  const perDay = i.dau * i.reqPerUser;
  const avg = perDay / 86400;
  const peak = avg * i.peakFactor;
  const writeQps = peak / (i.readsPerWrite + 1);
  const readQps = peak - writeQps;
  const writesPerDay = perDay / (i.readsPerWrite + 1);
  const gbDay = (writesPerDay * i.payloadKb) / 1e6;
  const tb = (gbDay * 365 * i.years) / 1000;
  const mbps = (peak * i.payloadKb) / 1000;
  const servers = Math.ceil(peak / (i.perServer * i.targetUtil) - 1e-9);
  return { perDay, avg, peak, writeQps, readQps, writesPerDay, gbDay, tb, mbps, servers };
}

const viz: VizDef<In> = {
  id: 'hld-estimation',
  title: 'Back-of-envelope estimator',
  code,
  language: 'python',
  inputs: [
    { key: 'dau', label: 'Daily active users', kind: 'number', default: 10_000_000 },
    { key: 'reqPerUser', label: 'Requests per user per day', kind: 'number', default: 20 },
    { key: 'readsPerWrite', label: 'Reads per write', kind: 'number', default: 9 },
    { key: 'payloadKb', label: 'Payload per request (KB)', kind: 'number', default: 2 },
    { key: 'years', label: 'Retention (years)', kind: 'number', default: 3 },
    { key: 'peakFactor', label: 'Peak / average factor', kind: 'number', default: 3 },
    { key: 'perServer', label: 'QPS one server handles', kind: 'number', default: 500 },
    { key: 'targetUtil', label: 'Target utilisation (0-1)', kind: 'number', default: 0.7 },
  ],
  presets: [
    { label: 'Photo-sharing app', input: { dau: 10_000_000, reqPerUser: 20, readsPerWrite: 9, payloadKb: 2, years: 3, peakFactor: 3, perServer: 500, targetUtil: 0.7 } },
    { label: 'Chat app (write-heavy)', input: { dau: 50_000_000, reqPerUser: 40, readsPerWrite: 1, payloadKb: 1, years: 1, peakFactor: 2, perServer: 2000, targetUtil: 0.6 } },
    { label: 'Small internal tool', input: { dau: 5000, reqPerUser: 100, readsPerWrite: 19, payloadKb: 5, years: 5, peakFactor: 4, perServer: 200, targetUtil: 0.5 } },
  ],
  run(input) {
    const i: In = {
      dau: needNum('DAU', input.dau, 1, 1e10),
      reqPerUser: needNum('requests per user', input.reqPerUser, 0.01, 1e5),
      readsPerWrite: needNum('reads per write', input.readsPerWrite, 0, 1e4),
      payloadKb: needNum('payload', input.payloadKb, 0.001, 1e6),
      years: needNum('retention', input.years, 0.01, 50),
      peakFactor: needNum('peak factor', input.peakFactor, 1, 100),
      perServer: needNum('QPS per server', input.perServer, 1, 1e6),
      targetUtil: needNum('target utilisation', input.targetUtil, 0.05, 1),
    };
    const c = calc(i);
    const r = new Recorder(code);
    const derived: Record<string, string> = {};
    const tones: Record<string, Tone> = {};
    const show = (key: string, value: string, formula: string, anchor: string, caption: string, ops = 1) => {
      derived[key] = value;
      for (const k of Object.keys(tones)) tones[k] = 'visited';
      tones[key] = 'active';
      r.op(ops);
      r.step(anchor, caption, [notePanel(formula, 'compare'), kvPanel('Derived so far', derived, tones)], { [key]: value });
    };
    r.step(undefined, `${fmtBig(i.dau)} users x ${i.reqPerUser} requests/day, ${i.readsPerWrite}:1 reads to writes, ${i.payloadKb} KB each`, [kvPanel('Assumptions', { DAU: fmtBig(i.dau), 'requests / user / day': i.reqPerUser, 'reads per write': i.readsPerWrite, 'payload (KB)': i.payloadKb, 'retention (years)': i.years, 'peak / average': i.peakFactor, 'QPS per server': i.perServer, 'target utilisation': i.targetUtil })], { dau: i.dau });
    show('requests/day', fmtBig(c.perDay), `${fmtBig(i.dau)} users × ${i.reqPerUser} requests = ${fmtBig(c.perDay)} requests per day`, 'perDay', `Requests per day = ${fmtBig(i.dau)} × ${i.reqPerUser} = ${fmtBig(c.perDay)}`);
    show('avg QPS', fmtBig(r2(c.avg)), `${fmtBig(c.perDay)} requests ÷ 86,400 seconds per day = ${r2(c.avg)} per second`, 'avg', `Per day → per second: ${fmtBig(c.perDay)} ÷ 86,400 ≈ ${fmtBig(r2(c.avg))} QPS`);
    show('peak QPS', fmtBig(r2(c.peak)), `${fmtBig(r2(c.avg))} average × ${i.peakFactor} peak factor = ${fmtBig(r2(c.peak))} QPS`, 'peak', `Peak QPS = ${fmtBig(r2(c.avg))} × ${i.peakFactor} ≈ ${fmtBig(r2(c.peak))}. Design for this`);
    show('write QPS', fmtBig(r2(c.writeQps)), `peak ÷ (reads per write + 1) = ${fmtBig(r2(c.peak))} ÷ ${i.readsPerWrite + 1} = ${fmtBig(r2(c.writeQps))} writes/s; reads get the other ${fmtBig(r2(c.readQps))}/s`, 'split', `Split ${i.readsPerWrite}:1 → ${fmtBig(r2(c.readQps))} reads/s and ${fmtBig(r2(c.writeQps))} writes/s`);
    show('storage/day', `${fmtBig(r2(c.gbDay))} GB`, `${fmtBig(r2(c.writesPerDay))} writes/day × ${i.payloadKb} KB = ${fmtBig(r2(c.writesPerDay * i.payloadKb))} KB = ${fmtBig(r2(c.gbDay))} GB (only writes add data; 1 GB = 1,000,000 KB)`, 'daily', `Only writes are stored: ${fmtBig(r2(c.writesPerDay))}/day × ${i.payloadKb} KB ≈ ${fmtBig(r2(c.gbDay))} GB/day`);
    show('storage total', `${fmtBig(r2(c.tb))} TB`, `${fmtBig(r2(c.gbDay))} GB/day × 365 × ${i.years} years ÷ 1,000 = ${fmtBig(r2(c.tb))} TB (before replication)`, 'total', `Retention: ${fmtBig(r2(c.gbDay))} GB × 365 × ${i.years} years ≈ ${fmtBig(r2(c.tb))} TB`);
    show('bandwidth', `${fmtBig(r2(c.mbps))} MB/s`, `${fmtBig(r2(c.peak))} QPS × ${i.payloadKb} KB = ${fmtBig(r2(c.peak * i.payloadKb))} KB/s = ${fmtBig(r2(c.mbps))} MB/s ≈ ${fmtBig(r2(c.mbps * 8))} Mbit/s`, 'bw', `Peak bandwidth = ${fmtBig(r2(c.peak))} × ${i.payloadKb} KB ≈ ${fmtBig(r2(c.mbps))} MB/s (${fmtBig(r2(c.mbps * 8))} Mbit/s)`);
    show('app servers', String(c.servers), `ceil(${fmtBig(r2(c.peak))} ÷ (${i.perServer} × ${i.targetUtil})) = ceil(${r2(c.peak / (i.perServer * i.targetUtil))}) = ${c.servers} servers`, 'servers', `Servers = ceil(${fmtBig(r2(c.peak))} ÷ ${r2(i.perServer * i.targetUtil)} usable QPS each) = ${c.servers}`);
    const result = { peak_qps: r2(c.peak), tb_total: r2(c.tb), servers: c.servers };
    r.step('done', `Summary: ${fmtBig(r2(c.peak))} peak QPS, ${fmtBig(r2(c.tb))} TB, ${c.servers} app servers`, [{ type: 'chart', title: 'Traffic (queries per second)', kind: 'bar', xLabel: '0 avg · 1 peak · 2 reads · 3 writes', yLabel: 'QPS', series: [{ label: 'QPS', points: [[0, r2(c.avg)], [1, r2(c.peak)], [2, r2(c.readQps)], [3, r2(c.writeQps)]], tone: 'swap' }] }, kvPanel('Result', { 'peak QPS': fmtBig(r2(c.peak)), 'storage (TB)': fmtBig(r2(c.tb)), servers: c.servers }, { servers: 'found' })], result);
    return { frames: r.frames, result };
  },
  reference(i) {
    const peak = (i.dau * i.reqPerUser * i.peakFactor) / 86400;
    const tb = (i.dau * i.reqPerUser * i.payloadKb * 365 * i.years) / ((i.readsPerWrite + 1) * 1e6 * 1000);
    return { peak_qps: r2(peak), tb_total: r2(tb), servers: Math.ceil(peak / (i.perServer * i.targetUtil) - 1e-9) };
  },
};

const estimateFixed = `import math

def estimate(dau, req_per_user, reads_per_write, payload_kb, years, peak_factor, per_server, target_util):
    per_day = dau * req_per_user
    avg_qps = per_day / 86400
    peak_qps = avg_qps * peak_factor
    write_qps = peak_qps / (reads_per_write + 1)
    writes_per_day = per_day / (reads_per_write + 1)
    gb_per_day = writes_per_day * payload_kb / 1e6
    tb_total = gb_per_day * 365 * years / 1000
    servers = math.ceil(peak_qps / (per_server * target_util))
    return {"avg_qps": avg_qps, "peak_qps": peak_qps, "write_qps": write_qps, "gb_per_day": gb_per_day, "tb_total": tb_total, "servers": servers}`;

const estimateTests = [
  { args: [1000000, 10, 4, 10, 1, 2, 100, 0.5], expected: { avg_qps: 115.74074074074075, peak_qps: 231.4814814814815, write_qps: 46.2962962962963, gb_per_day: 20.0, tb_total: 7.3, servers: 5 }, name: 'small service' },
  { args: [10000000, 20, 9, 2, 3, 3, 500, 0.7], expected: { avg_qps: 2314.814814814815, peak_qps: 6944.444444444444, write_qps: 694.4444444444445, gb_per_day: 40.0, tb_total: 43.8, servers: 20 }, name: 'photo app' },
  { args: [86400, 1, 0, 1, 1, 1, 1, 1.0], expected: { avg_qps: 1.0, peak_qps: 1.0, write_qps: 1.0, gb_per_day: 0.0864, tb_total: 0.031536, servers: 1 }, name: '1 request per second, all writes' },
  { args: [2000000, 5, 1, 100, 0.5, 2, 250, 0.8], expected: { avg_qps: 115.74074074074075, peak_qps: 231.4814814814815, write_qps: 115.74074074074075, gb_per_day: 500.0, tb_total: 91.25, servers: 2 }, name: 'big payloads, short retention' },
];

const unit: Unit = {
  id: 'hld-estimation',
  hook: 'Capacity estimation is where design interviews are won or lost: a quick, labelled chain of numbers shows you can size a system and catch order-of-magnitude mistakes before drawing a single box.',
  predict: {
    prompt: '10 million users make 20 requests each per day. Roughly what is the AVERAGE requests per second? (A day has about 100,000 seconds if you round.)',
    options: ['About 20', 'About 2,000', 'About 200,000', 'About 20 million'],
    answer: 1,
    explain: '10M x 20 = 200M requests/day. Divide by ~86,400 s (or ~100,000 to round): about 2,000-2,300 QPS. Peak traffic is then a few times higher.',
  },
  viz,
  deeper: {
    points: [
      'Always label units and say per day vs per second out loud: requests/day ÷ 86,400 = requests/second.',
      'Design for peak, not average. A common rule is peak = 2-5x average; spiky products (sales, sports) can be 10x or more.',
      'Storage grows with WRITES only. Multiply by retention, then by the replication factor (typically 3x) for raw disk.',
      'Bandwidth = QPS x payload. Convert bytes to bits (x8) when comparing with network links quoted in Mbit/s or Gbit/s.',
      'Servers = peak QPS ÷ (per-server QPS x target utilisation). Leave headroom (60-70%) and add a spare for failures (N+1).',
      'Round aggressively (86,400 ≈ 10^5, 1 KB ≈ 10^3 bytes). The goal is the right power of ten, not four decimals.',
    ],
    pitfalls: ['Mixing per-day and per-second numbers', 'Using average QPS to size servers', 'Counting reads as storage', 'Forgetting replication when sizing disks'],
  },
  practice: {
    language: 'python',
    fnName: 'estimate',
    compare: 'float',
    statement:
      'Return a dict with: `avg_qps` (requests/day ÷ 86400), `peak_qps` (avg × peak factor), `write_qps` (peak ÷ (reads_per_write + 1)), `gb_per_day` (writes per day × payload_kb ÷ 1e6), `tb_total` (gb_per_day × 365 × years ÷ 1000) and `servers` (ceil of peak ÷ (per_server × target_util)). Requests per day = dau × req_per_user.',
    signature: 'def estimate(dau, req_per_user, reads_per_write, payload_kb, years, peak_factor, per_server, target_util):',
    solution: `import math

def estimate(dau, req_per_user, reads_per_write, payload_kb, years, peak_factor, per_server, target_util):
    per_day = dau * req_per_user
    avg_qps = @@per_day / 86400@@
    peak_qps = avg_qps * peak_factor
    write_qps = peak_qps / (@@reads_per_write + 1@@)
    writes_per_day = per_day / (reads_per_write + 1)
    gb_per_day = writes_per_day * payload_kb / @@1e6@@
    tb_total = gb_per_day * 365 * years / 1000
    servers = @@math.ceil(peak_qps / (per_server * target_util))@@
    return {"avg_qps": avg_qps, "peak_qps": peak_qps, "write_qps": write_qps, "gb_per_day": gb_per_day, "tb_total": tb_total, "servers": servers}`,
    tests: estimateTests,
  },
  debug: {
    language: 'python',
    fnName: 'estimate',
    compare: 'float',
    statement: 'The estimator says a small service needs thousands of servers. Find the units mix-up.',
    buggy: estimateFixed.replace('peak_qps = avg_qps * peak_factor', 'peak_qps = per_day * peak_factor'),
    fixed: estimateFixed,
    tests: estimateTests,
    bugType: 'units mix-up (per day vs per second)',
    hint: 'Look at what unit `peak_qps` ends up in. Which variable is already per second?',
    explanation: '`per_day` is requests per DAY. Multiplying it by the peak factor gives a per-day number that is then treated as QPS: off by 86,400x. Peak QPS must start from `avg_qps` (already per second).',
  },
  boss: {
    title: 'Cluster plan',
    statement:
      'Return `{"app_servers": a, "db_nodes": d}`. App servers = `ceil(peak_qps / (per_server * target_util))` plus one spare for failures. DB nodes = `ceil(total_tb * replicas / tb_per_node)`, but never fewer than 1.',
    language: 'python',
    fnName: 'plan_cluster',
    compare: 'float',
    starter: `def plan_cluster(peak_qps, per_server, target_util, total_tb, tb_per_node, replicas):
    # your code here
    pass
`,
    solution: `import math

def plan_cluster(peak_qps, per_server, target_util, total_tb, tb_per_node, replicas):
    app = math.ceil(peak_qps / (per_server * target_util)) + 1
    db = max(1, math.ceil(total_tb * replicas / tb_per_node))
    return {"app_servers": app, "db_nodes": db}`,
    tests: [
      { args: [6944, 500, 0.7, 43.8, 10, 3], expected: { app_servers: 21, db_nodes: 14 }, name: 'photo app at peak' },
      { args: [1000, 100, 0.5, 0, 5, 3], expected: { app_servers: 21, db_nodes: 1 }, name: 'no data still needs one node' },
      { args: [350, 100, 1.0, 20, 10, 3], expected: { app_servers: 5, db_nodes: 6 }, name: 'fractional servers round up' },
      { args: [10, 100, 0.5, 5, 10, 1], expected: { app_servers: 2, db_nodes: 1 }, name: 'tiny load: still 2 servers' },
      { args: [2000, 250, 0.8, 100, 25, 3], expected: { app_servers: 11, db_nodes: 12 }, name: 'exact division, then spare' },
    ],
    hints: ['Two independent formulas: one for stateless app servers, one for storage nodes. Use `math.ceil` for both.', 'Spare = `+ 1` on the app tier only. Wrap the DB count in `max(1, ...)`.'],
    combines: ['hld-scaling'],
  },
  quiz: [
    {
      prompt: 'You estimate 4 TB of data per year. What raw disk should you provision for one year with 3x replication?',
      options: ['4 TB', '7 TB', '12 TB', '3 TB'],
      answer: 2,
      explain: 'Replication triples the stored bytes: 4 TB × 3 = 12 TB (plus headroom for indexes and growth).',
    },
  ],
};

export default unit;
