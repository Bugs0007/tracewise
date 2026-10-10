import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './group-anagrams.py?raw';
import cases from './group-anagrams.cases.json';

interface In {
  strs: string[];
}

const sortKey = (w: string): string => [...w].sort().join('');
const quote = (k: string): string => `"${k}"`;

const viz: VizDef<In> = {
  id: 'group-anagrams',
  title: 'Group Anagrams',
  code: solution,
  language: 'python',
  inputs: [{ key: 'strs', label: 'words (comma separated)', kind: 'strings', default: ['stop', 'pots', 'cat', 'tops', 'act', 'dog'], maxItems: 10 }],
  presets: [
    { label: 'Three groups', input: { strs: ['stop', 'pots', 'cat', 'tops', 'act', 'dog'] } },
    { label: 'Nothing groups', input: { strs: ['abc', 'def', 'ghi'] } },
    { label: 'One big group', input: { strs: ['abc', 'bca', 'cab', 'acb'] } },
    { label: 'Single word', input: { strs: ['solo'] } },
  ],
  run({ strs }) {
    const r = new TraceRecorder(solution);
    const groups = new Map<string, string[]>();
    const view = (i: number, hot: Tone | null, keyTone: Record<string, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      if (hot && i < strs.length) tones[i] = hot;
      return [
        arrayView(strs, { title: 'strs', tones, pointers: i < strs.length ? { word: i } : undefined }),
        hashMapView([...groups].map(([k, v]): [string, string[]] => [quote(k), v]), { title: 'groups (sorted letters → words)', tones: Object.fromEntries(Object.entries(keyTone).map(([k, t]) => [quote(k), t])) }),
      ];
    };
    r.step('init', 'groups maps a "signature" to the words that share it.', view(0, null), { groups: '{}' });
    for (let i = 0; i < strs.length; i++) {
      const word = strs[i];
      const key = sortKey(word);
      r.op();
      r.step('loop', `Next word: "${word}"`, view(i, 'active'), { i, word });
      r.step('key', `Sort its letters to get the signature: "${word}" → "${key}". Anagrams always share this signature.`, view(i, 'active'), { word, key });
      const known = groups.has(key);
      r.step('check', `Is the signature "${key}" already a group?`, view(i, 'compare', { [key]: known ? 'compare' : 'default' }), { word, key });
      if (known || groups.size >= 1) r.predict(known ? 'join' : 'new', `Is "${key}" already a group?`, ['Yes: join that group', 'No: start a new group'], known ? 0 : 1, known ? `An earlier word had the same sorted letters, so "${word}" joins it.` : `No earlier word had these letters, so "${word}" starts a fresh group.`);
      if (!known) {
        groups.set(key, []);
        r.step('create', `No group yet: create an empty one for "${key}".`, view(i, 'compare', { [key]: 'new' }), { key });
      }
      groups.get(key)!.push(word);
      r.step('add', `Add "${word}" to the group "${key}".`, view(i + 1, null, { [key]: 'done' }), { key, size: groups.get(key)!.length });
    }
    const result = [...groups.values()];
    r.predictChoice('end', 'Every word has been placed. How many groups are returned?', String(result.length), [String(result.length + 1), String(Math.max(1, result.length - 1)), String(strs.length)], strs.length, 'One group per distinct signature.');
    r.step('done', `Return the groups: ${result.length} group${result.length === 1 ? '' : 's'}.`, view(strs.length, null, Object.fromEntries([...groups.keys()].map((k) => [k, 'found' as Tone]))), { groups: result.length });
    return { frames: r.frames, result };
  },
  reference({ strs }) {
    const by: Record<string, string[]> = {};
    for (const w of strs) (by[[...w].sort().join('')] ??= []).push(w);
    return Object.values(by);
  },
};

const content: ProblemContent = {
  summary: 'You get a list of words. Split them into groups so that every group holds words that are rearrangements of one another. The order of the groups and of the words inside them does not matter.',
  example: { input: 'words = ["tab", "bat", "cat", "act"]', output: '[["tab", "bat"], ["cat", "act"]]', note: '"tab" and "bat" use the same letters, as do "cat" and "act".' },
  pattern: {
    answer: 'group-by-key',
    options: ['group-by-key', 'frequency-count', 'sorting', 'two-pointers'],
    why: 'Words belong together exactly when they share a canonical form. Compute one key per word that is identical for anagrams, and bucket the words by that key.',
    notes: {
      'frequency-count': 'Counting letters is one way to build the key, so it is a useful tool, but the overall pattern is grouping words by that key.',
      sorting: 'Sorting the letters of each word is how the key is built in the simple solution. Sorting the list of words would not group them, though.',
      'two-pointers': 'Two pointers compare two positions. Here every word has to be compared with groups it could belong to, which is what a key lookup does in one step.',
    },
  },
  hints: [
    'Two words are anagrams when they contain the same letters. Is there a single value you could compute from a word that is identical for all of its anagrams?',
    'Sorting the letters of a word gives such a value: "tea" and "eat" both become "aet".',
    'Use that value as the key of a hash map whose values are lists of words. What does the final answer look like in terms of the map?',
  ],
  explanation: {
    insight: 'Give every word a signature that all its anagrams share, then group by signature with a hash map.',
    brute: 'Brute force: compare every word with every other word for anagram-ness, building groups as you go. About O(n² · m log m).',
    optimal: 'Hash map from signature to word list: O(n · m log m) time for n words of length m (sorting each), O(n · m) space.',
    walkthrough: [
      'Create an empty map from signature to a list of words.',
      'For each word, compute its signature by sorting its letters. Anagrams produce identical signatures; different letter multisets produce different ones.',
      'If the signature is not in the map yet, create an empty list for it. Then append the word to that list.',
      'At the end the map values are the groups. Return them. An alternative signature is a tuple of 26 letter counts, which removes the sort and gives O(n · m) time for lowercase English words.',
    ],
    edgeCases: ['Empty list of words: return an empty list.', 'An empty string is a word with signature "" and groups with other empty strings.', 'Repeated identical words stay in the same group.', 'Words with the same letters but different counts ("aab" and "abb") get different signatures.'],
    whyItWorks: [
      'Two words are anagrams exactly when their sorted letters are equal. So the signature partitions the words into the correct classes: same group if and only if same signature.',
      'A hash map finds the class of a signature in O(1) on average, so each word is placed with one lookup and one append.',
    ],
  },
  complexity: {
    time: { big: 'O(n · m log m)', why: 'For n words of length m, each word is sorted once (m log m) and then does O(1) map work.' },
    space: { big: 'O(n · m)', why: 'The map stores every word once, and keys add at most the same again.' },
  },
  solution,
  task: taskFrom(cases, 'def group_anagrams(strs):\n    # return a list of groups of words that are anagrams of each other\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([strs]) => ({ strs }),
};

export default content;
