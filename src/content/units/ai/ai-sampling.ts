import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, ChartPanel, KVPanel, LogPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, lcg, round, softmaxT } from '@/content/lib/ai-llm-rag-1';

const code = `
TOKENS = ["mat", "floor", "sofa", "roof", "moon", "pizza", "idea", "quantum"]   #@table
LOGITS = [4.0, 3.2, 2.6, 1.8, 1.0, 0.2, -0.6, -1.5]

def softmax(logits, temperature):
    scaled = [x / temperature for x in logits]              #@scale
    m = max(scaled)
    exps = [math.exp(x - m) for x in scaled]                #@exp
    total = sum(exps)
    return [e / total for e in exps]                        #@norm

def filter_probs(probs, top_k, top_p):
    order = sorted(range(len(probs)), key=lambda i: -probs[i])   #@sort
    if top_k:
        order = order[:top_k]                               #@topk
    keep, cum = [], 0.0
    for i in order:                                         #@cum
        keep.append(i)
        cum += probs[i]
        if cum >= top_p:                                    #@cut
            break
    mass = sum(probs[i] for i in keep)
    return {i: probs[i] / mass for i in keep}               #@renorm

def make_rng(seed):
    state = seed % 2147483646 + 1
    def rng():
        nonlocal state
        state = state * 48271 % 2147483647
        return state / 2147483647
    return rng                                              #@rng

def draw(dist, u):
    acc = 0.0
    for i in sorted(dist):                                  #@draw
        acc += dist[i]
        if u < acc:
            return i                                        #@pick
    return max(dist)
`;

const TOKENS = ['mat', 'floor', 'sofa', 'roof', 'moon', 'pizza', 'idea', 'quantum'];
const LOGITS = [4.0, 3.2, 2.6, 1.8, 1.0, 0.2, -0.6, -1.5];

interface In {
  temperature: number;
  top_p: number;
  top_k: number;
  seed: number;
  draws: number;
}

function clean(i: In) {
  const temperature = Number(i.temperature);
  if (!Number.isFinite(temperature) || temperature <= 0) throw new Error('Temperature must be greater than 0 (try 0.05 for near-greedy).');
  if (temperature > 5) throw new Error('Keep temperature at 5 or below.');
  const top_p = Number(i.top_p);
  if (!Number.isFinite(top_p) || top_p <= 0 || top_p > 1) throw new Error('top_p must be in (0, 1].');
  const top_k = Math.round(Number(i.top_k));
  if (!Number.isFinite(top_k) || top_k < 0) throw new Error('top_k must be 0 (off) or a positive whole number.');
  const seed = Math.max(0, Math.round(Number(i.seed)) || 0);
  const draws = Math.max(0, Math.min(10, Math.round(Number(i.draws)) || 0));
  return { temperature, top_p, top_k, seed, draws };
}

const entropyBits = (ps: number[]) => -ps.reduce((s, p) => (p > 0 ? s + p * Math.log2(p) : s), 0);

