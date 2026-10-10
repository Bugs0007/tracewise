import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, chipsView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './encode-and-decode-strings.py?raw';
import harness from './encode-and-decode-strings.harness.py?raw';
import cases from './encode-and-decode-strings.cases.json';

interface In {
  strs: string[];
}

const q = (s: string): string => JSON.stringify(s);

const viz: VizDef<In> = {
  id: 'encode-and-decode-strings',
  title: 'Encode and Decode Strings',
  code: solution,
  language: 'python',
  inputs: [{ key: 'strs', label: 'strings (comma separated, no empty ones here)', kind: 'strings', default: ['sun', 'moon', '#1', 'ok'], maxItems: 6 }],
  presets: [
    { label: 'Tricky characters', input: { strs: ['sun', 'moon', '#1', 'ok'] } },
    { label: 'Plain words', input: { strs: ['red', 'green', 'blue'] } },
    { label: 'Digits and #', input: { strs: ['3#a', '12', '#'] } },
  ],
  validate({ strs }) {
    const total = strs.reduce((n, s) => n + s.length + String(s.length).length + 1, 0);
    return total > 64 ? 'Use shorter strings so the encoded text fits on screen' : null;
  },
  run({ strs }) {
    const r = new TraceRecorder(solution);
    const shown = strs.map(q);

    // ── encode ──
    const parts: string[] = [];
    const encView = (i: number, hot: Tone | null) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      if (hot && i < strs.length) tones[i] = hot;
      return [arrayView(shown, { title: 'strs', tones, pointers: i < strs.length ? { s: i } : undefined }), chipsView(parts, { title: 'out (pieces so far)', tones: parts.length ? { [parts.length - 1]: 'new' } : undefined })];
    };
    r.step('eInit', 'Encoding: build the output piece by piece.', encView(0, null), { out: '[]' });
    for (let i = 0; i < strs.length; i++) {
      const s = strs[i];
      r.step('eLoop', `Next string: ${q(s)} (length ${s.length}).`, encView(i, 'active'), { s, length: s.length });
      const piece = `${s.length}#${s}`;
      r.predictChoice('prefix', `How is ${q(s)} written into the output?`, `${piece}`, [`${s}#${s.length}`, `${s.length}${s}`, `#${s}`], i, 'Length first, then a # that ends the number, then the text itself. The decoder reads the length and then knows exactly how many characters to take.');
      parts.push(piece);
      r.step('eAppend', `Write length, "#", then the text: "${piece}".`, encView(i + 1, null), { piece });
    }
    const encoded = parts.join('');
    r.step('eReturn', `Join the pieces. The encoded text is "${encoded}".`, [arrayView(shown, { title: 'strs', tones: Object.fromEntries(strs.map((_, k) => [k, 'visited' as Tone])) }), stringView(encoded, { title: 'encoded', hideIndex: true, wrap: encoded.length > 14 })], { encoded });

    // ── decode ──
    const result: string[] = [];
    const chars = [...encoded];
    const decView = (i: number, o: { j?: number; len?: number; phase?: 'start' | 'find' | 'len' | 'slice' | 'next' } = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      const pointers: Record<string, number> = {};
      let window: { from: number; to: number; label: string; tone: Tone } | undefined;
      if (i < chars.length) pointers.i = i;
      if (o.j !== undefined) {
        pointers.j = o.j;
        for (let k = i; k < o.j; k++) tones[k] = 'compare';
        tones[o.j] = 'frontier';
      }
      if (o.phase === 'slice' && o.j !== undefined && o.len !== undefined) {
        window = { from: o.j + 1, to: o.j + o.len, label: o.len ? 'taken' : 'nothing to take', tone: 'found' };
        for (let k = o.j + 1; k <= o.j + o.len; k++) tones[k] = 'found';
      }
      return [stringView(encoded, { title: 'encoded', tones, pointers, window: chars.length > 14 ? undefined : window, wrap: chars.length > 14 }), chipsView(result.map(q), { title: 'result', tones: result.length ? { [result.length - 1]: 'new' } : undefined })];
    };
    r.step('dInit', 'Decoding: read the encoded text from the left. result starts empty.', decView(0), { result: '[]' });
    r.step('dStart', 'i marks the start of the next piece.', decView(0), { i: 0 });
    let i = 0;
    while (i < encoded.length) {
      r.op();
      r.step('dLoop', `i = ${i}: a new piece starts here.`, decView(i), { i });
      const j = encoded.indexOf('#', i);
      r.step('dFind', `Find the next "#" at or after i: it is at j = ${j}. The digits before it are the length.`, decView(i, { j, phase: 'find' }), { i, j });
      const length = Number(encoded.slice(i, j));
      r.step('dLen', `length = int("${encoded.slice(i, j)}") = ${length}`, decView(i, { j, phase: 'len' }), { i, j, length });
      const payload = encoded.slice(j + 1, j + 1 + length);
      r.predictChoice(payload.includes('#') ? 'tricky' : 'take', `length is ${length}. Which characters are the string?`, `the ${length} characters after the "#"`, ['everything up to the next "#"', `the ${length} characters before the "#"`, 'the rest of the text'], i, payload.includes('#') ? 'We never search for a delimiter inside the payload, so a "#" in the text is harmless.' : 'We count characters instead of searching for an end marker.');
      result.push(payload);
      r.step('dSlice', length ? `Take exactly ${length} character${length === 1 ? '' : 's'}: ${q(payload)}.` : 'The length is 0, so the string is empty.', decView(i, { j, len: length, phase: 'slice' }), { i, j, length, piece: payload });
      i = j + 1 + length;
      r.step('dNext', `Move i past the piece: i = ${j} + 1 + ${length} = ${i}.`, decView(i, { phase: 'next' }), { i });
    }
    r.step('dReturn', i === 0 ? 'Nothing was encoded, so the result is the empty list.' : 'The text is used up. The result equals the original list.', decView(i), { result: JSON.stringify(result) });
    return { frames: r.frames, result };
  },
  reference({ strs }) {
    return [...strs];
  },
};

