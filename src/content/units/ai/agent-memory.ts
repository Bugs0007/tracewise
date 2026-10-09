import { Recorder } from '@/engine/recorder';
import type { ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, kvPanel, short, step, words } from '@/content/lib/ai-finish-2';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
def remember(memory, text, window):
    memory["recent"].append(text)                                   #@add
    if len(memory["recent"]) > window:                              #@over
        old = memory["recent"].pop(0)                               #@evict
        memory["long"].append(old)                                  #@archive

def recall(memory, query, k):
    q = set(words(query))
    scored = [(len(q & set(words(t))), i) for i, t in enumerate(memory["long"])]   #@score
    scored.sort(key=lambda p: (-p[0], p[1]))                        #@rank
    return [memory["long"][i] for s, i in scored[:k] if s > 0]      #@top

def build_context(memory, query, k):
    return recall(memory, query, k) + memory["recent"]              #@ctx
`;

interface In {
  messages: string[];
  query: string;
  window: number;
  k: number;
}

function clean(i: In) {
  const messages = (i.messages ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (!messages.length) throw new Error('Add at least one message to remember.');
  const window = Math.round(Number(i.window));
  const k = Math.round(Number(i.k));
  if (!Number.isFinite(window) || window < 1 || window > 8) throw new Error('Window must be between 1 and 8 messages.');
  if (!Number.isFinite(k) || k < 0 || k > 5) throw new Error('k must be between 0 and 5.');
  if (!String(i.query ?? '').trim()) throw new Error('Write a query to recall.');
  return { messages, query: String(i.query).trim(), window, k };
}

function overlap(q: string, t: string): number {
  const A = new Set(words(q));
  let n = 0;
  for (const w of new Set(words(t))) if (A.has(w)) n++;
  return n;
}

function recallIdx(long: string[], query: string, k: number): { idx: number; s: number }[] {
  return long
    .map((t, i) => ({ idx: i, s: overlap(query, t) }))
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .slice(0, k)
    .filter((p) => p.s > 0);
}

const list = (title: string, items: string[], tones: Tone[], empty: string): ListPanel => ({
  type: 'list',
  title,
  orientation: 'horizontal',
  items: items.map((t, i) => ({ id: title + i + t, label: short(t, 26), tone: tones[i] ?? 'default' })),
  emptyText: empty,
});

const viz: VizDef<In> = {
  id: 'agent-memory',
  title: 'Short-term window vs long-term memory',
  code,
  language: 'python',
  inputs: [
    {
      key: 'messages',
      label: 'Messages to remember',
      kind: 'strings',
      default: ['my dog is called Rex', 'I live in Oslo', 'the weather is cold today', 'I work as a nurse', 'lunch was good', 'what a long week'],
      maxItems: 10,
      help: 'Comma-separated; they arrive one per turn.',
    },
    { key: 'query', label: 'Later question', kind: 'string', default: 'what is my dog called' },
    { key: 'window', label: 'Window size', kind: 'number', default: 3 },
    { key: 'k', label: 'Recall top-k', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'Fact fell out of the window', input: {} },
    { label: 'Fact still in the window', input: { query: 'how was lunch', window: 3 } },
    { label: 'Nothing relevant stored', input: { query: 'tell me about quantum physics' } },
    { label: 'Recall two memories', input: { query: 'where do I live and work', k: 2 } },
  ],
  run(input) {
    const { messages, query, window, k } = clean(input);
    const r = new Recorder(code);
    const recent: string[] = [];
    const long: string[] = [];
    let flash: Tone | undefined;
    const view = (extra: Panel[] = []): Panel[] => [
      list(`Short-term window (max ${window})`, recent, recent.map((_, i) => (i === recent.length - 1 && flash ? flash : 'active')), 'empty'),
      list('Long-term store', long, long.map(() => 'frontier'), 'empty'),
      ...extra,
    ];
    messages.forEach((m) => {
      r.op();
      recent.push(m);
      flash = 'new';
      step(r, 'add', `Turn: "${short(m, 40)}" enters the window (${recent.length}/${window})`, view(), { recent: recent.length, long: long.length });
      flash = undefined;
      if (recent.length > window) {
        step(r, 'over', `Window holds ${recent.length} > ${window}: the oldest message must leave`, view(), { recent: recent.length });
        const old = recent.shift()!;
        step(r, 'evict', `Evict "${short(old, 40)}" from the window`, view(), { evicted: short(old, 30) });
        long.push(old);
        step(r, 'archive', 'Archive it in the long-term store instead of deleting it', view(), { long: long.length });
      }
    });
    const hits = recallIdx(long, query, k);
    const scores = long.map((t) => overlap(query, t));
    const scorePanel = (final: boolean): Panel => ({
      type: 'array',
      title: `Overlap with "${short(query, 30)}"`,
      values: scores,
      tones: Object.fromEntries(scores.map((s, i) => [i, final && hits.some((h) => h.idx === i) ? 'found' : s > 0 ? 'compare' : 'muted'])) as Record<number, Tone>,
      indexLabels: long.map((t) => short(t, 8)),
    });
    if (long.length) {
      step(r, 'score', `Score each archived memory by shared words with the question`, view([scorePanel(false)]), { scored: long.length });
      step(r, 'rank', 'Sort by score (ties keep the older memory first)', view([scorePanel(false)]), { k });
      step(r, 'top', hits.length ? `Keep the top ${hits.length} with score > 0: "${short(long[hits[0].idx], 34)}"` : 'No memory shares a word with the question: recall returns nothing', view([scorePanel(true)]), { retrieved: hits.length });
    } else {
      step(r, 'top', 'The long-term store is empty: nothing to recall', view(), { retrieved: 0 });
    }
    const retrieved = hits.map((h) => long[h.idx]);
    const context = [...retrieved, ...recent];
    const windowCanAnswer = recent.some((t) => overlap(query, t) > 0);
    step(r, 'ctx', `Prompt context = ${retrieved.length} recalled + ${recent.length} recent messages`, view([kvPanel('What the model sees', { 'window only': recent.length + ' messages', 'with recall': context.length + ' messages', 'window alone relevant?': windowCanAnswer }, { 'with recall': 'found' })]), { context: context.length });
    return { frames: r.frames, result: { recent: [...recent], long: [...long], retrieved, context } };
  },
  reference(input) {
    const { messages, query, window, k } = clean(input);
    const recent: string[] = [];
    const long: string[] = [];
    for (const m of messages) {
      recent.push(m);
      if (recent.length > window) long.push(recent.shift()!);
    }
    const retrieved = recallIdx(long, query, k).map((h) => long[h.idx]);
    return { recent, long, retrieved, context: [...retrieved, ...recent] };
  },
};

const REMEMBER_OK = `def remember(memory, text, window):
    memory["recent"].append(text)
    if len(memory["recent"]) > window:
        old = memory["recent"].pop(0)
        memory["long"].append(old)`;

const MEM = ['my dog is called Rex', 'I live in Oslo', 'it is cold today', 'lunch was good'];

const unit: Unit = {
  id: 'agent-memory',
  hook: 'LLMs are stateless, so "memory" is something you build. Interviewers want the split: a recent window kept verbatim, plus a searchable long-term store for everything that falls out of it.',
  predict: {
    prompt: 'A chat agent keeps only the last 3 messages. The user said "my dog is called Rex" ten turns ago and now asks "what is my dog called?". What happens?',
    options: ['It answers Rex: models remember everything', 'It cannot know; the fact fell out of the window unless something stored and retrieves it', 'It answers Rex because of the system prompt', 'It crashes because the history is too short'],
    answer: 1,
    explain: 'The model only sees the prompt you send. Dropped messages are gone unless you archive them and retrieve the relevant ones into the prompt.',
  },
  viz,
  deeper: {
    points: [
      'Short-term memory is the last N messages (or last T tokens) sent verbatim: cheap, exact, but limited.',
      'Long-term memory is an external store (often vector or keyword search) that you write to and query by relevance.',
      'Write policy matters as much as read policy: archive on eviction, or extract durable facts ("name: Rex") and store those.',
      'Retrieved memories are prepended to the prompt, so they compete with everything else for the token budget.',
      'Summaries are a middle path: compress old turns into a short note, at the risk of losing detail.',
    ],
    pitfalls: ['Dropping evicted messages instead of archiving them', 'Retrieving duplicates that are already in the window', 'Storing everything forever, including sensitive data, without expiry'],
  },
  practice: {
    language: 'python',
    fnName: 'recall',
    statement: 'recall(memories, query, k) scores each memory by the number of distinct lower-case words (letters and digits) it shares with the query, sorts by score descending (ties keep the earlier memory first) and returns the texts of the top k that score above 0.',
    signature: 'def recall(memories, query, k):',
    solution: `import re

