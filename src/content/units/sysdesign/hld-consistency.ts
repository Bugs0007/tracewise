import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, needInt, notePanel } from '@/content/lib/sysdesign-hld-2';

const code = `
def write(replicas, w, version):
    for i in range(w):
        replicas[i] = version                                  #@write

def quorum_read(replicas, start, r):
    n = len(replicas)
    seen = [replicas[(start + i) % n] for i in range(r)]       #@contact
    return max(seen)                                           #@newest

def is_strong(n, r, w):
    return r + w > n                                           #@overlap
`;

interface In {
  n: number;
  r: number;
  w: number;
  offset: number;
}

const viz: VizDef<In> = {
  id: 'hld-consistency',
  title: 'Quorum reads and writes (N, R, W)',
  code,
  language: 'python',
  inputs: [
    { key: 'n', label: 'Replicas N', kind: 'number', default: 5 },
    { key: 'r', label: 'Read quorum R', kind: 'number', default: 2 },
    { key: 'w', label: 'Write quorum W', kind: 'number', default: 2 },
    { key: 'offset', label: 'First read starts at replica', kind: 'number', default: 2, help: 'Later reads start one replica further along.' },
  ],
  presets: [
    { label: 'R+W ≤ N (eventual)', input: { n: 5, r: 2, w: 2, offset: 2 } },
    { label: 'R+W > N (quorum overlap)', input: { n: 5, r: 3, w: 3, offset: 2 } },
    { label: 'R=1, W=1 (monotonic reads break)', input: { n: 3, r: 1, w: 1, offset: 0 } },
    { label: 'W=N (strong writes, cheap reads)', input: { n: 3, r: 1, w: 3, offset: 1 } },
  ],
  run(input) {
    const n = needInt('N', input.n, 1, 7);
    const r = needInt('R', input.r, 1, n);
    const w = needInt('W', input.w, 1, n);
    const offset = needInt('offset', input.offset, 0, n - 1);
    const rec = new Recorder(code);
    const replicas = new Array<number>(n).fill(1);
    const strong = r + w > n;
    const panel = (tones: Record<number, Tone> = {}, title = 'Replica versions'): ArrayPanel => ({
      type: 'array',
      title,
      values: replicas.map((v) => `v${v}`),
      tones,
      indexLabels: replicas.map((_, i) => `R${i}`),
    });
    const quorumKv = () => kvPanel('Quorum rule', { N: n, R: r, W: w, 'R + W': r + w, 'R + W > N?': strong ? 'yes: every read set overlaps the write set' : 'no: a read can miss the new version' }, { 'R + W > N?': strong ? 'found' : 'error' });

    rec.step('overlap', `N=${n}, R=${r}, W=${w}: R + W = ${r + w} ${strong ? '>' : '≤'} N, so reads ${strong ? 'must' : 'need not'} overlap the write`, [panel(), quorumKv()], { N: n, R: r, W: w });
    for (let i = 0; i < w; i++) {
      replicas[i] = 2;
      rec.op();
      const tones: Record<number, Tone> = {};
      for (let k = 0; k <= i; k++) tones[k] = 'swap';
      rec.step('write', `Write v2 reaches replica R${i} (${i + 1} of W=${w})`, [panel(tones)], { written: i + 1, W: w });
    }
    rec.step('write', `Write acked after ${w} replicas. ${n - w} replica${n - w === 1 ? '' : 's'} still hold v1`, [panel(Object.fromEntries(Array.from({ length: w }, (_, k) => [k, 'done' as Tone]))), quorumKv()], { acked: true });

    const seenVersions: number[] = [];
    let stale = 0;
    let regressions = 0;
    for (let i = 0; i < 4; i++) {
      const start = (offset + i) % n;
      const idx = Array.from({ length: r }, (_, k) => (start + k) % n);
      const tones: Record<number, Tone> = {};
      idx.forEach((j) => (tones[j] = 'compare'));
      rec.op(r);
      rec.step('contact', `Read ${i + 1}: ask ${r} replica${r > 1 ? 's' : ''} starting at R${start}: ${idx.map((j) => `R${j}=v${replicas[j]}`).join(', ')}`, [panel(tones)], { read: i + 1, start });
      const newest = Math.max(...idx.map((j) => replicas[j]));
      const isStale = newest < 2;
      const regress = seenVersions.length > 0 && newest < seenVersions[seenVersions.length - 1];
      if (isStale) stale++;
      if (regress) regressions++;
      seenVersions.push(newest);
      idx.forEach((j) => (tones[j] = replicas[j] === newest ? (isStale ? 'error' : 'found') : 'muted'));
      rec.step('newest', isStale ? `Read ${i + 1} returns v${newest}: stale, the write is invisible` : regress ? `Read ${i + 1} returns v${newest}: went backwards after v${seenVersions[i - 1]}` : `Read ${i + 1} returns v${newest}: the newest version`, [panel(tones)], { returned: `v${newest}`, stale: isStale, regress });
    }
    const verdict = strong ? 'Quorum overlap: every read saw v2 (and versions never went backwards)' : regressions ? `Reads saw ${seenVersions.map((v) => 'v' + v).join(', ')}: monotonic reads violated ${regressions}x` : stale ? `${stale} of 4 reads were stale: only eventually consistent` : 'These reads happened to hit fresh replicas, but nothing guaranteed it';
    rec.step('overlap', verdict, [kvPanel('Outcome', { reads: seenVersions.map((v) => 'v' + v).join(' '), stale, regressions }, { stale: stale ? 'error' : 'found', regressions: regressions ? 'error' : 'found' }), notePanel(strong ? 'Strong-ish: with R + W > N a read always intersects the latest write.' : 'Eventual: replicas converge later, but a read in between can be old, or even go backwards.', strong ? 'found' : 'compare')], { strong });
    return { frames: rec.frames, result: { strong, reads: seenVersions, stale, regressions } };
  },
  reference({ n, r, w, offset }) {
    const ver = (j: number) => (j < w ? 2 : 1);
    const reads = [0, 1, 2, 3].map((i) => Math.max(...Array.from({ length: r }, (_, k) => ver((offset + i + k) % n))));
    return {
      strong: r + w > n,
      reads,
      stale: reads.filter((v) => v < 2).length,
      regressions: reads.filter((v, i) => i > 0 && v < reads[i - 1]).length,
    };
  },
};

