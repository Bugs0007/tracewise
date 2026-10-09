import { Recorder } from '@/engine/recorder';
import type { GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, frame, kvPanel, listPanel } from '@/content/lib/cloud-aws';
import { CATALOGUE, recommendTs, type Requirements } from '@/content/lib/cloud-devops';

const code = `
def recommend(catalogue, requirements):
    must = requirements.get("must", [])
    nice = requirements.get("nice", [])
    avoid = requirements.get("avoid", [])
    rows = []
    for svc in catalogue:                                   #@loop
        tags = svc["tags"]
        if not all(m in tags for m in must):
            continue                                        #@must
        if any(a in tags for a in avoid):
            continue                                        #@avoid
        score = len([n for n in nice if n in tags])         #@score
        rows.append((-score, svc["cost"], svc["name"]))
    rows.sort()                                             #@rank
    return [name for _, _, name in rows]                    #@done
`;

interface In {
  must: string[];
  nice: string[];
  avoid: string[];
}

const KNOWN = [...new Set(CATALOGUE.flatMap((s) => s.tags))].sort();

function clean(i: In): Requirements {
  const norm = (xs: string[], what: string) =>
    xs.map((x) => {
      const t = x.trim().toLowerCase();
      if (!KNOWN.includes(t)) throw new Error(`Unknown ${what} tag "${x}". Known tags: ${KNOWN.join(', ')}`);
      return t;
    });
  const req = { must: norm(i.must, 'must-have'), nice: norm(i.nice, 'nice-to-have'), avoid: norm(i.avoid, 'avoid') };
  if (req.must.length + req.nice.length + req.avoid.length === 0) throw new Error('Add at least one requirement');
  if (req.must.length + req.nice.length + req.avoid.length > 8) throw new Error('Use at most 8 requirements in total');
  return req;
}