def recall(memories, query, k):
    q = @@set(re.findall(r"[a-z0-9]+", query.lower()))@@
    scored = []
    for i, text in enumerate(memories):
        overlap = len(q & set(re.findall(r"[a-z0-9]+", text.lower())))
        scored.append((overlap, i))
    scored.sort(key=@@lambda p: (-p[0], p[1])@@)
    return [memories[i] for overlap, i in scored[:k] if @@overlap > 0@@]`,
    tests: [
      { args: [MEM, 'what is my dog called', 1], expected: ['my dog is called Rex'], name: 'best match' },
      { args: [MEM, 'where is my dog, I live', 2], expected: ['my dog is called Rex', 'I live in Oslo'], name: 'two matches, best first' },
      { args: [MEM, 'quantum physics', 3], expected: [], name: 'nothing shares a word' },
      { args: [['red apple', 'green apple'], 'apple', 2], expected: ['red apple', 'green apple'], name: 'ties keep older first' },
      { args: [MEM, 'Lunch!', 1], expected: ['lunch was good'], name: 'case and punctuation' },
      { args: [MEM, 'dog', 0], expected: [], name: 'k = 0' },
      { args: [[], 'dog', 3], expected: [], name: 'empty store' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'remember',
    harness: `
def run_remember(fn, texts, window):
    memory = {"recent": [], "long": []}
    for t in texts:
        fn(memory, t, window)
    return memory