const levelTests = [
  { args: [3, 2, 2], expected: 'strong', name: 'majority quorums' },
  { args: [3, 1, 3], expected: 'strong', name: 'write all, read one' },
  { args: [3, 1, 2], expected: 'eventual', name: 'R + W == N is NOT enough' },
  { args: [5, 3, 3], expected: 'strong' },
  { args: [5, 2, 3], expected: 'eventual' },
  { args: [3, 4, 1], expected: 'invalid', name: 'R larger than N' },
  { args: [1, 1, 1], expected: 'strong', name: 'single node' },
];

const unit: Unit = {
  id: 'hld-consistency',
  hook: '"Strong" and "eventual" are two ends of a menu. Interviewers want you to name the guarantee a user actually needs (their own writes, never going backwards) and to show you can compute when a quorum gives it.',
  predict: {
    prompt: 'N = 3 replicas, W = 2, R = 1. Can a read return a value older than the last acknowledged write?',
    options: ['No, W = 2 is a majority so reads are always fresh', 'Yes, R + W = 3 is not greater than N, so the single replica read can miss the write', 'No, replicas sync instantly', 'Only if two replicas fail'],
    answer: 1,
    explain: 'The write reached 2 replicas, but the one replica you read may be the third. A guaranteed overlap needs R + W > N (here R + W = 3, not above 3).',
  },
  viz,
  deeper: {
    points: [
      'Strong (linearizable): once a write is acknowledged, every later read anywhere sees it. It costs coordination latency and availability during partitions.',
      'Eventual: if writes stop, replicas converge. Reads in the meantime may return old data.',
      'Read-your-writes: a client always sees its own previous writes (route its reads to the leader or a fresh-enough replica).',
      'Monotonic reads: a client never sees data go backwards in time (pin each client to one replica or track a version token).',
      'Quorums: pick R and W so R + W > N and the read set always overlaps the write set. W = N, R = 1 favours reads; R = N, W = 1 favours writes; R = W = majority balances them.',
      'Read repair: a quorum read that spots a stale replica writes the newest version back to it.',
    ],
    complexity: { time: 'Latency of the slowest replica among R (or W) contacted', space: 'N copies' },
    pitfalls: ['Believing R + W = N is enough (it must be strictly greater)', 'Assuming a quorum alone gives linearizability (concurrent writes, clocks and sloppy quorums still matter)', 'Ignoring that a single client can bounce between replicas and see time go backwards'],
  },
  practice: {
    language: 'python',
    fnName: 'quorum_read',
    statement: '`versions[i]` is the version stored on replica `i`. A quorum read contacts `r` consecutive replicas starting at index `start` (wrapping around the end of the list) and returns the highest version it sees.',
    signature: 'def quorum_read(versions, start, r):',
    solution: `def quorum_read(versions, start, r):
    n = len(versions)
    seen = [versions[@@(start + i) % n@@] for i in range(@@r@@)]
    return @@max(seen)@@`,
    tests: [
      { args: [[2, 1, 1], 0, 1], expected: 2, name: 'one replica, fresh' },
      { args: [[2, 1, 1], 1, 1], expected: 1, name: 'one replica, stale' },
      { args: [[2, 1, 1], 2, 2], expected: 2, name: 'wraps around the end' },
      { args: [[1, 3, 2], 0, 3], expected: 3, name: 'ask everyone' },
      { args: [[5], 0, 1], expected: 5, name: 'single replica' },
      { args: [[1, 2, 3, 4], 3, 2], expected: 4, name: 'wrap with two' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'consistency_level',
    statement: 'A config checker says N=3, R=1, W=2 is "strong", yet reads sometimes miss the latest write. Fix the check (it should return "strong" only when the read and write sets must overlap).',
    buggy: `def consistency_level(n, r, w):
    if r < 1 or w < 1 or r > n or w > n:
        return "invalid"
    if r + w >= n:
        return "strong"
    return "eventual"`,
    fixed: `def consistency_level(n, r, w):
    if r < 1 or w < 1 or r > n or w > n:
        return "invalid"
    if r + w > n:
        return "strong"
    return "eventual"`,
    tests: levelTests,
    bugType: 'off-by-one (>= vs >)',
    hint: 'Try N=3, R=1, W=2: pick the 2 replicas that were written and the 1 replica that is read. Can they be different replicas?',
    explanation: 'Overlap needs R + W strictly greater than N (pigeonhole). With R + W == N a read set and write set can be completely disjoint, so a read can miss the write.',
  },
  boss: {
    title: 'Quorum read with read repair',
    statement:
      '`versions[i]` is the version on replica `i`. Read `r` consecutive replicas starting at `start` (wrapping). Return `[newest, repaired, new_versions]`: the newest version seen, the sorted indices among the contacted replicas that held an older version, and a copy of `versions` where those replicas have been updated to `newest`. Do not change the input list.',
    language: 'python',
    fnName: 'read_with_repair',
    starter: `def read_with_repair(versions, start, r):
    # your code here
    pass
`,
    solution: `def read_with_repair(versions, start, r):
    n = len(versions)
    idx = [(start + i) % n for i in range(r)]
    newest = max(versions[i] for i in idx)
    repaired = sorted(i for i in idx if versions[i] < newest)
    fixed = list(versions)
    for i in repaired:
        fixed[i] = newest
    return [newest, repaired, fixed]`,
    tests: [
      { args: [[2, 1, 1, 1], 0, 3], expected: [2, [1, 2], [2, 2, 2, 1]], name: 'repair two stale replicas' },
      { args: [[1, 1, 1], 1, 2], expected: [1, [], [1, 1, 1]], name: 'nothing to repair' },
      { args: [[1, 3, 2], 2, 2], expected: [2, [0], [2, 3, 2]], name: 'wrapping read' },
      { args: [[3, 1], 1, 2], expected: [3, [1], [3, 3]], name: 'two replicas' },
      { args: [[4], 0, 1], expected: [4, [], [4]], name: 'single replica' },
    ],
    hints: ['Build the list of contacted indices first with `(start + i) % n`.', 'The newest version is the max over those indices; repaired replicas are the contacted ones strictly below it. Copy the list before changing it.'],
    combines: ['hld-replication'],
  },
  quiz: [
    {
      prompt: 'A user posts a comment and immediately refreshes but does not see it, though a friend sees it a second later. Which guarantee is missing?',
      options: ['Monotonic reads', 'Read-your-writes', 'Linearizable writes', 'Durability'],
      answer: 1,
      explain: 'The user\'s own write was not visible to their next read. Routing the author\'s reads to the leader (or a replica at least as new as their write) fixes it.',
    },
  ],
};

export default unit;
