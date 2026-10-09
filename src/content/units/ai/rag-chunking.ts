import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, kvPanel } from '@/content/lib/ai-finish-1';

const code = `
def chunk_text(text, size, overlap=0):
    step = size - overlap                              #@step
    chunks, start = [], 0                              #@init
    while start < len(text):                           #@loop
        chunks.append(text[start:start + size])        #@take
        if start + size >= len(text):                  #@end
            break
        start += step                                  #@advance
    return chunks

def chunk_sentences(text):
    return re.split(r"(?<=[.!?])\\s+", text)            #@sent

def chunk_paragraphs(text):
    return text.split("\\n\\n")                          #@para
`;

interface Doc {
  text: string;
  answer: string;
}

const DOCS: Record<string, Doc> = {
  'refund policy': {
    text: 'Refunds take five days.\n\nContact support if a refund is late. Gift cards never expire.',
    answer: 'five days',
  },
  'guide with an abbreviation': {
    text: 'Dr. Lee wrote the guide. It covers setup in 3 steps.\n\nStep one is login. Step two is sync.',
    answer: '3 steps',
  },
};
const DOC_NAMES = Object.keys(DOCS);
const STRATEGIES = ['fixed', 'overlap', 'sentence', 'paragraph'];

interface In {
  doc: string;
  strategy: string;
  size: number;
  overlap: number;
}

type Range = [number, number]; // [start, end) in characters

function setup(i: In) {
  const d = DOCS[i.doc];
  if (!d) throw new Error('Pick one of: ' + DOC_NAMES.join(', '));
  if (!STRATEGIES.includes(i.strategy)) throw new Error('Strategy must be one of: ' + STRATEGIES.join(', '));
  if (!Number.isInteger(i.size) || i.size < 1) throw new Error('Size must be a whole number of at least 1');
  const overlap = i.strategy === 'overlap' ? i.overlap : 0;
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= i.size) throw new Error('Overlap must be a whole number from 0 to size - 1');
  const aStart = d.text.indexOf(d.answer);
  return { d, size: i.size, overlap, strategy: i.strategy, answer: [aStart, aStart + d.answer.length] as Range };
}

function windows(len: number, size: number, overlap: number): Range[] {
  const out: Range[] = [];
  for (let start = 0; start < len; start += size - overlap) {
    out.push([start, Math.min(start + size, len)]);
    if (start + size >= len) break;
  }
  return out;
}

function splitRanges(text: string, sep: RegExp): Range[] {
  const out: Range[] = [];
  let from = 0;
  for (const m of text.matchAll(sep)) {
    out.push([from, m.index!]);
    from = m.index! + m[0].length;
  }
  if (from < text.length) out.push([from, text.length]);
  return out.filter(([a, b]) => b > a);
}

function ranges(text: string, strategy: string, size: number, overlap: number): Range[] {
  if (strategy === 'sentence') return splitRanges(text, /(?<=[.!?])\s+/g);
  if (strategy === 'paragraph') return splitRanges(text, /\n\n/g);
  return windows(text.length, size, overlap);
}

const show = (s: string) => s.replace(/\n/g, '¶').replace(/ /g, '·');