const viz: VizDef<In> = {
  id: 'ai-sampling',
  title: 'Temperature, top-k and top-p sampling',
  code,
  language: 'python',
  inputs: [
    { key: 'temperature', label: 'Temperature', kind: 'number', default: 0.8, help: 'Above 0. Low = sharper, high = flatter.' },
    { key: 'top_p', label: 'top_p (nucleus)', kind: 'number', default: 0.9 },
    { key: 'top_k', label: 'top_k (0 = off)', kind: 'number', default: 0 },
    { key: 'seed', label: 'Random seed', kind: 'number', default: 7 },
    { key: 'draws', label: 'Draws (0 to 10)', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Near greedy', input: { temperature: 0.2, top_p: 1, top_k: 0, seed: 7, draws: 5 } },
    { label: 'Creative', input: { temperature: 1.5, top_p: 1, top_k: 0, seed: 7, draws: 6 } },
    { label: 'Tight nucleus', input: { temperature: 1, top_p: 0.5, top_k: 0, seed: 3, draws: 5 } },
    { label: 'top_k = 3', input: { temperature: 1, top_p: 1, top_k: 3, seed: 11, draws: 5 } },
  ],
  run(input) {
    const { temperature, top_p, top_k, seed, draws } = clean(input);
    const r = new Recorder(code);
    const n = TOKENS.length;
    const base = softmaxT(LOGITS, 1);

    const probsChart = (title: string, probs: number[], keptSet?: Set<number>, showBase = true): ChartPanel => {
      const series: ChartPanel['series'] = [];
      if (showBase && temperature !== 1) series.push({ label: 'T = 1 reference', points: base.map((p, i) => [i, round(p, 4)] as [number, number]), tone: 'muted' });
      if (keptSet) {
        series.push({ label: 'kept', points: probs.flatMap((p, i) => (keptSet.has(i) ? [[i, round(p, 4)] as [number, number]] : [])), tone: 'found' });
        const cut = probs.flatMap((p, i) => (!keptSet.has(i) ? [[i, round(p, 4)] as [number, number]] : []));
        if (cut.length) series.push({ label: 'cut off', points: cut, tone: 'error' });
      } else series.push({ label: `probability at T=${temperature}`, points: probs.map((p, i) => [i, round(p, 4)] as [number, number]), tone: 'active' });
      return { type: 'chart', title, kind: 'bar', xLabel: 'token index (see the list above)', yLabel: 'probability', series };
    };
    const tokenRow = (values: (string | number)[], title: string, tones: Record<number, Tone> = {}): ArrayPanel => ({ type: 'array', title, values, tones, indexLabels: TOKENS });
    const params = (extra: { k: string; v: string | number; tone?: Tone }[] = []): KVPanel => ({ type: 'kv', entries: [{ k: 'temperature', v: temperature }, { k: 'top_p', v: top_p }, { k: 'top_k', v: top_k || 'off' }, ...extra] });
    const draws_log: string[] = [];
    const logP = (): LogPanel => ({ type: 'log', title: `Draws (seed ${seed})`, lines: draws_log.map((text, i) => ({ text, tone: (i === draws_log.length - 1 ? 'new' : 'default') as Tone })) });

    r.step('table', 'Raw scores (logits) for the next word after "The cat sat on the ..."', [tokenRow(LOGITS, 'Logits', { 0: 'compare' }), params()], { temperature, top_p, top_k });

    const scaled = LOGITS.map((x) => x / temperature);
    r.step('scale', cap(`Divide every logit by T=${temperature}: ${temperature < 1 ? 'gaps grow, sharper' : temperature > 1 ? 'gaps shrink, flatter' : 'unchanged'}`), [tokenRow(scaled.map((x) => round(x, 2)), 'Scaled logits'), params()], { T: temperature });

    const m = Math.max(...scaled);
    const exps = scaled.map((x) => Math.exp(x - m));
    r.step('exp', cap(`Subtract the max (${round(m, 2)}) before exp so the biggest term is exactly 1`), [tokenRow(exps.map((e) => round(e, 4)), 'exp(scaled - max)', { 0: 'compare' }), params()], { max: round(m, 2) });

    const probs = softmaxT(LOGITS, temperature);
    r.step('norm', cap(`Normalise: top token "${TOKENS[0]}" gets ${round(probs[0] * 100, 1)}% (${round(base[0] * 100, 1)}% at T=1)`), [tokenRow(probs.map((p) => round(p, 4)), 'Probabilities'), probsChart('Probabilities', probs), params([{ k: 'entropy (bits)', v: round(entropyBits(probs), 2) }])], { top: round(probs[0], 4) });

    const order = probs.map((_, i) => i).sort((a, b) => probs[b] - probs[a] || a - b);
    r.step('sort', 'Sort tokens from most to least likely', [tokenRow(order.map((i) => TOKENS[i]), 'Order'), params()], { first: TOKENS[order[0]] });
    let candidates = order;
    if (top_k) {
      candidates = order.slice(0, top_k);
      const ks = new Set(candidates);
      r.step('topk', cap(`top_k=${top_k}: only the ${Math.min(top_k, n)} most likely tokens stay candidates`), [probsChart('Probabilities after top-k', probs, ks, false), params()], { top_k });
    }
    const keep: number[] = [];
    let cum = 0;
    for (const i of candidates) {
      keep.push(i);
      cum += probs[i];
      r.op();
      const stop = cum >= top_p;
      r.step(stop ? 'cut' : 'cum', cap(`${TOKENS[i]} ${round(probs[i], 3)}: cumulative ${round(cum, 3)} ${stop ? '≥' : '<'} top_p ${top_p}${stop ? ' → cut here' : ''}`), [probsChart('Nucleus so far', probs, new Set(keep), false), params([{ k: 'cumulative', v: round(cum, 3) }])], { cum: round(cum, 3), kept: keep.length });
      if (stop) break;
    }
    const keptSet = new Set(keep);
    const mass = keep.reduce((s, i) => s + probs[i], 0);
    const dist: number[] = probs.map((p, i) => (keptSet.has(i) ? p / mass : 0));
    r.step('renorm', cap(`Renormalise the ${keep.length} kept tokens (mass ${round(mass, 3)} → 1)`), [probsChart('Sampling distribution', dist, keptSet, false), params([{ k: 'entropy (bits)', v: round(entropyBits(dist), 2) }])], { kept: keep.length, mass: round(mass, 3) });

    const rng = lcg(seed);
    const picked: number[] = [];
    for (let d = 0; d < draws; d++) {
      const u = rng();
      let acc = 0;
      let pick = Math.max(...keep);
      for (const i of [...keep].sort((a, b) => a - b)) {
        acc += dist[i];
        if (u < acc) {
          pick = i;
          break;
        }
      }
      picked.push(pick);
      draws_log.push(`draw ${d + 1}: u=${round(u, 3)} → ${TOKENS[pick]}`);
      r.op();
      r.step('draw', cap(`u=${round(u, 3)} lands in the slice of "${TOKENS[pick]}" (cumulative ${round(acc, 3)})`), [probsChart('Sampling distribution', dist, keptSet, false), logP()], { u: round(u, 3), pick: TOKENS[pick] });
    }
    r.step('draw', draws ? `Drew: ${picked.map((p) => TOKENS[p]).join(', ')}` : 'No draws requested: this is the distribution the model would sample from', [probsChart('Sampling distribution', dist, keptSet, false), logP(), params()], { distinct: new Set(picked).size });
    return { frames: r.frames, result: { probs: probs.map((p) => round(p, 6)), kept: [...keep].sort((a, b) => a - b), dist: dist.map((p) => round(p, 6)), draws: picked } };
  },
  reference(input) {
    const { temperature, top_p, top_k, seed, draws } = clean(input);
    // Independent formulation: log-sum-exp instead of max-subtraction, ranking by index stability.
    const s = LOGITS.map((x) => x / temperature);
    const lse = Math.log(s.reduce((a, x) => a + Math.exp(x), 0));
    const probs = s.map((x) => Math.exp(x - lse));
    const ranked = probs.map((p, i) => ({ p, i })).sort((a, b) => (a.p === b.p ? a.i - b.i : b.p - a.p));
    let pool = ranked;
    if (top_k) pool = ranked.slice(0, top_k);
    const kept: number[] = [];
    let c = 0;
    for (const e of pool) {
      kept.push(e.i);
      c += e.p;
      if (c >= top_p) break;
    }
    const total = kept.reduce((a, i) => a + probs[i], 0);
    const dist = probs.map((p, i) => (kept.includes(i) ? p / total : 0));
    const rng = lcg(seed);
    const asc = [...kept].sort((a, b) => a - b);
    const out: number[] = [];
    for (let d = 0; d < draws; d++) {
      const u = rng();
      let acc = 0;
      let hit = asc[asc.length - 1];
      for (const i of asc) {
        acc += dist[i];
        if (u < acc) {
          hit = i;
          break;
        }
      }
      out.push(hit);
    }
    return { probs: probs.map((p) => round(p, 6)), kept: asc, dist: dist.map((p) => round(p, 6)), draws: out };
  },
};

const unit: Unit = {
  id: 'ai-sampling',
  hook: 'Temperature, top-k and top-p are the three knobs every LLM API exposes. Interviewers ask what they do to the distribution, and the honest answer is a few lines of softmax and cumulative sums.',
  predict: {
    prompt: 'You lower the temperature from 1.0 to 0.2. What happens to the probability of the single most likely next token?',
    options: ['It goes down', 'It stays the same', 'It goes up, and the others shrink', 'The model picks a random token'],
    answer: 2,
    explain: 'Dividing logits by a small T widens the gaps before softmax, so the leader takes almost all the probability. As T approaches 0 sampling becomes greedy decoding.',
  },
  viz,
  simulationNote: 'A fixed table of scores stands in for a real model\'s output, and draws use a seeded generator; no real LLM is called.',
  deeper: {
    points: [
      'A model outputs one **logit** per vocabulary token. **Softmax** turns them into probabilities: `p_i = exp(z_i) / sum(exp(z_j))`.',
      '**Temperature** divides the logits first. T < 1 sharpens the distribution, T > 1 flattens it, and T → 0 approaches always taking the top token. T = 0 itself is usually special-cased as greedy argmax.',
      '**top-k** keeps only the k most probable tokens. **top-p (nucleus)** keeps the smallest set whose cumulative probability reaches p, so the number of candidates adapts: few when the model is sure, many when it is not.',
      'After filtering you **renormalise** so the kept probabilities sum to 1, then sample with a random number `u`: walk the tokens accumulating probability until the sum exceeds `u`.',
      'Seeds make runs repeatable, but only if the whole stack is deterministic. Temperature 0 is the usual way to get stable outputs in tests.',
    ],
    complexity: { time: 'O(V log V) for the sort over vocabulary size V', space: 'O(V)' },
    pitfalls: ['Calling `exp` on raw logits (overflow) instead of subtracting the max', 'Applying temperature after softmax', 'Using `>` vs `>=` at the nucleus boundary so the first token can be dropped', 'Forgetting to renormalise after filtering', 'Dividing by temperature 0'],
  },
  practice: {
    language: 'python',
    fnName: 'top_p_probs',
    compare: 'float',
    statement: 'Implement `top_p_probs(logits, temperature, top_p)`: softmax of `logits / temperature` (subtract the max for stability), then keep the most likely tokens until their cumulative probability reaches `top_p`, set the rest to 0.0 and renormalise. Return a list the same length as `logits`. Ties are ordered by index.',
    signature: 'def top_p_probs(logits, temperature, top_p):',
    solution: `import math

def top_p_probs(logits, temperature, top_p):
    scaled = [x / @@temperature@@ for x in logits]
    m = @@max(scaled)@@
    exps = [math.exp(x - m) for x in scaled]
    total = sum(exps)
    probs = [e / total for e in exps]
    order = sorted(range(len(probs)), key=lambda i: @@-probs[i]@@)
    keep, cum = set(), 0.0
    for i in order:
        keep.add(i)
        cum += probs[i]
        if @@cum >= top_p@@:
            break
    mass = sum(probs[i] for i in keep)
    return [probs[i] / mass if i in keep else 0.0 for i in range(len(probs))]`,
    tests: [
      { args: [[2.0, 1.0, 0.1], 1.0, 1.0], expected: [0.6590011388859679, 0.24243297070471392, 0.09856589040931818], name: 'plain softmax' },
      { args: [[2.0, 1.0, 0.1], 0.5, 1.0], expected: [0.8637771182080068, 0.1168995209459857, 0.01932336084600751], name: 'low temperature sharpens' },
      { args: [[2.0, 1.0, 0.1], 1.0, 0.7], expected: [0.7310585786300049, 0.2689414213699951, 0.0], name: 'nucleus keeps two tokens' },
      { args: [[1, 1, 1], 1.0, 0.5], expected: [0.5, 0.5, 0.0], name: 'ties keep the lower index first' },
      { args: [[5.0, 4.0, 3.0, -2.0], 1.0, 0.95], expected: [0.6652409557748219, 0.24472847105479767, 0.09003057317038045, 0.0], name: 'unlikely tail is cut' },
      { args: [[1000.0, 999.0], 1.0, 1.0], expected: [0.7310585786300049, 0.2689414213699951], name: 'huge logits do not overflow' },
      { args: [[2.0, 1.0, 0.1], 0.1, 0.5], expected: [1.0, 0.0, 0.0], name: 'top token alone passes top_p' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'softmax',
    compare: 'float',
    statement: '`softmax(logits, temperature)` works on small examples but crashes with `OverflowError: math range error` when a model produces large scores. Fix it.',
    buggy: `import math

def softmax(logits, temperature):
    scaled = [x / temperature for x in logits]
    exps = [math.exp(x) for x in scaled]
    total = sum(exps)
    return [e / total for e in exps]`,
    fixed: `import math

def softmax(logits, temperature):
    scaled = [x / temperature for x in logits]
    m = max(scaled)
    exps = [math.exp(x - m) for x in scaled]
    total = sum(exps)
    return [e / total for e in exps]`,
    tests: [
      { args: [[2.0, 1.0, 0.1], 1.0], expected: [0.6590011388859679, 0.24243297070471392, 0.09856589040931818], name: 'normal logits' },
      { args: [[2.0, 1.0, 0.1], 0.5], expected: [0.8637771182080068, 0.1168995209459857, 0.01932336084600751], name: 'temperature 0.5' },
      { args: [[1000.0, 999.0], 1.0], expected: [0.7310585786300049, 0.2689414213699951], name: 'large logits' },
      { args: [[0.0, 0.0, 0.0, 0.0], 1.0], expected: [0.25, 0.25, 0.25, 0.25], name: 'equal logits' },
    ],
    bugType: 'numerical overflow',
    hint: 'What is `math.exp(1000)`? Softmax gives the same answer if you shift every score by a constant.',
    explanation: '`exp` of a large number overflows. Softmax is shift-invariant, so subtract the maximum scaled logit before `exp`: the largest term becomes exp(0) = 1 and nothing overflows.',
  },
  boss: {
    title: 'Sample one token',
    statement:
      'Implement `sample_token(logits, temperature, top_p, u)` returning the chosen token index. If `temperature == 0`, return the index of the largest logit (lowest index on ties). Otherwise compute softmax(`logits / temperature`), keep the nucleus (most likely tokens until the cumulative probability reaches `top_p`, ties by index), renormalise, then walk the kept tokens in index order accumulating probability and return the first index where `u < accumulated`. If rounding means none matches, return the last kept index.',
    language: 'python',
    fnName: 'sample_token',
    starter: `import math

def sample_token(logits, temperature, top_p, u):
    pass
`,
    solution: `import math

def sample_token(logits, temperature, top_p, u):
    if temperature == 0:
        return max(range(len(logits)), key=lambda i: (logits[i], -i))
    scaled = [x / temperature for x in logits]
    m = max(scaled)
    exps = [math.exp(x - m) for x in scaled]
    total = sum(exps)
    probs = [e / total for e in exps]
    order = sorted(range(len(probs)), key=lambda i: (-probs[i], i))
    keep, cum = set(), 0.0
    for i in order:
        keep.add(i)
        cum += probs[i]
        if cum >= top_p:
            break
    mass = sum(probs[i] for i in keep)
    acc = 0.0
    last = 0
    for i in sorted(keep):
        acc += probs[i] / mass
        last = i
        if u < acc:
            return i
    return last`,
    tests: [
      { args: [[3.0, 2.0, 1.0, 0.5], 0, 1.0, 0.5], expected: 0, name: 'temperature 0 is greedy' },
      { args: [[1, 5, 5, 2], 0, 1.0, 0.1], expected: 1, name: 'greedy ties pick the lowest index' },
      { args: [[3.0, 2.0, 1.0, 0.5], 1.0, 1.0, 0.0], expected: 0, name: 'u = 0 picks the first slice' },
      { args: [[3.0, 2.0, 1.0, 0.5], 1.0, 1.0, 0.99], expected: 3, name: 'u near 1 picks the last slice' },
      { args: [[3.0, 2.0, 1.0, 0.5], 1.0, 0.5, 0.9], expected: 0, name: 'tight nucleus leaves only the top token' },
      { args: [[3.0, 2.0, 1.0, 0.5], 1.0, 0.9, 0.95], expected: 2, name: 'u falls in the third kept slice' },
      { args: [[3.0, 2.0, 1.0, 0.5], 0.5, 1.0, 0.6], expected: 0, name: 'low temperature favours the leader' },
    ],
    hints: ['Handle `temperature == 0` first, then reuse the softmax and nucleus steps you already know.', 'Walk `sorted(keep)` (index order), accumulate `probs[i] / mass`, and return the first `i` with `u < acc`. Remember a fallback for the last index.'],
    combines: ['ai-tokens'],
  },
  quiz: [
    {
      prompt: 'top_p = 0.9 keeps…',
      options: ['The top 90% of tokens by count', 'The smallest set of most likely tokens whose probabilities add up to at least 0.9', 'Every token with probability above 0.9', 'A random 90% of the vocabulary'],
      answer: 1,
      explain: 'Nucleus sampling accumulates probability from the most likely token down and stops when the sum reaches p, so the candidate count adapts to how confident the model is.',
    },
    {
      prompt: 'Why is temperature 0 usually handled as a special case?',
      options: ['It makes the model faster', 'Dividing logits by 0 is undefined, so implementations switch to greedy argmax', 'It disables softmax', 'It raises the context limit'],
      answer: 1,
      explain: 'The limit as T → 0 is "always pick the highest logit", so APIs treat 0 as greedy decoding instead of dividing by zero.',
    },
  ],
};

export default unit;