const content: ProblemContent = {
  summary: 'Design two functions. encode turns a list of strings into one single string. decode takes that single string and must give back exactly the original list. The strings may contain any characters at all, including whatever separator you might choose.',
  example: { input: 'strs = ["ab", "", "c#d"]', output: 'decode(encode(strs)) == ["ab", "", "c#d"]', note: 'Your encoding must survive empty strings and strings that contain your separator.' },
  pattern: {
    answer: 'length-prefix',
    options: ['length-prefix', 'hash-lookup', 'stack', 'two-pointers'],
    why: 'Any separator character can also appear inside a string. Writing each string\'s length first removes the ambiguity: the decoder reads the length, then takes exactly that many characters, never searching for an end marker.',
    notes: {
      'hash-lookup': 'Nothing needs to be looked up quickly. The challenge is making the format unambiguous.',
      stack: 'There is no nesting to match.',
      'two-pointers': 'The decoder does use an index that walks the text, but the idea that makes it correct is the length prefix.',
    },
  },
  hints: [
    'The obvious plan is to join the strings with a separator such as a comma. What goes wrong if one of the strings contains a comma?',
    'Instead of marking where a string ends, tell the reader how long it is before it starts.',
    'Write the length, then one delimiter that ends the number, then the text: for example "3#sun". Decoding reads digits up to the delimiter, converts them to a number, and takes that many characters.',
  ],
  explanation: {
    insight: 'Store the length in front of each string. A reader that knows the length never has to guess where the string ends.',
    brute: 'Join with a separator and split: breaks as soon as a string contains the separator. Escaping it works but gets fiddly.',
    optimal: 'Length-prefix every string: O(total characters) time and space for both encode and decode.',
    walkthrough: [
      'encode: for each string write len(s), then "#", then s itself, and concatenate everything. For ["hi", ""] this produces "2#hi0#".',
      'decode: keep an index i at the start of the next piece. Find the next "#" at or after i. The characters between i and that "#" are the length.',
      'Take exactly that many characters after the "#": that is the next string. Move i just past them and repeat until the text is used up.',
      'The "#" only has to be a delimiter for the length digits. Digits never contain "#", so the first "#" after i is always the right one, even when the payload itself contains "#" or digits.',
    ],
    edgeCases: ['Empty list: encodes to "", decodes back to [].', 'A list with one empty string: encodes to "0#" and decodes to [""], which is different from the empty list.', 'Strings containing "#" or digits.', 'Very long strings: the length can have many digits, which is why we read up to the delimiter instead of one digit.'],
    whyItWorks: [
      'Invariant: when the decoder is at index i, i is exactly the start of an encoded piece. Digits before the first "#" give the length, so the payload spans a known range, and i + digits + 1 + length is the start of the next piece.',
      'Decoding never inspects the payload, so nothing inside a string can be confused with structure. The format is unambiguous by construction.',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'Both functions touch each character of the combined text a constant number of times (n = total characters).' },
    space: { big: 'O(n)', why: 'The encoded text and the decoded list each hold all n characters.' },
  },
  solution,
  task: taskFrom(cases, 'def encode(strs):\n    # turn a list of strings into one string\n    pass\n\n\ndef decode(s):\n    # turn the encoded string back into the original list\n    pass\n', harness),
  viz: viz as VizDef,
  fromArgs: ([strs]) => ({ strs }),
};

export default content;
