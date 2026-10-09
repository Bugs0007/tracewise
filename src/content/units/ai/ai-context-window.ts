import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, ChartPanel, KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, tokenize } from '@/content/lib/ai-llm-rag-1';

const code = `
def fit_messages(messages, budget):                          # newest-first
    system = [m for m in messages if m["role"] == "system"]  #@split
    rest = [m for m in messages if m["role"] != "system"]
    used = sum(count_tokens(m["content"]) for m in system)   #@sys
    kept = []
    for m in reversed(rest):                                 #@scan
        t = count_tokens(m["content"])
        if used + t > budget:                                #@check
            break                                            #@stop
        kept.append(m)                                       #@keep
        used += t
    return system + kept[::-1]                               #@return

def sliding_window(messages, n):                             # last n turns
    system = [m for m in messages if m["role"] == "system"]  #@w_split
    rest = [m for m in messages if m["role"] != "system"]
    return system + rest[-n:]                                #@w_return

def summarise_old(messages, budget, summary_cost=10):        # summary slot
    if total_tokens(messages) <= budget:                     #@s_fit
        return messages
    kept = fit_messages(messages, budget - summary_cost)     #@s_trim
    n_sys = sum(m["role"] == "system" for m in kept)
    dropped = len(messages) - len(kept)
    note = {"role": "system", "content": f"[summary of {dropped} earlier messages]"}   #@s_note
    return kept[:n_sys] + [note] + kept[n_sys:]              #@s_return
`;

type Role = 'system' | 'user' | 'assistant';
interface Msg {
  role: Role;
  content: string;
  tokens: number;
}
type Status = 'system' | 'pending' | 'kept' | 'dropped';

interface In {
  messages: string[];
  budget: number;
  strategy: string;
  window: number;
}

const STRATEGIES = ['newest-first', 'sliding-window', 'summarise'];
const SUMMARY_COST = 10;

function parse(lines: string[]): Msg[] {
  if (!lines.length) throw new Error('Add at least one message such as "user: hello".');
  return lines.map((line, i) => {
    const m = line.match(/^\s*(system|user|assistant)\s*:\s*(.*)$/i);
    if (!m) throw new Error(`Message ${i + 1} must start with "system:", "user:" or "assistant:".`);
    return { role: m[1].toLowerCase() as Role, content: m[2], tokens: tokenize(m[2]).length };
  });
}

function clean(i: In) {
  const msgs = parse(i.messages);
  const budget = Math.round(Number(i.budget));
  if (!Number.isFinite(budget) || budget < 1) throw new Error('Budget must be at least 1 token.');
  if (!STRATEGIES.includes(i.strategy)) throw new Error(`Strategy must be one of ${STRATEGIES.join(', ')}.`);
  const window = Math.max(0, Math.round(Number(i.window)));
  return { msgs, budget, strategy: i.strategy, window: Number.isFinite(window) ? window : 3 };
}

const tag = (m: Msg) => (m.role === 'system' ? 'sys' : m.role === 'user' ? 'usr' : 'ast');

