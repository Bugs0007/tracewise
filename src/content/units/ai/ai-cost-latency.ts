import { Recorder } from '@/engine/recorder';
import type { Panel, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, chartPanel, kvPanel, round, short, step, timelinePanel } from '@/content/lib/ai-finish-2';

const code = `
PRICES = {"small": (0.15, 0.60), "large": (2.50, 10.00)}   # dollars per 1M tokens (in, out)
TTFT = {"small": 250, "large": 600}                          # ms to first token
TPS = {"small": 120, "large": 50}                            # tokens per second

def cost(model, tokens_in, tokens_out):
    pin, pout = PRICES[model]
    return (tokens_in * pin + tokens_out * pout) / 1_000_000       #@cost

def latency_ms(model, tokens_out):
    return TTFT[model] + tokens_out / TPS[model] * 1000            #@latency

def serve(req, policy, cache, threshold):
    model = "large" if policy == "all-large" else ("small" if req["difficulty"] < threshold else "large")   #@pick
    key = (req["id"], model)
    if policy == "route+cache" and key in cache:                   #@cache
        return 0.0, 20
    cache.add(key)
    return cost(model, req["in"], req["out"]), latency_ms(model, req["out"])   #@bill
`;

interface Req {
  id: string;
  tin: number;
  tout: number;
  difficulty: number;
}

const REQS: Req[] = [
  { id: 'faq-hours', tin: 300, tout: 80, difficulty: 0.2 },
  { id: 'summarise-doc', tin: 3000, tout: 400, difficulty: 0.4 },
  { id: 'faq-hours', tin: 300, tout: 80, difficulty: 0.2 },
  { id: 'legal-analysis', tin: 2500, tout: 900, difficulty: 0.9 },
  { id: 'faq-refund', tin: 350, tout: 90, difficulty: 0.1 },
  { id: 'code-review', tin: 1800, tout: 700, difficulty: 0.8 },
  { id: 'faq-refund', tin: 350, tout: 90, difficulty: 0.1 },
  { id: 'translate', tin: 600, tout: 300, difficulty: 0.3 },
  { id: 'faq-hours', tin: 300, tout: 80, difficulty: 0.2 },
  { id: 'plan-trip', tin: 900, tout: 600, difficulty: 0.6 },
];

const PRICES: Record<string, [number, number]> = { small: [0.15, 0.6], large: [2.5, 10] };
const TTFT: Record<string, number> = { small: 250, large: 600 };
const TPS: Record<string, number> = { small: 120, large: 50 };
const POLICIES = ['all-large', 'route', 'route+cache'];
const CACHE_MS = 20;

const costOf = (m: string, tin: number, tout: number) => (tin * PRICES[m][0] + tout * PRICES[m][1]) / 1e6;
const latOf = (m: string, tout: number) => TTFT[m] + (tout / TPS[m]) * 1000;

interface Served {
  model: string;
  cost: number;
  ms: number;
  hit: boolean;
}

function simulate(policy: string, threshold: number): Served[] {
  const cache = new Set<string>();
  return REQS.map((q) => {
    const model = policy === 'all-large' ? 'large' : q.difficulty < threshold ? 'small' : 'large';
    const key = q.id + '|' + model;
    if (policy === 'route+cache' && cache.has(key)) return { model, cost: 0, ms: CACHE_MS, hit: true };
    cache.add(key);
    return { model, cost: costOf(model, q.tin, q.tout), ms: latOf(model, q.tout), hit: false };
  });
}

interface In {
  policy: string;
  threshold: number;
}

function clean(i: In) {
  if (!POLICIES.includes(i.policy)) throw new Error('policy must be one of: ' + POLICIES.join(', '));
  const t = Number(i.threshold);
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error('threshold must be between 0 and 1.');
  return { policy: i.policy, threshold: t };
}

function summary(served: Served[]) {
  return {
    cost: round(served.reduce((a, s) => a + s.cost, 0), 6),
    avg_latency_ms: Math.round((served.reduce((a, s) => a + s.ms, 0) / served.length) * 10) / 10,
    large_calls: served.filter((s) => s.model === 'large' && !s.hit).length,
    cache_hits: served.filter((s) => s.hit).length,
  };
}

