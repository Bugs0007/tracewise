import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, notePanel } from '@/content/lib/sysdesign-hld-2';

const code = `
def choose_store(requirements, scores):
    totals = {name: 0 for name in scores}               #@init
    for req in requirements:                            #@loop
        for name in scores:
            totals[name] += scores[name].get(req, 0)    #@score
    return max(totals, key=totals.get)                  #@pick
`;

// How well each store family fits each requirement (0 = poor, 3 = excellent). A teaching heuristic, not a benchmark.
const SCORES: Record<string, Record<string, number>> = {
  sql: { transactions: 3, joins: 3, flexible_schema: 1, write_heavy: 1, horizontal_scale: 1, simple_lookups: 1, low_latency: 2, time_series: 1, analytics: 3, strong_consistency: 3 },
  document: { transactions: 1, joins: 1, flexible_schema: 3, write_heavy: 2, horizontal_scale: 2, simple_lookups: 2, low_latency: 2, time_series: 1, analytics: 1, strong_consistency: 2 },
  key_value: { transactions: 0, joins: 0, flexible_schema: 2, write_heavy: 2, horizontal_scale: 3, simple_lookups: 3, low_latency: 3, time_series: 1, analytics: 0, strong_consistency: 1 },
  wide_column: { transactions: 0, joins: 0, flexible_schema: 2, write_heavy: 3, horizontal_scale: 3, simple_lookups: 2, low_latency: 2, time_series: 3, analytics: 2, strong_consistency: 1 },
};
const KNOWN = Object.keys(SCORES.sql);
const NAMES = Object.keys(SCORES);
const LABEL: Record<string, string> = { sql: 'SQL (relational)', document: 'Document store', key_value: 'Key-value store', wide_column: 'Wide-column store' };

interface In {
  requirements: string[];
}

const viz: VizDef<In> = {
  id: 'hld-sql-nosql',
  title: 'Choosing a data store from requirements',
  code,
  language: 'python',
  inputs: [{ key: 'requirements', label: 'Requirements (comma separated)', kind: 'strings', default: ['transactions', 'joins', 'strong_consistency'], maxItems: 8, help: 'Known: ' + KNOWN.join(', ') }],
  presets: [
    { label: 'Orders & payments', input: { requirements: ['transactions', 'joins', 'strong_consistency'] } },
    { label: 'Activity feed', input: { requirements: ['write_heavy', 'horizontal_scale', 'time_series', 'low_latency'] } },
    { label: 'Session cache', input: { requirements: ['simple_lookups', 'low_latency', 'horizontal_scale'] } },
    { label: 'Product catalog', input: { requirements: ['flexible_schema', 'simple_lookups', 'joins'] } },
  ],
  run({ requirements }) {
    if (!requirements.length) throw new Error('List at least one requirement');
    const bad = requirements.find((q) => !KNOWN.includes(q));
    if (bad) throw new Error(`Unknown requirement "${bad}". Use: ${KNOWN.join(', ')}`);
    const r = new Recorder(code);
    const totals: Record<string, number> = Object.fromEntries(NAMES.map((n) => [n, 0]));
    const view = (upto: number, final = false) => {
      const cols = [...requirements.slice(0, upto), 'TOTAL'];
      const cells = NAMES.map((n) => [...requirements.slice(0, upto).map((q) => SCORES[n][q]), totals[n]]);
      const tones: Record<string, Tone> = {};
      const best = Math.max(...Object.values(totals));
      NAMES.forEach((n, i) => {
        requirements.slice(0, upto).forEach((q, j) => {
          const colMax = Math.max(...NAMES.map((m) => SCORES[m][q]));
          tones[`${i},${j}`] = j === upto - 1 && !final ? 'active' : SCORES[n][q] === colMax ? 'found' : SCORES[n][q] === 0 ? 'error' : 'default';
        });
        tones[`${i},${upto}`] = final && totals[n] === best ? 'found' : 'visited';
      });
      return { type: 'grid' as const, title: 'Fit score per requirement (0-3)', cells, tones, rowLabels: NAMES.map((n) => LABEL[n]), colLabels: cols, heat: false };
    };
    r.step('init', `Score ${NAMES.length} store families against ${requirements.length} requirements`, [view(0)], { requirements: requirements.join(',') });
    requirements.forEach((q, i) => {
      for (const n of NAMES) {
        totals[n] += SCORES[n][q];
        r.op();
      }
      const top = NAMES.filter((n) => SCORES[n][q] === Math.max(...NAMES.map((m) => SCORES[m][q])));
      r.step('score', `"${q}" favours ${top.map((n) => LABEL[n].split(' ')[0]).join(' / ')}; totals ${NAMES.map((n) => totals[n]).join('/')}`, [view(i + 1)], Object.fromEntries(NAMES.map((n) => [n, totals[n]])));
    });
    const best = Math.max(...Object.values(totals));
    const winner = NAMES.find((n) => totals[n] === best)!;
    const tied = NAMES.filter((n) => totals[n] === best);
    r.step('loop', 'All requirements scored; compare the totals', [view(requirements.length, true)], { best });
    r.step('pick', tied.length > 1 ? `Tie between ${tied.join(' and ')}; the first listed (${winner}) wins here` : `Pick ${LABEL[winner]} with ${best} points`, [view(requirements.length, true), kvPanel('Decision', { winner, score: best, tied: tied.length > 1 ? tied.join(', ') : 'no' }, { winner: 'found' }), notePanel('A score is a starting point. Say the trade-off out loud: what do you give up by choosing this store?', 'compare')], { winner });
    return { frames: r.frames, result: { winner, totals } };
  },
  reference({ requirements }) {
    const totals = Object.fromEntries(NAMES.map((n) => [n, requirements.reduce((s, q) => s + SCORES[n][q], 0)]));
    const winner = [...NAMES].sort((a, b) => totals[b] - totals[a] || NAMES.indexOf(a) - NAMES.indexOf(b))[0];
    return { winner, totals };
  },
};