const viz: VizDef<In> = {
  id: 'cloud-scenarios',
  title: 'Which AWS service fits?',
  code,
  language: 'python',
  inputs: [
    { key: 'must', label: 'Must have (tags)', kind: 'strings', default: ['serverless', 'event-driven'], maxItems: 4, help: `Known tags: ${KNOWN.join(', ')}` },
    { key: 'nice', label: 'Nice to have (tags)', kind: 'strings', default: ['auto-scale', 'pay-per-use'], maxItems: 4 },
    { key: 'avoid', label: 'Avoid (tags)', kind: 'strings', default: ['vm'], maxItems: 3 },
  ],
  presets: [
    { label: 'Serverless, event-driven', input: {} },
    { label: 'Durable async buffer', input: { must: ['queue', 'durable'], nice: ['serverless', 'async'], avoid: [] } },
    { label: 'Global static website', input: { must: ['static-hosting'], nice: ['global', 'caching', 'pay-per-use'], avoid: ['vm'] } },
    { label: 'Relational with transactions', input: { must: ['sql', 'transactions'], nice: ['managed'], avoid: [] } },
    { label: 'Impossible mix: nobody survives', input: { must: ['gpu', 'serverless'], nice: [], avoid: [] } },
  ],
  run(input) {
    const req = clean(input);
    const r = new Recorder(code);
    const cards = [...req.must.map((t) => ({ kind: 'must', t })), ...req.nice.map((t) => ({ kind: 'nice', t })), ...req.avoid.map((t) => ({ kind: 'avoid', t }))];
    const state: Record<string, { tone: Tone; badge: string }> = {};
    const scores: { name: string; score: number; cost: number }[] = [];
    const board = (cardTones: Record<number, Tone>, rankMode = false): Panel[] => {
      const cols = 5;
      const g: GraphPanel = {
        type: 'graph',
        title: rankMode ? 'Ranked candidates' : 'Candidate services',
        width: 640,
        height: 190,
        nodes: CATALOGUE.map((s, i) => ({ id: s.name, label: s.name, sub: `cost ${s.cost}`, x: 60 + (i % cols) * 130, y: 45 + Math.floor(i / cols) * 90, w: 108, h: 40, tone: state[s.name]?.tone ?? 'default', badge: state[s.name]?.badge })),
        edges: [],
      };
      return [g, listPanel('Requirement cards', cards.map((c) => `${c.kind.toUpperCase()}  ${c.t}`), cardTones)];
    };
    const survivors = () => scores.length;
    frame(r, 'loop', `${CATALOGUE.length} candidate services, ${cards.length} requirement cards`, board({}), { candidates: CATALOGUE.length });
    for (const s of CATALOGUE) {
      r.op();
      const tones: Record<number, Tone> = {};
      cards.forEach((c, k) => {
        const has = s.tags.includes(c.t);
        tones[k] = c.kind === 'must' ? (has ? 'found' : 'error') : c.kind === 'avoid' ? (has ? 'error' : 'found') : has ? 'found' : 'muted';
      });
      state[s.name] = { tone: 'active', badge: '' };
      const missing = req.must.find((m) => !s.tags.includes(m));
      const bad = req.avoid.find((a) => s.tags.includes(a));
      if (missing !== undefined) {
        state[s.name] = { tone: 'muted', badge: `no ${missing}` };
        frame(r, 'must', `${s.name} is out: it lacks the must-have "${missing}"`, board(tones), { service: s.name, survivors: survivors() });
      } else if (bad !== undefined) {
        state[s.name] = { tone: 'muted', badge: `has ${bad}` };
        frame(r, 'avoid', `${s.name} is out: it has the unwanted "${bad}"`, board(tones), { service: s.name, survivors: survivors() });
      } else {
        const score = req.nice.filter((n) => s.tags.includes(n)).length;
        scores.push({ name: s.name, score, cost: s.cost });
        state[s.name] = { tone: 'frontier', badge: `score ${score}` };
        frame(r, 'score', `${s.name} survives with ${score} of ${req.nice.length} nice-to-haves`, board(tones), { service: s.name, score, survivors: survivors() });
      }
    }
    const ranked = [...scores].sort((a, b) => b.score - a.score || a.cost - b.cost || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    ranked.forEach((x, i) => {
      state[x.name] = { tone: i === 0 ? 'found' : 'done', badge: `#${i + 1}  score ${x.score}` };
    });
    frame(r, 'rank', ranked.length ? `Rank by score (high first), then cost (low first), then name: ${ranked.map((x) => x.name).join(' > ')}` : 'Nothing survived the must-haves and avoid list', board({}, true), { survivors: ranked.length });
    frame(r, 'done', ranked.length ? `Best fit: ${ranked[0].name}. Always sanity-check cost, limits and operations too` : 'No fit: relax a must-have or split the workload across services', [...board({}, true), kvPanel('Answer', { best: ranked[0]?.name ?? 'none', runners_up: ranked.slice(1, 3).map((x) => x.name).join(', ') || '-' }, { best: ranked.length ? 'found' : 'error' })], { best: ranked[0]?.name ?? 'none' });
    return { frames: r.frames, result: ranked.map((x) => x.name) };
  },
  reference(input) {
    return recommendTs(CATALOGUE, clean(input));
  },
};

const REQS: Requirements[] = [
  { must: ['serverless', 'event-driven'], nice: ['auto-scale', 'pay-per-use'], avoid: ['vm'] },
  { must: ['queue'], nice: ['durable', 'serverless'], avoid: [] },
  { must: ['static-hosting'], nice: ['global', 'caching'], avoid: [] },
  { must: ['sql'], nice: ['managed', 'transactions'], avoid: ['serverless'] },
  { must: ['gpu', 'serverless'], nice: [], avoid: [] },
  { must: [], nice: ['low-latency'], avoid: [] },
  { must: [], nice: [], avoid: [] },
  { must: ['async'], nice: ['pubsub', 'fan-out'], avoid: ['queue'] },
];

const SMALL = [
  { name: 'A', tags: ['x', 'y'], cost: 3 },
  { name: 'B', tags: ['x'], cost: 1 },
  { name: 'C', tags: ['x', 'y', 'z'], cost: 5 },
];

const unit: Unit = {
  id: 'cloud-scenarios',
  hook: 'Many cloud interviews boil down to "which service would you pick, and why?". A clean way to answer is mechanical: apply the hard requirements first, drop what conflicts, then rank what is left by how many nice-to-haves it meets and by cost.',
  predict: {
    prompt: 'You need a durable buffer between an API and a slow worker, with retries and no servers to manage. Which service fits best?',
    options: ['DynamoDB', 'SQS', 'CloudFront', 'RDS'],
    answer: 1,
    explain: 'SQS is the managed durable queue: producers write fast, workers pull at their own pace, failed messages become visible again for a retry. A database can mimic it but you would rebuild visibility timeouts and dead-letter handling yourself.',
  },
  viz,
  deeper: {
    points: [
      'Turn the story into **requirements**: hard constraints (**must**), preferences (**nice**) and exclusions (**avoid**). Constraints eliminate, preferences rank.',
      'Typical splits: **Lambda** for short event-driven work, **Fargate/ECS** for containers that run longer, **EC2** when you need the OS, GPUs or steady heavy load; **S3 + CloudFront** for static content; **DynamoDB** for key-value at scale, **RDS** when you need SQL and transactions.',
      'Messaging: **SQS** for work queues, **SNS** for fan-out, **EventBridge** for routing events between services by content, **Kinesis** for ordered streams.',
      'Say the **trade-off** out loud: cost model (per request vs always-on), scaling model, operational burden, latency and lock-in. Mention what would make you change your answer.',
      'Real choices also depend on limits (Lambda timeout, item size), data residency, team skills and existing infrastructure; the scoring here is a teaching device, not a decision engine.',
    ],
    pitfalls: ['Naming a service without stating the requirement that decides it', 'Over-engineering: a queue, a stream and a bus where one queue would do', 'Ignoring cost and operations while optimising scale'],
  },
  practice: {
    language: 'python',
    fnName: 'meets',
    statement: 'Return True if a service with the tag list `tags` satisfies the hard requirements: it has every tag in `must` and none of the tags in `avoid`.',
    signature: 'def meets(tags, must, avoid):',
    solution: `def meets(tags, must, avoid):
    if not @@all(m in tags for m in must)@@:
        return False
    if @@any(a in tags for a in avoid)@@:
        return False
    return @@True@@`,
    tests: [
      { args: [['serverless', 'event-driven'], ['serverless'], []], expected: true, name: 'has the must-have' },
      { args: [['vm', 'gpu'], ['serverless'], []], expected: false, name: 'missing the must-have' },
      { args: [['serverless', 'vm'], ['serverless'], ['vm']], expected: false, name: 'has an avoided tag' },
      { args: [['a'], [], []], expected: true, name: 'no requirements' },
      { args: [['a', 'b'], ['a', 'b'], ['c']], expected: true, name: 'several must-haves' },
      { args: [['a'], ['a', 'b'], []], expected: false, name: 'all must-haves are required' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'rank',
    statement: 'The recommender puts the service that meets the FEWEST nice-to-haves first. Fix `rank` so the best match comes first (higher score first, then lower cost, then name). `rows` pairs are built as shown.',
    buggy: `def rank(catalogue, nice):
    rows = []
    for svc in catalogue:
        score = len([n for n in nice if n in svc["tags"]])
        rows.append((score, svc["cost"], svc["name"]))
    rows.sort()
    return [name for _, _, name in rows]`,
    fixed: `def rank(catalogue, nice):
    rows = []
    for svc in catalogue:
        score = len([n for n in nice if n in svc["tags"]])
        rows.append((-score, svc["cost"], svc["name"]))
    rows.sort()
    return [name for _, _, name in rows]`,
    tests: [
      { args: [SMALL, ['x', 'y']], expected: ['A', 'C', 'B'], name: 'higher score first, cheaper breaks the tie' },
      { args: [SMALL, ['z']], expected: ['C', 'B', 'A'], name: 'only C has z; B is cheaper than A' },
      { args: [SMALL, []], expected: ['B', 'A', 'C'], name: 'no preferences: cost order' },
      { args: [[{ name: 'Y', tags: ['q'], cost: 2 }, { name: 'X', tags: ['q'], cost: 2 }], ['q']], expected: ['X', 'Y'], name: 'name breaks the final tie' },
    ],
    bugType: 'sort direction',
    hint: 'Python sorts tuples ascending. Which way should the score count?',
    explanation: 'Sorting `(score, cost, name)` ascending puts the lowest score first. Negating the score makes higher scores sort first while cost and name keep their ascending tie-breaks.',
  },
  boss: {
    title: 'Service recommender',
    statement:
      'Write `recommend(requirements)`. A predefined list `CATALOGUE` is available (each entry has `name`, `tags`, `cost`):\n' +
      CATALOGUE.map((s) => `${s.name} (cost ${s.cost}): ${s.tags.join(', ')}`).join('\n') +
      '\n`requirements` is a dict with optional lists `must`, `nice`, `avoid`. Keep only services that have ALL `must` tags and NONE of the `avoid` tags. Score each by how many `nice` tags it has. Return the names ordered by score (highest first), then cost (lowest first), then name (alphabetical).',
    language: 'python',
    fnName: 'recommend',
    harness: 'CATALOGUE = ' + JSON.stringify(CATALOGUE),
    starter: `def recommend(requirements):
    pass
`,
    solution: `def recommend(requirements):
    must = requirements.get("must", [])
    nice = requirements.get("nice", [])
    avoid = requirements.get("avoid", [])
    rows = []
    for svc in CATALOGUE:
        tags = svc["tags"]
        if not all(m in tags for m in must):
            continue
        if any(a in tags for a in avoid):
            continue
        score = len([n for n in nice if n in tags])
        rows.append((-score, svc["cost"], svc["name"]))
    rows.sort()
    return [name for _, _, name in rows]`,
    tests: REQS.map((q, i) => ({ args: [q], expected: recommendTs(CATALOGUE, q), name: ['serverless event-driven', 'a queue', 'static site', 'SQL but not serverless', 'impossible mix', 'only a preference', 'no requirements', 'async but no queue'][i] })),
    hints: ['Build a list of `(-score, cost, name)` tuples for services that pass the must/avoid filters; missing keys in the requirements dict mean an empty list (`requirements.get("must", [])`).', 'After `rows.sort()` the tuples are already ordered by highest score, then lowest cost, then name. Return just the names.'],
    combines: ['aws-sqs', 'aws-sns', 'aws-lambda'],
  },
  quiz: [
    {
      prompt: 'Which pairing is the usual answer for "serve a static website globally with low latency"?',
      options: ['EC2 + RDS', 'S3 + CloudFront', 'Lambda + SQS', 'DynamoDB + SNS'],
      answer: 1,
      explain: 'S3 stores the files cheaply and durably; CloudFront caches them at edge locations close to users.',
    },
  ],
  simulationNote: SIM_NOTE + ' The catalogue and scores are a teaching model, not a recommendation engine.',
};

export default unit;