const viz: VizDef<In> = {
  id: 'rag-chunking',
  title: 'Chunking strategies',
  code,
  language: 'python',
  inputs: [
    { key: 'doc', label: 'Document', kind: 'select', default: DOC_NAMES[0], options: DOC_NAMES },
    { key: 'strategy', label: 'Strategy', kind: 'select', default: 'fixed', options: STRATEGIES },
    { key: 'size', label: 'Chunk size (characters, fixed and overlap)', kind: 'number', default: 40 },
    { key: 'overlap', label: 'Overlap (characters, overlap only)', kind: 'number', default: 8 },
  ],
  presets: [
    { label: 'Fixed 40: answer intact', input: { doc: DOC_NAMES[0], strategy: 'fixed', size: 40, overlap: 0 } },
    { label: 'Fixed 16: answer cut in half', input: { doc: DOC_NAMES[0], strategy: 'fixed', size: 16, overlap: 0 } },
    { label: 'Overlap 16/8: answer rescued', input: { doc: DOC_NAMES[0], strategy: 'overlap', size: 16, overlap: 8 } },
    { label: 'Sentences (abbreviation trap)', input: { doc: DOC_NAMES[1], strategy: 'sentence', size: 40, overlap: 0 } },
    { label: 'Paragraphs', input: { doc: DOC_NAMES[1], strategy: 'paragraph', size: 40, overlap: 0 } },
  ],
  run(input) {
    const { d, size, overlap, strategy, answer } = setup(input);
    const r = new Recorder(code);
    const text = d.text;
    const rs = ranges(text, strategy, size, overlap);
    const chars = text.split('').map(show);
    const anchorFor = strategy === 'sentence' ? 'sent' : strategy === 'paragraph' ? 'para' : 'take';
    const view = (upto: number, cur: Range | null, prev: Range | null): Panel[] => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < upto; k++) for (let c = rs[k][0]; c < rs[k][1]; c++) tones[c] = 'visited';
      if (cur && prev) for (let c = cur[0]; c < Math.min(prev[1], cur[1]); c++) tones[c] = 'compare';
      if (cur) for (let c = cur[0]; c < cur[1]; c++) if (tones[c] !== 'compare') tones[c] = 'active';
      for (let c = answer[0]; c < answer[1]; c++) if (!tones[c] || tones[c] === 'default') tones[c] = 'frontier';
      return [
        {
          type: 'array',
          title: `Document (${text.length} characters, · = space, ¶ = newline)`,
          values: chars,
          tones,
          hideIndex: true,
          range: cur ? { from: cur[0], to: cur[1] - 1, tone: 'active', label: `chunk ${rs.indexOf(cur) + 1}` } : undefined,
        },
        {
          type: 'list',
          title: 'Chunks so far',
          orientation: 'vertical',
          items: rs.slice(0, upto).map((x, k) => ({ label: `#${k + 1}: ${show(text.slice(x[0], x[1]))}`, sub: `chars ${x[0]}–${x[1] - 1} (${x[1] - x[0]})`, tone: 'visited' as Tone })),
          emptyText: 'no chunks yet',
        },
      ];
    };
    r.step('init', `Strategy "${strategy}" on ${text.length} characters; the answer "${d.answer}" sits at ${answer[0]}–${answer[1] - 1}`, view(0, null, null), { size, overlap, step: size - overlap });
    rs.forEach((x, k) => {
      r.op();
      const prev = k > 0 ? rs[k - 1] : null;
      const shared = prev ? Math.max(0, prev[1] - x[0]) : 0;
      const why = strategy === 'sentence' || strategy === 'paragraph' ? `${strategy} boundary` : shared ? `${shared} chars repeated from chunk ${k}` : 'no overlap';
      r.step(anchorFor, `Chunk ${k + 1} = chars ${x[0]}–${x[1] - 1} (${x[1] - x[0]} long), ${why}`, view(k, x, prev), { chunk: k + 1, start: x[0], end: x[1] - 1 });
    });
    const intact = rs.some(([a, b]) => a <= answer[0] && b >= answer[1]);
    const chunks = rs.map(([a, b]) => text.slice(a, b));
    const lens = rs.map(([a, b]) => b - a);
    r.step(
      'end',
      intact ? `The answer "${d.answer}" lives whole inside one chunk` : `The answer "${d.answer}" is split across chunks: retrieval cannot return it`,
      [
        ...view(rs.length, null, null),
        kvPanel('Result', { chunks: rs.length, 'longest chunk': Math.max(0, ...lens), 'answer intact': intact ? 'yes' : 'NO' }, { 'answer intact': intact ? 'found' : 'error' }),
      ],
      { chunks: rs.length, intact },
    );
    return { frames: r.frames, result: { chunks, intact } };
  },
  reference(input) {
    const { d, size, overlap, strategy, answer } = setup(input);
    let chunks: string[];
    if (strategy === 'sentence') chunks = d.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    else if (strategy === 'paragraph') chunks = d.text.split('\n\n').filter(Boolean);
    else {
      chunks = [];
      const step = size - overlap;
      for (let s = 0; ; s += step) {
        chunks.push(d.text.slice(s, s + size));
        if (s + size >= d.text.length) break;
      }
    }
    const starts: number[] = [];
    let from = 0;
    for (const c of chunks) {
      const at = strategy === 'fixed' || strategy === 'overlap' ? starts.length * (size - overlap) : d.text.indexOf(c, from);
      starts.push(at);
      from = at + c.length;
    }
    const intact = chunks.some((c, k) => starts[k] <= answer[0] && starts[k] + c.length >= answer[1]);
    return { chunks, intact };
  },
};

