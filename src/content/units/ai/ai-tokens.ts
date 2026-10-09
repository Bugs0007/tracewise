import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, rawWords, round, tokenId } from '@/content/lib/ai-llm-rag-1';

const code = `
import re
WORD = re.compile(r"[A-Za-z]+|\\d+|[^\\sA-Za-z\\d]")             #@regex

def tokenize(text):
    out = []                                                  #@init
    for w in WORD.findall(text):                              #@word
        if w.isalpha() and len(w) > 4:                        #@long
            pieces = [w[j:j + 4] for j in range(0, len(w), 4)]   #@split
            out.append(pieces[0])
            out.extend("##" + p for p in pieces[1:])
        else:
            out.append(w)                                     #@whole
    return out                                                #@return

def cost(text, dollars_per_million):
    return len(tokenize(text)) * dollars_per_million / 1_000_000   #@cost
`;

interface In {
  text: string;
  price: number;
}

function clean(i: In) {
  const text = String(i.text ?? '');
  if (!rawWords(text).length) throw new Error('Type some text with at least one letter, digit or symbol.');
  const price = Number(i.price);
  if (!Number.isFinite(price) || price < 0) throw new Error('Price must be a number of dollars per million tokens (0 or more).');
  return { text, price };
}

const costOf = (count: number, price: number) => round((count * price) / 1_000_000, 8);

const viz: VizDef<In> = {
  id: 'ai-tokens',
  title: 'Text to tokens',
  code,
  language: 'python',
  inputs: [
    { key: 'text', label: 'Text', kind: 'string', default: 'Tokenization costs money: GPT4 reads 2024 tokens, not words!', maxItems: 160, help: 'Type anything. Long words are cut into pieces.' },
    { key: 'price', label: 'Price ($ per million tokens)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Short words', input: { text: 'the cat sat on the mat', price: 3 } },
    { label: 'Long words', input: { text: 'Internationalization and misunderstandings', price: 3 } },
    { label: 'Numbers & symbols', input: { text: 'Total: $1,234.50 (tax 7%)', price: 10 } },
    { label: 'Only punctuation', input: { text: '?!...', price: 3 } },
  ],
  run(input) {
    const { text, price } = clean(input);
    const r = new Recorder(code);
    const ws = rawWords(text);
    const tokens: string[] = [];
    const view = (cur: number, fresh: number): Panel[] => {
      const wTones: Record<number, Tone> = {};
      ws.forEach((_, i) => {
        wTones[i] = i < cur ? 'done' : i === cur ? 'active' : 'default';
      });
      const tTones: Record<number, Tone> = {};
      tokens.forEach((_, i) => {
        tTones[i] = i >= tokens.length - fresh ? 'new' : 'visited';
      });
      const words: ArrayPanel = { type: 'array', title: `Words and symbols found by the regex (${ws.length})`, values: ws, tones: wTones, hideIndex: true };
      const toks: ArrayPanel = { type: 'array', title: `Tokens so far (${tokens.length}); small numbers are made-up vocabulary ids`, values: tokens.length ? tokens : ['(none yet)'], tones: tTones, indexLabels: tokens.length ? tokens.map((t) => String(tokenId(t))) : undefined, hideIndex: !tokens.length };
      const kv: KVPanel = {
        type: 'kv',
        entries: [
          { k: 'tokens', v: tokens.length, tone: 'active' },
          { k: 'characters', v: text.length },
          { k: 'chars per token', v: tokens.length ? round(text.length / tokens.length, 2) : 0 },
          { k: 'cost so far ($)', v: costOf(tokens.length, price) },
        ],
      };
      return [words, toks, kv];
    };
    r.step('regex', cap(`The regex finds ${ws.length} words and symbols in ${text.length} characters`), view(-1, 0), { words: ws.length });
    ws.forEach((w, wi) => {
      r.op();
      if (/^[A-Za-z]+$/.test(w) && w.length > 4) {
        const pieces: string[] = [];
        for (let j = 0; j < w.length; j += 4) pieces.push(w.slice(j, j + 4));
        tokens.push(pieces[0], ...pieces.slice(1).map((p) => '##' + p));
        r.step('split', cap(`"${w}" is ${w.length} letters (> 4): cut into ${pieces.length} pieces`), view(wi, pieces.length), { w, pieces: pieces.length, tokens: tokens.length });
      } else {
        tokens.push(w);
        r.step('whole', cap(`"${w}" is short or not a word: one token`), view(wi, 1), { w, tokens: tokens.length });
      }
    });
    r.step('return', `${tokens.length} tokens for ${text.length} characters (${round(text.length / tokens.length, 2)} characters per token)`, view(ws.length, 0), { count: tokens.length });
    const dollars = costOf(tokens.length, price);
    r.step('cost', `${tokens.length} tokens x $${price} per million = $${dollars}`, view(ws.length, 0), { count: tokens.length, price, cost: dollars });
    return { frames: r.frames, result: { tokens, count: tokens.length, cost: dollars } };
  },
  reference(input) {
    const { text, price } = clean(input);
    // Independent formulation: a hand-written scanner instead of a regex.
    const letter = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    const digit = (c: string) => c >= '0' && c <= '9';
    const space = (c: string) => /\s/.test(c);
    const out: string[] = [];
    let k = 0;
    while (k < text.length) {
      const c = text[k];
      if (space(c)) {
        k++;
        continue;
      }
      let end = k + 1;
      if (letter(c)) while (end < text.length && letter(text[end])) end++;
      else if (digit(c)) while (end < text.length && digit(text[end])) end++;
      const w = text.slice(k, end);
      if (letter(c) && w.length > 4) {
        out.push(w.slice(0, 4));
        for (let j = 4; j < w.length; j += 4) out.push('##' + w.slice(j, j + 4));
      } else out.push(w);
      k = end;
    }
    return { tokens: out, count: out.length, cost: costOf(out.length, price) };
  },
};