const viz: VizDef<In> = {
  id: 'ai-context-window',
  title: 'Fitting a conversation into the context window',
  code,
  language: 'python',
  inputs: [
    {
      key: 'messages',
      label: 'Messages (role: text)',
      kind: 'strings',
      default: [
        'system: You are a concise tutor.',
        'user: What is a token?',
        'assistant: A token is a small piece of text the model reads.',
        'user: And a context window?',
        'assistant: It is the largest number of tokens the model can see at once.',
        'user: What happens when it is full?',
        'assistant: Older messages are dropped or replaced by a summary.',
        'user: Which should I keep?',
      ],
      maxItems: 12,
      help: 'Comma-separated. Avoid commas inside a message.',
    },
    { key: 'budget', label: 'Budget (tokens)', kind: 'number', default: 60 },
    { key: 'strategy', label: 'Strategy', kind: 'select', default: 'newest-first', options: STRATEGIES },
    { key: 'window', label: 'Window (turns, sliding only)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Tight budget', input: { budget: 30, strategy: 'newest-first' } },
    { label: 'Everything fits', input: { budget: 500, strategy: 'newest-first' } },
    { label: 'Sliding window', input: { budget: 60, strategy: 'sliding-window', window: 3 } },
    { label: 'Summarise old turns', input: { budget: 45, strategy: 'summarise' } },
  ],
  run(input) {
    const { msgs, budget, strategy, window } = clean(input);
    const r = new Recorder(code);
    const status: Status[] = msgs.map((m) => (m.role === 'system' ? 'system' : 'pending'));
    let used = 0;
    let summary = false;
    let current = -1;
    let limit = budget;

    const view = (final = false): Panel[] => {
      const tones: Record<number, Tone> = {};
      status.forEach((s, i) => {
        tones[i] = i === current ? 'active' : s === 'system' ? 'compare' : s === 'kept' ? 'found' : s === 'dropped' ? 'muted' : 'default';
      });
      const history: ArrayPanel = { type: 'array', title: 'History (tokens after each label)', values: msgs.map((m) => `${tag(m)} ${m.tokens}`), tones, indexLabels: msgs.map((_, i) => `#${i + 1}`) };
      const mk = (label: string, s: Status) => ({ label, points: msgs.flatMap((m, i) => (status[i] === s ? [[i + 1, m.tokens] as [number, number]] : [])), tone: (s === 'system' ? 'compare' : s === 'kept' ? 'found' : s === 'dropped' ? 'error' : 'default') as Tone });
      const chart: ChartPanel = {
        type: 'chart',
        title: 'Tokens per message',
        kind: 'bar',
        xLabel: 'message #',
        yLabel: 'tokens',
        series: [mk('system', 'system'), mk('kept', 'kept'), mk('dropped', 'dropped'), mk('not looked at yet', 'pending')].filter((s) => s.points.length),
      };
      const kv: KVPanel = {
        type: 'kv',
        entries: [
          { k: 'tokens used', v: used, tone: used > budget ? 'error' : 'active' },
          { k: 'budget', v: limit === budget ? budget : `${budget} (${limit} for messages, ${budget - limit} held for the summary)` },
          { k: 'dropped', v: status.filter((s) => s === 'dropped').length, tone: 'muted' },
        ],
      };
      const out: Panel[] = [history, chart, kv];
      if (final) {
        const prompt: string[] = [];
        let placed = false;
        msgs.forEach((m, i) => {
          if (status[i] === 'kept' || status[i] === 'system') {
            if (summary && !placed && status[i] !== 'system') {
              prompt.push(`summary ${SUMMARY_COST}`);
              placed = true;
            }
            prompt.push(`${tag(m)} ${m.tokens}`);
          }
        });
        if (summary && !placed) prompt.push(`summary ${SUMMARY_COST}`);
        out.splice(1, 0, { type: 'array', title: 'Prompt sent to the model', values: prompt.length ? prompt : ['(empty)'], tones: Object.fromEntries(prompt.map((p, i) => [i, (p.startsWith('summary') ? 'new' : p.startsWith('sys') ? 'compare' : 'found') as Tone])) });
      }
      return out;
    };

    const scanNewestFirst = (lim: number, anchors: { sys: string }) => {
      limit = lim;
      const sysTokens = msgs.reduce((s, m, i) => s + (status[i] === 'system' ? m.tokens : 0), 0);
      used += sysTokens;
      const turns = msgs.filter((m) => m.role !== 'system').length;
      r.step(anchors.sys, cap(`System prompt (${sysTokens} tokens) is always kept; ${turns} turns compete for ${lim - used}`), view(), { used, budget: lim });
      let stopped = false;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'system') continue;
        if (stopped) {
          status[i] = 'dropped';
          continue;
        }
        current = i;
        r.op();
        const t = msgs[i].tokens;
        const fits = used + t <= lim;
        r.step('check', cap(`#${i + 1} (${msgs[i].role}, ${t} tok): ${used} + ${t} ${fits ? '≤' : '>'} ${lim} → ${fits ? 'keep' : 'stop'}`), view(), { used, t, budget: lim });
        if (fits) {
          status[i] = 'kept';
          used += t;
          current = -1;
          r.step('keep', cap(`Keep #${i + 1}; ${used} of ${lim} tokens used`), view(), { used });
        } else {
          status[i] = 'dropped';
          stopped = true;
          current = -1;
          r.step('stop', cap(`#${i + 1} does not fit: it and everything older is dropped`), view(), { used });
        }
      }
      current = -1;
    };

    if (strategy === 'newest-first') {
      scanNewestFirst(budget, { sys: 'sys' });
      r.step('return', cap(`Prompt = system + ${status.filter((s) => s === 'kept').length} newest turns, ${used} tokens`), view(true), { used });
    } else if (strategy === 'sliding-window') {
      const rest = msgs.map((m, i) => (m.role === 'system' ? -1 : i)).filter((i) => i >= 0);
      used = msgs.reduce((s, m) => s + (m.role === 'system' ? m.tokens : 0), 0);
      r.step('w_split', `Keep the system prompt (${used} tokens) and the last ${window} turns`, view(), { used, window });
      rest.forEach((idx, pos) => {
        r.op();
        const keep = pos >= rest.length - window;
        status[idx] = keep ? 'kept' : 'dropped';
        if (keep) used += msgs[idx].tokens;
        current = idx;
        r.step('w_return', cap(keep ? `#${idx + 1} is in the last ${window}: keep (${used} tokens)` : `#${idx + 1} is older than the last ${window}: drop`), view(), { used });
        current = -1;
      });
      r.step('w_return', used > budget ? `${used} tokens > budget ${budget}: a turn window does not respect the budget` : `${used} tokens fit the budget of ${budget}`, view(true), { used, budget });
    } else {
      const total = msgs.reduce((s, m) => s + m.tokens, 0);
      if (total <= budget) {
        status.forEach((s, i) => {
          if (s === 'pending') status[i] = 'kept';
        });
        used = total;
        r.step('s_fit', `${total} ≤ ${budget}: everything fits, no summary needed`, view(true), { total, budget });
      } else {
        r.step('s_fit', `${total} > ${budget}: too long, reserve ${SUMMARY_COST} tokens for a summary`, view(), { total, budget });
        r.step('s_trim', `Fit the newest turns into ${budget - SUMMARY_COST} tokens`, view(), { limit: budget - SUMMARY_COST });
        scanNewestFirst(budget - SUMMARY_COST, { sys: 'sys' });
        const dropped = status.filter((s) => s === 'dropped').length;
        if (dropped) {
          summary = true;
          used += SUMMARY_COST;
          limit = budget;
          r.step('s_note', `Replace ${dropped} dropped messages with a ${SUMMARY_COST}-token summary note`, view(), { dropped, used });
        }
        r.step('s_return', `Prompt has ${used} of ${budget} tokens`, view(true), { used, budget });
      }
    }
    const kept = status.flatMap((s, i) => (s === 'kept' || s === 'system' ? [i] : []));
    return { frames: r.frames, result: { kept, summary, used, dropped: status.filter((s) => s === 'dropped').length } };
  },
  reference(input) {
    const { msgs, budget, strategy, window } = clean(input);
    const sys = msgs.flatMap((m, i) => (m.role === 'system' ? [i] : []));
    const turns = msgs.flatMap((m, i) => (m.role !== 'system' ? [i] : []));
    const sysTokens = sys.reduce((s, i) => s + msgs[i].tokens, 0);
    const newest = (lim: number) => {
      // largest suffix of turns whose tokens fit under lim (independent: suffix sums)
      let best = 0;
      let sum = sysTokens;
      for (let n = 1; n <= turns.length; n++) {
        sum += msgs[turns[turns.length - n]].tokens;
        if (sum > lim) break;
        best = n;
      }
      return turns.slice(turns.length - best);
    };
    if (strategy === 'sliding-window') {
      const keepTurns = window === 0 ? [] : turns.slice(-window);
      const kept = [...sys, ...keepTurns].sort((a, b) => a - b);
      return { kept, summary: false, used: kept.reduce((s, i) => s + msgs[i].tokens, 0), dropped: turns.length - keepTurns.length };
    }
    const total = msgs.reduce((s, m) => s + m.tokens, 0);
    if (strategy === 'summarise' && total > budget) {
      const k = newest(budget - SUMMARY_COST);
      const kept = [...sys, ...k].sort((a, b) => a - b);
      const dropped = turns.length - k.length;
      return { kept, summary: dropped > 0, used: kept.reduce((s, i) => s + msgs[i].tokens, 0) + (dropped > 0 ? SUMMARY_COST : 0), dropped };
    }
    const k = newest(budget);
    const kept = [...sys, ...k].sort((a, b) => a - b);
    return { kept, summary: false, used: kept.reduce((s, i) => s + msgs[i].tokens, 0), dropped: turns.length - k.length };
  },
};