const HARNESS = `
def run_chunk(fn, text, size, overlap):
    try:
        return fn(text, size, overlap)
    except ValueError:
        return "ValueError"
`;

const tests = [
  { args: ['abcdefghij', 4, 0], expected: ['abcd', 'efgh', 'ij'], name: 'no overlap, short tail' },
  { args: ['abcdefghij', 4, 1], expected: ['abcd', 'defg', 'ghij'], name: 'overlap of one' },
  { args: ['abcdefghij', 10, 0], expected: ['abcdefghij'], name: 'text exactly one chunk' },
  { args: ['', 5, 1], expected: [], name: 'empty text' },
  { args: ['abc', 10, 10], expected: 'ValueError', name: 'overlap must be smaller than size' },
  { args: ['abcdefgh', 5, 2], expected: ['abcde', 'defgh'], name: 'no redundant tail chunk' },
  { args: ['hello world', 3, 2], expected: ['hel', 'ell', 'llo', 'lo ', 'o w', ' wo', 'wor', 'orl', 'rld'], name: 'sliding by one' },
];

const SENT = 'Refunds take five days. Contact support if late. Gift cards never expire. Use them at checkout.';

const unit: Unit = {
  id: 'rag-chunking',
  hook: 'Retrieval can only return what chunking produced. Interviewers ask how you size and overlap chunks because most "the model ignored the document" bugs are really "the answer was cut in half".',
  predict: {
    prompt: 'A 500-character policy has the answer in characters 230-260. You split into fixed 250-character chunks with no overlap. What is the most likely problem?',
    options: ['None: the answer is always in some chunk', 'The answer straddles the boundary at 250, so neither chunk contains all of it', 'The embeddings become longer', 'The vector database rejects chunks with no overlap'],
    answer: 1,
    explain: 'Fixed windows ignore meaning. Characters 230-260 cross the cut at 250, so one chunk has the first half and the other the second half. Overlap, or splitting on sentence and paragraph boundaries, avoids this.',
  },
  viz,
  deeper: {
    points: [
      'Fixed-size chunks are trivial and predictable, but they cut sentences and words. Overlap repeats the last `overlap` characters so a boundary-crossing fact lands whole in at least one chunk.',
      'The window start moves by `size - overlap`. The last chunk must stop as soon as a window reaches the end, otherwise you emit a redundant tail that is wholly contained in the previous chunk.',
      'Sentence and paragraph chunking follow the structure of the text, so chunks are coherent, but their size varies and a naive sentence regex splits after abbreviations like "Dr.".',
      'Smaller chunks give precise matches but lose context; larger chunks keep context but dilute the embedding and cost more tokens in the prompt. Tune on your own questions.',
      'Store the source id and character offsets with each chunk so answers can cite their origin.',
    ],
    complexity: { time: 'O(n) for n characters', space: 'O(n × size / step) with overlap' },
    pitfalls: ['An overlap equal to or larger than the size (infinite loop or zero step)', 'A redundant final window', 'Measuring size in characters when the limit is in tokens', 'Splitting inside a code block or table'],
  },
  practice: {
    language: 'python',
    fnName: 'chunk_text',
    statement: 'Implement `chunk_text(text, size, overlap)`. Return consecutive windows of at most `size` characters; each window starts `size - overlap` characters after the previous one. Stop as soon as a window reaches the end of the text. Raise `ValueError` if `overlap >= size`. Empty text gives `[]`.',
    signature: 'def chunk_text(text, size, overlap=0):',
    solution: `def chunk_text(text, size, overlap=0):
    if overlap >= size:
        raise ValueError("overlap must be smaller than size")
    step = @@size - overlap@@
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:@@start + size@@])
        if @@start + size >= len(text)@@:
            break
        start += step
    return chunks`,
    harness: HARNESS,
    adapter: 'run_chunk',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'chunk_text',
    statement: 'The chunker covers the text, but with overlap it emits an extra last chunk that repeats text already in the previous one. Find the bug.',
    harness: HARNESS,
    adapter: 'run_chunk',
    buggy: `def chunk_text(text, size, overlap=0):
    if overlap >= size:
        raise ValueError("overlap must be smaller than size")
    step = size - overlap
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += step
    return chunks`,
    fixed: `def chunk_text(text, size, overlap=0):
    if overlap >= size:
        raise ValueError("overlap must be smaller than size")
    step = size - overlap
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:start + size])
        if start + size >= len(text):
            break
        start += step
    return chunks`,
    tests,
    bugType: 'off-by-one window',
    hint: 'For "abcdefgh", size 5, overlap 2: after the window "defgh" has reached the end, what is start and does the loop still run?',
    explanation: 'The loop condition only checks that the next start is inside the text. After a window already reaches the end, the next start (3 + 3 = 6) is still inside it, so a tail window "gh" is added that is entirely inside the previous chunk. Break as soon as `start + size >= len(text)`.',
  },
  boss: {
    title: 'Sentence-packing chunker',
    statement:
      'Implement `chunk_sentences(text, max_chars)`. Split the stripped text into sentences with `re.split(r"(?<=[.!?])\\s+", text)` (drop empties), then greedily pack consecutive sentences into chunks joined by a single space, starting a new chunk when adding the next sentence would exceed `max_chars`. A sentence longer than `max_chars` stays alone as its own chunk. Empty text gives `[]`.',
    language: 'python',
    fnName: 'chunk_sentences',
    starter: `import re

def chunk_sentences(text, max_chars):
    # your code here
    pass
`,
    solution: `import re

def chunk_sentences(text, max_chars):
    sentences = [s for s in re.split(r"(?<=[.!?])\\s+", text.strip()) if s]
    chunks, cur = [], ""
    for s in sentences:
        if cur and len(cur) + 1 + len(s) > max_chars:
            chunks.append(cur)
            cur = s
        else:
            cur = (cur + " " + s) if cur else s
    if cur:
        chunks.append(cur)
    return chunks`,
    tests: [
      { args: [SENT, 30], expected: ['Refunds take five days.', 'Contact support if late.', 'Gift cards never expire.', 'Use them at checkout.'], name: 'one sentence per chunk' },
      { args: [SENT, 50], expected: ['Refunds take five days. Contact support if late.', 'Gift cards never expire. Use them at checkout.'], name: 'two sentences per chunk' },
      { args: [SENT, 200], expected: [SENT], name: 'everything fits' },
      { args: [SENT, 10], expected: ['Refunds take five days.', 'Contact support if late.', 'Gift cards never expire.', 'Use them at checkout.'], name: 'sentences longer than the limit stay whole' },
      { args: ['', 20], expected: [], name: 'empty text' },
      { args: ['One. Two! Three?', 8], expected: ['One.', 'Two!', 'Three?'], name: 'other terminators' },
    ],
    hints: ['Keep a `cur` string. If adding `" " + sentence` would push it past `max_chars` (and `cur` is not empty), flush `cur` and start over with the sentence.', 'Do not forget to append the last `cur` after the loop, and skip the flush when `cur` is empty so an oversized first sentence is not preceded by an empty chunk.'],
    combines: ['ai-tokens', 'rag-context-assembly'],
  },
  quiz: [
    {
      prompt: 'What is the main reason to add overlap between fixed-size chunks?',
      options: ['It makes the index smaller', 'A fact that crosses a chunk boundary still appears whole in at least one chunk', 'It speeds up cosine similarity', 'Overlap is required by every vector database'],
      answer: 1,
      explain: 'Overlap trades extra storage for a lower chance that the answer is cut in half by a boundary.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