const viz: VizDef<In> = {
  id: 'ai-cost-latency',
  title: 'Cost and latency: routing and caching',
  code,
  language: 'python',
  inputs: [
    { key: 'policy', label: 'Policy', kind: 'select', options: POLICIES, default: 'route+cache' },
    { key: 'threshold', label: 'Route to small below difficulty', kind: 'number', default: 0.5, help: '0 to 1' },
  ],
  presets: [
    { label: 'Everything on the large model', input: { policy: 'all-large' } },
    { label: 'Route by difficulty', input: { policy: 'route' } },
    { label: 'Route + cache', input: { policy: 'route+cache' } },
    { label: 'Aggressive routing', input: { policy: 'route+cache', threshold: 0.85 } },
  ],
  run(input) {
    const { policy, threshold } = clean(input);
    const r = new Recorder(code);
    const all: Record<string, Served[]> = Object.fromEntries(POLICIES.map((p) => [p, simulate(p, threshold)]));
    const mine = all[policy];
    const cum = (p: string, upTo: number): [number, number][] => {
      let sum = 0;
      return all[p].slice(0, upTo + 1).map((s, i) => [i + 1, round((sum += s.cost) * 1000, 4)] as [number, number]);
    };
    const chart = (upTo: number): Panel => chartPanel('Cumulative cost (milli-dollars)', POLICIES.map((p) => ({ label: p, points: cum(p, upTo), tone: p === policy ? 'found' : 'muted' })), 'request #', 'cost x 1000 ($)', 'line');
    const q0 = REQS[1];
    step(
      r,
      'latency',
      'Latency = time to first token + output tokens / speed; the large model is slower on both',
      [
        timelinePanel(
          `Request "${q0.id}" (${q0.tout} output tokens)`,
          ['small', 'large'].map((m) => ({
            label: m,
            events: [
              { t: 0, dur: TTFT[m], label: 'first token', tone: 'compare' as const },
              { t: TTFT[m], dur: (q0.tout / TPS[m]) * 1000, label: 'generate', tone: 'active' as const },
            ],
          })),
          latOf('large', q0.tout),
          undefined,
          'ms',
        ),
        kvPanel('Cost of this request', { small: '$' + round(costOf('small', q0.tin, q0.tout), 6), large: '$' + round(costOf('large', q0.tin, q0.tout), 6) }),
      ],
      { policy },
    );
    let total = 0;
    REQS.forEach((q, i) => {
      r.op();
      const s = mine[i];
      total += s.cost;
      const why = policy === 'all-large' ? 'policy sends everything to large' : s.hit ? `cache hit for "${q.id}"` : q.difficulty < threshold ? `difficulty ${q.difficulty} < ${threshold}: small` : `difficulty ${q.difficulty} >= ${threshold}: large`;
      step(r, s.hit ? 'cache' : 'bill', `#${i + 1} ${short(q.id, 16)}: ${s.hit ? 'cached' : s.model}, $${round(s.cost, 6)}, ${Math.round(s.ms)} ms (${why})`, [chart(i), kvPanel('Request', { id: q.id, tokens: `${q.tin} in / ${q.tout} out`, model: s.hit ? '(cache)' : s.model, 'total so far': '$' + round(total, 6) }, { model: s.hit ? 'found' : 'default' })], { i: i + 1, total: round(total, 6) });
    });
    const sm = summary(mine);
    const base = summary(all['all-large']);
    step(r, 'bill', `Total $${sm.cost} vs $${base.cost} all-large: ${base.cost ? Math.round((1 - sm.cost / base.cost) * 100) : 0}% cheaper`, [chart(REQS.length - 1), kvPanel('Summary', { policy, cost: '$' + sm.cost, 'avg latency': sm.avg_latency_ms + ' ms', 'large calls': sm.large_calls, 'cache hits': sm.cache_hits }, { cost: 'found' })], { cost: sm.cost });
    return { frames: r.frames, result: sm };
  },
  reference(input) {
    const { policy, threshold } = clean(input);
    return summary(simulate(policy, threshold));
  },
};