const unit: Unit = {
  id: 'ai-tokens',
  hook: 'Models read tokens, not characters or words, and you are billed and limited by them. Knowing why `"strawberry"` is not one unit explains odd failures and your API bill.',
  predict: {
    prompt: 'A prompt is 100 English words long. Roughly how many tokens will a typical LLM tokenizer produce?',
    options: ['About 25', 'Exactly 100', 'About 130', 'About 500'],
    answer: 2,
    explain: 'Common words are one token, but longer or rarer words, numbers and punctuation split into several. English averages around 1.3 tokens per word (about 4 characters per token).',
  },
  viz,
  simulationNote: 'The tokenizer here is a tiny toy (4-letter pieces), not a real byte-pair encoder. Real vocabularies have tens of thousands of learned pieces. No real model is called.',
  deeper: {
    points: [
      'A **token** is a piece of text the model treats as one symbol: a whole word, part of a word, a digit group or a punctuation mark. The model only ever sees integer ids.',
      'Real tokenizers (byte-pair encoding and relatives) learn their pieces from data: frequent strings get their own id, rare ones are assembled from smaller parts.',
      'Providers bill input and output separately per token, and the context window is measured in tokens, so `len(text)` is the wrong unit for both.',
      'Spaces, capitalisation, numbers and non-English text change token counts. `"2024"` and `" 2024"` can be different tokens, and many languages cost more tokens per word than English.',
      'Always count with the same tokenizer the model uses before you cut or chunk text. A rule of thumb (4 characters per token) is only for rough estimates.',
    ],
    complexity: { time: 'O(n) in the text length', space: 'O(n) tokens' },
    pitfalls: ['Estimating cost from words or characters', 'Using one provider\'s tokenizer to count for another model', 'Cutting text mid-token or mid-word when chunking and getting odd continuations', 'Forgetting that the reply also costs tokens'],
  },
  practice: {
    language: 'python',
    fnName: 'tokenize',
    statement: 'Implement `tokenize(text)`: split text into words (letters), digit runs and single punctuation marks; words longer than 4 letters are cut into 4-letter pieces and every piece after the first gets a `##` prefix.',
    signature: 'def tokenize(text):',
    solution: `import re

def tokenize(text):
    out = []
    for w in re.findall(r"[A-Za-z]+|\\d+|[^\\sA-Za-z\\d]", text):
        if w.isalpha() and len(w) > @@4@@:
            pieces = [w[j:j + 4] for j in range(0, len(w), @@4@@)]
            out.append(@@pieces[0]@@)
            out.extend(@@"##" + p@@ for p in pieces[1:])
        else:
            out.append(w)
    return out`,
    tests: [
      { args: ['Tokenization rocks!'], expected: ['Toke', '##niza', '##tion', 'rock', '##s', '!'], name: 'long words and punctuation' },
      { args: [''], expected: [], name: 'empty text' },
      { args: ['cat sat'], expected: ['cat', 'sat'], name: 'short words stay whole' },
      { args: ['GPT4 costs $2.50'], expected: ['GPT', '4', 'cost', '##s', '$', '2', '.', '50'], name: 'letters, digits and symbols split apart' },
      { args: ['Hello, world'], expected: ['Hell', '##o', ',', 'worl', '##d'], name: 'five-letter words split' },
      { args: ['12345'], expected: ['12345'], name: 'digit runs are not cut' },
      { args: ['abcdefghijkl'], expected: ['abcd', '##efgh', '##ijkl'], name: 'exact multiples of four' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'count_tokens',
    statement: 'The prompt budget checker says "Tokenization rocks!" costs 5 tokens, but the toy tokenizer produces 6 and the bill is higher than predicted. Fix `count_tokens`.',
    buggy: `import re

def count_tokens(text):
    total = 0
    for w in re.findall(r"[A-Za-z]+|\\d+|[^\\sA-Za-z\\d]", text):
        if w.isalpha() and len(w) > 4:
            total += len(w) // 4
        else:
            total += 1
    return total`,
    fixed: `import re

def count_tokens(text):
    total = 0
    for w in re.findall(r"[A-Za-z]+|\\d+|[^\\sA-Za-z\\d]", text):
        if w.isalpha() and len(w) > 4:
            total += (len(w) + 3) // 4
        else:
            total += 1
    return total`,
    tests: [
      { args: ['cat sat'], expected: 2, name: 'short words' },
      { args: ['Tokenization'], expected: 3, name: 'twelve letters: three pieces' },
      { args: ['rocks'], expected: 2, name: 'five letters: two pieces' },
      { args: ['Hello, world'], expected: 5, name: 'five-letter words and a comma' },
      { args: ['abcdefghi'], expected: 3, name: 'nine letters: three pieces' },
      { args: [''], expected: 0, name: 'empty' },
    ],
    bugType: 'off-by-one (floor vs ceiling)',
    hint: 'How many 4-letter pieces does a 5-letter word need? Does `5 // 4` give that?',
    explanation: 'Floor division drops the partial last piece: `5 // 4` is 1 but "rocks" needs two pieces ("rock" and "##s"). The piece count is the ceiling `(len(w) + 3) // 4`.',
  },
  boss: {
    title: 'Pack words into token budgets',
    statement:
      'Implement `split_by_token_budget(text, max_tokens)`. Split `text` on whitespace into words and pack them, in order, into chunks joined by single spaces, so that each chunk has at most `max_tokens` tokens by `minillm.count_tokens` (use it on the joined chunk). A word that is too big on its own goes in a chunk by itself. Return the list of chunk strings (empty list for empty text).',
    language: 'python',
    fnName: 'split_by_token_budget',
    starter: `from minillm import count_tokens

def split_by_token_budget(text, max_tokens):
    pass
`,
    solution: `from minillm import count_tokens

def split_by_token_budget(text, max_tokens):
    chunks = []
    current = []
    for word in text.split():
        candidate = current + [word]
        if current and count_tokens(" ".join(candidate)) > max_tokens:
            chunks.append(" ".join(current))
            current = [word]
        else:
            current = candidate
    if current:
        chunks.append(" ".join(current))
    return chunks`,
    tests: [
      { args: ['Tokenization rocks! Unbelievable pricing today', 4], expected: ['Tokenization', 'rocks!', 'Unbelievable', 'pricing today'], name: 'big words fill a chunk' },
      { args: ['one two three four five six', 3], expected: ['one two', 'three four', 'five six'], name: 'pack greedily' },
      { args: ['Tokenization', 2], expected: ['Tokenization'], name: 'oversized word alone' },
      { args: ['', 5], expected: [], name: 'empty text' },
      { args: ['a b c d e f g h', 8], expected: ['a b c d e f g h'], name: 'everything fits' },
      { args: ['supercalifragilistic is long, ok?', 4], expected: ['supercalifragilistic', 'is long,', 'ok?'], name: 'punctuation counts as tokens' },
    ],
    hints: ['Walk the words and keep a `current` list. Before adding a word, test whether `current + [word]` would exceed the budget.', 'Only flush when `current` is not empty, otherwise a single oversized word would produce an empty chunk. After the loop, flush what is left.'],
    combines: [],
  },
  quiz: [
    {
      prompt: 'Why is counting characters a poor way to estimate an LLM bill?',
      options: ['Characters are not stored by the model', 'Billing and limits are per token and the characters-per-token ratio varies with the text', 'Characters cost more than tokens', 'Tokens are always exactly one word'],
      answer: 1,
      explain: 'Tokens are learned pieces. Code, numbers, rare words and many non-English languages need more tokens per character than plain English.',
    },
    {
      prompt: 'With the toy tokenizer, how many tokens is "unbelievable"?',
      options: ['1', '2', '3', '4'],
      answer: 2,
      explain: '"unbelievable" has 12 letters: "unbe", "##liev", "##able". Three 4-letter pieces.',
    },
  ],
};

export default unit;