const unit: Unit = {
  id: 'ai-context-window',
  hook: 'Every chat product hits the context limit sooner or later. "How do you keep a long conversation inside the window?" is a standard system-design question and a fair test of whether you count tokens or characters.',
  predict: {
    prompt: 'A chat has a system prompt and 40 turns, and it no longer fits the context window. Which messages should a simple trimming strategy drop first?',
    options: ['The system prompt', 'The oldest user and assistant turns', 'The newest turn', 'A random half of the turns'],
    answer: 1,
    explain: 'The system prompt carries the rules and the newest turns carry what the user is asking now. The oldest turns are the cheapest to lose, though a summary of them can preserve the gist.',
  },
  viz,
  simulationNote: 'Token counts use a deterministic toy tokenizer and the "summary" is a placeholder note; no real model is called.',
  deeper: {
    points: [
      'The **context window** is the maximum number of tokens (prompt plus the reply being generated) the model can attend to in one call. Anything outside it simply does not exist for the model.',
      'The reply needs room too: budget = window - reserved output tokens. Trimming only the input to exactly the window leaves nothing to generate.',
      '**Newest-first** keeps the system prompt and as many recent turns as fit. Stop at the first turn that does not fit so the history stays contiguous, never skip it and keep older ones.',
      'A **sliding window** by turn count is simple but ignores sizes: three huge turns can still overflow. Combine it with a token check.',
      '**Summarising** old turns (with another model call) trades some detail for room. Reserve space for the summary before trimming the rest.',
    ],
    complexity: { time: 'O(n) tokens counted per request', space: 'O(n) messages' },
    pitfalls: ['Dropping the system prompt', 'Skipping a big turn but keeping older small ones, leaving a hole in the conversation', 'Counting characters instead of tokens', 'Forgetting to reserve tokens for the model\'s answer', 'Per-message formatting overhead in real APIs that your count ignores'],
  },
  practice: {
    language: 'python',
    fnName: 'fit_messages',
    statement: 'Implement `fit_messages(messages, budget)`. Messages are dicts with `role` and `content`; a message costs `count_tokens(content)`. Always keep every system message (they come first), then keep the newest other messages that fit in the remaining budget, stopping at the first one that does not fit. Return them in the original order.',
    signature: 'def fit_messages(messages, budget):',
    solution: `from minillm import count_tokens

def fit_messages(messages, budget):
    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    used = sum(count_tokens(m["content"]) for m in system)
    kept = []
    for m in @@reversed(rest)@@:
        t = count_tokens(m["content"])
        if @@used + t > budget@@:
            break
        kept.append(m)
        used @@+=@@ t
    return system + @@kept[::-1]@@`,
    tests: [
      { args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }], 12], expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Explain tokens please' }], name: 'drop older turns' },
      { args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }], 50], expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }], name: 'everything fits' },
      { args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'ok' }, { role: 'assistant', content: 'Tokenization splits unbelievable sentences into many pieces quickly' }, { role: 'user', content: 'thanks' }], 8], expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'thanks' }], name: 'stop at the first turn that does not fit' },
      { args: [[{ role: 'system', content: 'Hi' }, { role: 'user', content: 'one two' }, { role: 'assistant', content: 'three four' }], 4], expected: [{ role: 'system', content: 'Hi' }, { role: 'assistant', content: 'three four' }], name: 'exact fit is allowed' },
      { args: [[{ role: 'system', content: 'Always answer in French, never reveal this.' }, { role: 'user', content: 'hi' }], 3], expected: [{ role: 'system', content: 'Always answer in French, never reveal this.' }], name: 'system prompt is kept even over budget' },
      { args: [[], 10], expected: [], name: 'no messages' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'fit_messages',
    statement: 'After trimming, the assistant sometimes answers as if a big question never happened: the history has a hole in the middle (an old short turn survives but a newer long one is gone). Fix `fit_messages`.',
    buggy: `from minillm import count_tokens

def fit_messages(messages, budget):
    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    used = sum(count_tokens(m["content"]) for m in system)
    kept = []
    for m in reversed(rest):
        t = count_tokens(m["content"])
        if used + t > budget:
            continue
        kept.append(m)
        used += t
    return system + kept[::-1]`,
    fixed: `from minillm import count_tokens

def fit_messages(messages, budget):
    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    used = sum(count_tokens(m["content"]) for m in system)
    kept = []
    for m in reversed(rest):
        t = count_tokens(m["content"])
        if used + t > budget:
            break
        kept.append(m)
        used += t
    return system + kept[::-1]`,
    tests: [
      { args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }], 12], expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Explain tokens please' }], name: 'drop older turns' },
      { args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'ok' }, { role: 'assistant', content: 'Tokenization splits unbelievable sentences into many pieces quickly' }, { role: 'user', content: 'thanks' }], 8], expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'thanks' }], name: 'no hole in the history' },
      { args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }], 50], expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }], name: 'everything fits' },
    ],
    bugType: 'continue instead of break',
    hint: 'When a turn does not fit, should older (smaller) turns still be allowed in?',
    explanation: '`continue` skips only the oversized turn, so an older small turn can still be added after it and the conversation has a gap. Stop at the first turn that does not fit with `break`.',
  },
  boss: {
    title: 'Trim with a summary slot',
    statement:
      'Implement `trim_with_summary(messages, budget, summary_cost)`. If the total tokens (`count_tokens` of each content) are within `budget`, return the messages unchanged. Otherwise keep all system messages, reserve `summary_cost` tokens, keep the newest other messages that fit (stop at the first that does not), and insert one system message `{"role": "system", "content": "[summary of N earlier messages]"}` (N = number dropped) right after the original system messages. If there are no turns to drop, return the messages unchanged.',
    language: 'python',
    fnName: 'trim_with_summary',
    starter: `from minillm import count_tokens

def trim_with_summary(messages, budget, summary_cost):
    pass
`,
    solution: `from minillm import count_tokens

def trim_with_summary(messages, budget, summary_cost):
    cost = lambda m: count_tokens(m["content"])
    if sum(cost(m) for m in messages) <= budget:
        return list(messages)
    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    used = sum(cost(m) for m in system) + summary_cost
    kept = []
    for m in reversed(rest):
        if used + cost(m) > budget:
            break
        kept.append(m)
        used += cost(m)
    dropped = len(rest) - len(kept)
    if dropped == 0:
        return list(messages)
    summary = {"role": "system", "content": "[summary of " + str(dropped) + " earlier messages]"}
    return system + [summary] + kept[::-1]`,
    tests: [
      {
        args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }, { role: 'assistant', content: 'Tokens are pieces of text.' }, { role: 'user', content: 'Thanks' }], 100, 5],
        expected: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }, { role: 'assistant', content: 'Tokens are pieces of text.' }, { role: 'user', content: 'Thanks' }],
        name: 'fits: unchanged',
      },
      {
        args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }, { role: 'assistant', content: 'Tokens are pieces of text.' }, { role: 'user', content: 'Thanks' }], 20, 4],
        expected: [{ role: 'system', content: 'Be brief.' }, { role: 'system', content: '[summary of 3 earlier messages]' }, { role: 'assistant', content: 'Tokens are pieces of text.' }, { role: 'user', content: 'Thanks' }],
        name: 'summarise three old turns',
      },
      {
        args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }, { role: 'assistant', content: 'Tokens are pieces of text.' }, { role: 'user', content: 'Thanks' }], 14, 4],
        expected: [{ role: 'system', content: 'Be brief.' }, { role: 'system', content: '[summary of 4 earlier messages]' }, { role: 'user', content: 'Thanks' }],
        name: 'only the newest turn survives',
      },
      {
        args: [[{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi there' }, { role: 'assistant', content: 'Hello! How can I help?' }, { role: 'user', content: 'Explain tokens please' }, { role: 'assistant', content: 'Tokens are pieces of text.' }, { role: 'user', content: 'Thanks' }], 6, 4],
        expected: [{ role: 'system', content: 'Be brief.' }, { role: 'system', content: '[summary of 5 earlier messages]' }],
        name: 'nothing fits next to the summary',
      },
      { args: [[{ role: 'system', content: 'Be brief.' }], 2, 3], expected: [{ role: 'system', content: 'Be brief.' }], name: 'nothing to drop' },
    ],
    hints: ['Check the whole conversation first: if it already fits, return a copy. Otherwise start `used` at the system tokens plus `summary_cost`.', 'Walk the non-system messages newest-first and `break` at the first that does not fit. Count how many were dropped, build the summary dict, and return `system + [summary] + kept[::-1]`.'],
    combines: ['ai-tokens'],
  },
  quiz: [
    {
      prompt: 'Your window is 8,000 tokens and you want replies of up to 1,000 tokens. How large can the prompt be?',
      options: ['8,000', '7,000', '9,000', '1,000'],
      answer: 1,
      explain: 'Prompt and reply share the window, so the budget for the input is the window minus the room reserved for output.',
    },
    {
      prompt: 'Why stop (break) at the first turn that does not fit instead of skipping it?',
      options: ['It is faster', 'Skipping leaves a gap: older turns without the one that followed them make the conversation incoherent', 'The API requires it', 'Longer turns are more important'],
      answer: 1,
      explain: 'A contiguous recent suffix keeps question/answer pairs intact. Skipping a turn can leave an answer whose question was dropped or the reverse.',
    },
  ],
};

export default unit;