`,
    adapter: 'run_remember',
    statement: 'remember(memory, text, window) adds text to memory["recent"] and, when the window overflows, moves the oldest message to memory["long"]. Evicted messages are never found again: memory["long"] stays empty.',
    buggy: REMEMBER_OK.replace('        memory["long"].append(old)', '        # old message is simply dropped'),
    fixed: REMEMBER_OK,
    tests: [
      { args: [['a', 'b'], 3], expected: { recent: ['a', 'b'], long: [] }, name: 'fits in the window' },
      { args: [['a', 'b', 'c', 'd'], 2], expected: { recent: ['c', 'd'], long: ['a', 'b'] }, name: 'oldest are archived in order' },
      { args: [['x', 'y'], 1], expected: { recent: ['y'], long: ['x'] }, name: 'window of one' },
    ],
    bugType: 'data loss on eviction',
    hint: 'After pop(0) the old message is held in a local variable. Where does it go next?',
    explanation: 'The oldest message was removed from the window but never stored anywhere, so long-term recall has nothing to find. Archive what you evict.',
  },
  boss: {
    title: 'AgentMemory with window and recall',
    statement: 'Implement class AgentMemory(window, k). add(text) appends to the recent list; if it now holds more than window items, move the oldest to the long-term list. sizes() returns [len(recent), len(long)]. context(query) takes the top-k long-term texts for the query (score = number of distinct lower-case alphanumeric words shared, must be > 0, ties keep the older first), THEN drops any of those that equal a message already in recent, and returns that list followed by the recent messages.',
    language: 'python',
    fnName: 'AgentMemory',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class AgentMemory:
    def __init__(self, window, k):
        pass
`,
    solution: `import re

class AgentMemory:
    def __init__(self, window, k):
        self.window = window
        self.k = k
        self.recent = []
        self.long = []

    def add(self, text):
        self.recent.append(text)
        if len(self.recent) > self.window:
            self.long.append(self.recent.pop(0))

    def sizes(self):
        return [len(self.recent), len(self.long)]

    def context(self, query):
        q = set(re.findall(r"[a-z0-9]+", query.lower()))
        scored = []
        for i, text in enumerate(self.long):
            scored.append((len(q & set(re.findall(r"[a-z0-9]+", text.lower()))), i))
        scored.sort(key=lambda p: (-p[0], p[1]))
        top = [self.long[i] for s, i in scored[: self.k] if s > 0]
        return [t for t in top if t not in self.recent] + self.recent`,
    tests: [
      {
        args: [['AgentMemory', 'add', 'add', 'add', 'add', 'context'], [[2, 1], ['my dog is called Rex'], ['I live in Oslo'], ['it is cold today'], ['lunch was good'], ['what is my dog called']]],
        expected: [null, null, null, null, null, ['my dog is called Rex', 'it is cold today', 'lunch was good']],
        name: 'old fact is recalled',
      },
      { args: [['AgentMemory', 'add', 'add', 'context'], [[1, 2], ['hello'], ['world'], ['quantum physics']]], expected: [null, null, null, ['world']], name: 'nothing relevant: just the window' },
      { args: [['AgentMemory', 'add', 'add', 'add', 'context'], [[1, 2], ['hello there'], ['hello there'], ['hello there'], ['hello']]], expected: [null, null, null, null, ['hello there']], name: 'duplicates of the window are dropped' },
      { args: [['AgentMemory', 'add', 'add', 'add', 'sizes'], [[2, 1], ['a'], ['b'], ['c'], []]], expected: [null, null, null, null, [2, 1]], name: 'sizes' },
      {
        args: [['AgentMemory', 'add', 'add', 'add', 'add', 'context'], [[1, 2], ['red apple pie'], ['green apple tart'], ['blue sky'], ['dark night'], ['apple']]],
        expected: [null, null, null, null, null, ['red apple pie', 'green apple tart', 'dark night']],
        name: 'k = 2 with a tie',
      },
    ],
    hints: ['Keep two lists. add() is just append, then pop(0) into the long list when len(recent) > window.', 'In context(), score first, slice [:k], and only then filter out texts that are in self.recent.'],
    combines: ['ai-context-window', 'ai-embeddings'],
  },
  quiz: [
    {
      prompt: 'Why is "append every message to a vector store forever" not a complete memory design?',
      options: ['Vector stores cannot hold text', 'You still need a write policy (what to keep, expiry, privacy) and a read policy (what to retrieve) within the token budget', 'The model refuses retrieved text', 'It makes the prompt shorter'],
      answer: 1,
      explain: 'Memory quality comes from deciding what to store and what to put back into the prompt. Unfiltered storage buries useful facts and may retain sensitive data.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