const SC = {
  sql: { transactions: 3, joins: 3, flexible_schema: 1, horizontal_scale: 1, simple_lookups: 1 },
  document: { transactions: 1, joins: 1, flexible_schema: 3, horizontal_scale: 2, simple_lookups: 2 },
  key_value: { transactions: 0, joins: 0, flexible_schema: 2, horizontal_scale: 3, simple_lookups: 3 },
};

const chooseTests = [
  { args: [['transactions', 'joins'], SC], expected: 'sql', name: 'relational needs' },
  { args: [['flexible_schema', 'horizontal_scale'], SC], expected: 'document', name: 'tie goes to the first option' },
  { args: [['simple_lookups', 'horizontal_scale', 'horizontal_scale'], SC], expected: 'key_value', name: 'repeated requirement counts twice' },
  { args: [[], SC], expected: 'sql', name: 'no requirements: first option' },
  { args: [['mystery'], SC], expected: 'sql', name: 'unknown requirement scores 0' },
  { args: [['transactions', 'flexible_schema', 'horizontal_scale', 'simple_lookups'], SC], expected: 'document', name: 'mixed needs' },
];

const unit: Unit = {
  id: 'hld-sql-nosql',
  hook: '"SQL or NoSQL?" is never answered with a brand name. Interviewers listen for requirements first (transactions, joins, scale, access pattern) and a clear trade-off second.',
  predict: {
    prompt: 'A payments ledger needs multi-row transactions, joins to a customers table and strong consistency. Traffic is modest (200 writes/s). Which store family fits best?',
    options: ['Key-value store, because it is fastest', 'Wide-column store, because it scales writes', 'Relational (SQL) database', 'Document store, because the schema may change'],
    answer: 2,
    explain: 'Transactions, joins and strong consistency are what relational databases are built for, and 200 writes/s is nowhere near their limit. Scale is not the binding requirement here.',
  },
  viz,
  deeper: {
    points: [
      'Start from access patterns and guarantees, not from scale: what queries, what consistency, what transactions, what growth rate?',
      'Relational: rich queries (joins, aggregates), ACID transactions, a fixed schema. Scales vertically and with replicas first; sharding is possible but costly.',
      'Document: nested data stored together, flexible schema, good when you read a whole aggregate by id. Cross-document joins and transactions are weaker.',
      'Key-value: the simplest model and the lowest latency; you can only look up by key (or a few secondary indexes).',
      'Wide-column: huge write throughput and time-series layouts, partitioned by key; you design tables around the queries you will run.',
      'It is common to combine them: SQL as the source of truth, a key-value cache in front, a search index on the side.',
    ],
    pitfalls: ['Choosing NoSQL "for scale" with 50 requests per second', 'Picking a store before listing the queries', 'Forgetting that denormalised data must be updated in several places'],
  },
  practice: {
    language: 'python',
    fnName: 'choose_store',
    statement: 'Given a list of requirement names and a `scores` dict (`scores[option][requirement]`, missing means 0), add up each option\'s score over all requirements (repeats count again) and return the highest-scoring option. On a tie return the option that appears first in `scores`.',
    signature: 'def choose_store(requirements, scores):',
    solution: `def choose_store(requirements, scores):
    totals = {name: @@0@@ for name in scores}
    for req in requirements:
        for name in scores:
            totals[name] @@+=@@ scores[name].@@get(req, 0)@@
    return @@max(totals, key=totals.get)@@`,
    tests: chooseTests,
  },
  debug: {
    language: 'python',
    fnName: 'choose_store',
    statement: 'The decision function recommends a store that only satisfies the LAST requirement. Find the bug.',
    buggy: `def choose_store(requirements, scores):
    totals = {name: 0 for name in scores}
    for req in requirements:
        for name in scores:
            totals[name] = scores[name].get(req, 0)
    return max(totals, key=totals.get)`,
    fixed: `def choose_store(requirements, scores):
    totals = {name: 0 for name in scores}
    for req in requirements:
        for name in scores:
            totals[name] += scores[name].get(req, 0)
    return max(totals, key=totals.get)`,
    tests: chooseTests,
    bugType: 'assignment instead of accumulation',
    hint: 'After the loop, what does `totals[name]` contain: the sum over all requirements, or something else?',
    explanation: '`=` overwrites the running total on every requirement, so only the last one counts. Use `+=` to accumulate.',
  },
  boss: {
    title: 'Pick with dealbreakers',
    statement:
      'Extend the decision with hard constraints. `must_have` lists requirements an option MUST support (score above 0); options failing any of them are excluded. Among the remaining options return the one with the highest total over `requirements` (ties: first in `scores`). Return `None` if nothing qualifies.',
    language: 'python',
    fnName: 'choose_with_dealbreakers',
    starter: `def choose_with_dealbreakers(requirements, scores, must_have):
    # your code here
    pass
`,
    solution: `def choose_with_dealbreakers(requirements, scores, must_have):
    best = None
    best_total = -1
    for name in scores:
        if any(scores[name].get(m, 0) <= 0 for m in must_have):
            continue
        total = sum(scores[name].get(req, 0) for req in requirements)
        if total > best_total:
            best, best_total = name, total
    return best`,
    tests: [
      { args: [['transactions', 'flexible_schema'], SC, ['transactions']], expected: 'sql', name: 'key-value excluded, tie goes to sql' },
      { args: [['flexible_schema', 'horizontal_scale'], SC, []], expected: 'document', name: 'no constraints' },
      { args: [['simple_lookups'], SC, ['joins']], expected: 'document', name: 'joins required removes key-value' },
      { args: [[], SC, ['transactions', 'horizontal_scale']], expected: 'sql', name: 'only constraints' },
      { args: [['transactions'], SC, ['teleportation']], expected: null, name: 'nothing qualifies' },
      { args: [['horizontal_scale', 'simple_lookups'], SC, ['horizontal_scale']], expected: 'key_value', name: 'scale is a must-have and a want' },
    ],
    hints: ['Loop over the options in order; skip any whose score for a must-have requirement is 0 (use `.get(m, 0)`).', 'Track the best name and its total; only replace it on a strictly greater total so ties keep the earlier option.'],
    combines: ['hld-consistency'],
  },
  quiz: [
    {
      prompt: 'Which reason is the weakest for choosing a NoSQL store?',
      options: ['The access pattern is lookups by key at very high write rates', 'The data is nested and read as one aggregate', 'We might need to scale someday', 'We need low-latency, partition-tolerant writes'],
      answer: 2,
      explain: '"Someday" scale is not a requirement. A single well-indexed relational database handles a lot; pick NoSQL for a concrete access pattern or write volume you can state.',
    },
  ],
};

export default unit;