const PR = { small: [0.15, 0.6], large: [2.5, 10] };
const REQS_BOSS = [
  { tin: 1000, tout: 500, difficulty: 0.2 },
  { tin: 2000, tout: 800, difficulty: 0.9 },
  { tin: 500, tout: 200, difficulty: 0.7 },
  { tin: 3000, tout: 1000, difficulty: 0.8 },
];
const TWINS = [
  { tin: 1000, tout: 100, difficulty: 0.9 },
  { tin: 1000, tout: 100, difficulty: 0.9 },
];

const unit: Unit = {
  id: 'ai-cost-latency',
  hook: 'LLM features live or die on unit economics. Interviewers want you to compute cost from tokens, separate time-to-first-token from generation speed, and name the big levers: routing, caching and shorter prompts.',
  predict: {
    prompt: 'A request sends 2,000 input tokens and gets 500 output tokens back. Output tokens cost 4x as much as input tokens. Which part dominates the bill?',
    options: ['Input: it has 4x more tokens', 'Output: 500 x 4 = 2,000 input-token equivalents, the same as the input side', 'Neither; they cost the same', 'Only the system prompt'],
    answer: 1,
    explain: '500 output tokens at 4x price equal 2,000 input-token units, so both sides cost the same here. Always weigh tokens by their price, not their count.',
  },
  viz,
  deeper: {
    points: [
      'Cost = input_tokens x input price + output_tokens x output price; output is usually several times pricier per token.',
      'Latency = network + queueing + time to first token (prompt processing) + output_tokens / generation speed.',
      'Routing sends easy requests to a small model and hard ones to a large model; a classifier or heuristic decides.',
      'Caching removes the model call entirely for repeated requests; prompt caching discounts a repeated prompt prefix.',
      'Trimming prompts and capping max output tokens cut cost and latency at the same time.',
    ],
    pitfalls: ['Mixing per-thousand and per-million prices', 'Using the input price for output tokens', 'Routing on a signal that is only known after the answer'],
  },
  practice: {
    language: 'python',
    fnName: 'estimate_cost',
    compare: 'float',
    statement: 'estimate_cost(prices, model, tokens_in, tokens_out, cached_in=0) returns dollars rounded to 8 places. prices[model] is [input_price, output_price] per 1M tokens. cached_in of the input tokens are billed at 10% of the input price; the other input tokens at full price; output tokens at the output price.',
    signature: 'def estimate_cost(prices, model, tokens_in, tokens_out, cached_in=0):',
    solution: `def estimate_cost(prices, model, tokens_in, tokens_out, cached_in=0):
    pin, pout = @@prices[model]@@
    fresh = @@tokens_in - cached_in@@
    total = fresh * pin + cached_in * pin * 0.1 + @@tokens_out * pout@@
    return round(total / 1_000_000, 8)`,
    tests: [
      { args: [PR, 'small', 1000, 500], expected: 0.00045, name: 'small model' },
      { args: [PR, 'large', 1000, 500], expected: 0.0075, name: 'large model' },
      { args: [PR, 'large', 1000, 100, 800], expected: 0.0017, name: 'cached prefix is 10%' },
      { args: [PR, 'small', 0, 0], expected: 0, name: 'nothing sent' },
      { args: [PR, 'large', 2000, 0, 2000], expected: 0.0005, name: 'fully cached input' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'total_cost',
    compare: 'float',
    statement: 'total_cost(requests, prices) sums the dollar cost of requests [{"model", "tin", "tout"}]; prices[model] is [input, output] per 1M tokens. The result is too low for answers with many output tokens.',
    buggy: `def total_cost(requests, prices):
    total = 0.0
    for r in requests:
        pin, pout = prices[r["model"]]
        total += (r["tin"] * pin + r["tout"] * pin) / 1_000_000
    return round(total, 8)`,
    fixed: `def total_cost(requests, prices):
    total = 0.0
    for r in requests:
        pin, pout = prices[r["model"]]
        total += (r["tin"] * pin + r["tout"] * pout) / 1_000_000
    return round(total, 8)`,
    tests: [
      { args: [[{ model: 'small', tin: 1000, tout: 500 }], PR], expected: 0.00045, name: 'one small request' },
      { args: [[{ model: 'large', tin: 1000, tout: 500 }, { model: 'small', tin: 1000, tout: 500 }], PR], expected: 0.00795, name: 'mixed models' },
      { args: [[{ model: 'large', tin: 0, tout: 1000 }], PR], expected: 0.01, name: 'output only' },
      { args: [[], PR], expected: 0, name: 'no requests' },
    ],
    bugType: 'wrong price applied',
    hint: 'Look at what multiplies tout. Which of the two unpacked prices is it?',
    explanation: 'Output tokens were billed at the input price. Output is usually the more expensive side, so the estimate came out too low whenever a response was long.',
  },
  boss: {
    title: 'Budget-aware model router',
    statement: 'Write plan_routing(requests, prices, threshold, budget). Each request is {"tin", "tout", "difficulty"}; prices[model] = [input, output] per 1M tokens for "small" and "large". Start with "small" when difficulty < threshold else "large". While the total cost exceeds budget and some request is still "large", downgrade the large request whose saving (large cost - small cost) is biggest (ties: lowest index). Return {"routes": [...], "cost": total rounded to 6 places, "downgraded": number of downgrades}.',
    language: 'python',
    fnName: 'plan_routing',
    compare: 'float',
    starter: `def plan_routing(requests, prices, threshold, budget):
    # your code here
    pass
`,
    solution: `def plan_routing(requests, prices, threshold, budget):
    def cost(i, model):
        pin, pout = prices[model]
        return (requests[i]["tin"] * pin + requests[i]["tout"] * pout) / 1_000_000

    routes = ["small" if r["difficulty"] < threshold else "large" for r in requests]
    total = sum(cost(i, m) for i, m in enumerate(routes))
    downgraded = 0
    while total > budget:
        larges = [i for i, m in enumerate(routes) if m == "large"]
        if not larges:
            break
        pick = max(larges, key=lambda i: (cost(i, "large") - cost(i, "small"), -i))
        total += cost(pick, "small") - cost(pick, "large")
        routes[pick] = "small"
        downgraded += 1
    return {"routes": routes, "cost": round(total, 6), "downgraded": downgraded}`,
    tests: [
      { args: [REQS_BOSS, PR, 0.5, 1], expected: { routes: ['small', 'large', 'large', 'large'], cost: 0.0342, downgraded: 0 }, name: 'within budget: no downgrades' },
      { args: [REQS_BOSS, PR, 0.5, 0.03], expected: { routes: ['small', 'large', 'large', 'small'], cost: 0.01775, downgraded: 1 }, name: 'downgrade the biggest saving' },
      { args: [REQS_BOSS, PR, 0.5, 0.01], expected: { routes: ['small', 'small', 'large', 'small'], cost: 0.00553, downgraded: 2 }, name: 'keeps downgrading until it fits' },
      { args: [REQS_BOSS, PR, 0.5, 0], expected: { routes: ['small', 'small', 'small', 'small'], cost: 0.002475, downgraded: 3 }, name: 'impossible budget: everything small' },
      { args: [TWINS, PR, 0.5, 0.004], expected: { routes: ['small', 'large'], cost: 0.00371, downgraded: 1 }, name: 'ties downgrade the lowest index' },
      { args: [[], PR, 0.5, 1], expected: { routes: [], cost: 0, downgraded: 0 }, name: 'no requests' },
    ],
    hints: ['Write a small cost(i, model) helper, then keep a running total instead of recomputing from scratch every loop.', 'max(larges, key=lambda i: (saving, -i)) picks the biggest saving and, on ties, the lowest index.'],
    combines: ['ai-tokens'],
  },
  quiz: [
    {
      prompt: 'Which change reduces BOTH cost and time-to-first-token for a long, repeated system prompt?',
      options: ['Raising the temperature', 'Prompt caching (reusing the processed prefix) or shortening the prompt', 'Using more few-shot examples', 'Streaming'],
      answer: 1,
      explain: 'A cached or shorter prefix means fewer input tokens to bill and to process before the first output token. Streaming improves perceived latency, not cost.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
