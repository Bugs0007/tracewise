import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './valid-anagram.py?raw';
import cases from './valid-anagram.cases.json';

interface In {
  s: string;
  t: string;
}

const viz: VizDef<In> = {
  id: 'valid-anagram',
  title: 'Valid Anagram',
  code: solution,
  language: 'python',
  inputs: [
    { key: 's', label: 's', kind: 'string', default: 'banana', maxItems: 12 },
    { key: 't', label: 't', kind: 'string', default: 'ananab', maxItems: 12 },
  ],
  presets: [
    { label: 'Anagrams', input: { s: 'banana', t: 'ananab' } },
    { label: 'Same letters, wrong counts', input: { s: 'aacc', t: 'ccac' } },
    { label: 'Different length', input: { s: 'ab', t: 'a' } },
  ],
  run({ s, t }) {
    const r = new TraceRecorder(solution);
    const count = new Map<string, number>();
    // phase 1 walks s, phase 2 walks t
    const view = (phase: 0 | 1 | 2, i: number, hot: Tone | null, keyTone: Record<string, Tone> = {}) => {
      const sTones: Record<number, Tone> = {};
      const tTones: Record<number, Tone> = {};
      if (phase >= 1) for (let k = 0; k < (phase === 1 ? i : s.length); k++) sTones[k] = 'visited';
      if (phase === 1 && hot && i < s.length) sTones[i] = hot;
      if (phase === 2) {
        for (let k = 0; k < i; k++) tTones[k] = 'visited';
        if (hot && i < t.length) tTones[i] = hot;
      }
      return [
        stringView(s, { title: 's', tones: sTones, pointers: phase === 1 && i < s.length ? { i } : undefined }),
        stringView(t, { title: 't', tones: tTones, pointers: phase === 2 && i < t.length ? { i } : undefined }),
        hashMapView(count, { title: 'count (letter → how many left)', tones: keyTone }),
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ count: Object.fromEntries(count), ...extra });

    r.step('len', `Different lengths cannot be anagrams. len(s) = ${s.length}, len(t) = ${t.length}.`, view(0, 0, null), vars());
    if (s.length !== t.length) {
      r.step('lenfail', 'The lengths differ, so return False right away.', view(0, 0, null), vars({ result: false }));
      return { frames: r.frames, result: false };
    }
    r.step('init', 'Lengths match. An empty map will count how many of each letter we still owe.', view(0, 0, null), vars());
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const before = count.get(ch) ?? 0;
      r.op();
      r.step('countLoop', `Read s[${i}] = "${ch}".`, view(1, i, 'active'), vars({ ch }));
      if (before > 0) r.predictChoice('inc', `count["${ch}"] is ${before} right now. What will it be after this letter?`, String(before + 1), [String(before), String(before + 2)], i, 'A letter we have seen before just goes up by one.');
      count.set(ch, before + 1);
      r.step('inc', `count["${ch}"] becomes ${before + 1}.`, view(1, i, 'new', { [ch]: 'new' }), vars({ ch }));
    }
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      const have = count.get(ch) ?? 0;
      r.op();
      r.step('spendLoop', `Read t[${i}] = "${ch}". Is there still one of it to match?`, view(2, i, 'active', { [ch]: 'compare' }), vars({ ch }));
      r.step('check', `count["${ch}"] is ${have}. ${have === 0 ? 'Nothing left to match' : 'One is available'}.`, view(2, i, 'compare', { [ch]: have === 0 ? 'error' : 'compare' }), vars({ ch, have }));
      r.predict(have === 0 ? 'zero' : 'spend', `count["${ch}"] is ${have}. Does the check "count is 0" stop us?`, ['Yes: return False', 'No: use one up and continue'], have === 0 ? 0 : 1, have === 0 ? `t has more "${ch}" than s does, so they cannot match.` : `There is a "${ch}" left over from s, so t can use it.`);
      if (have === 0) {
        r.step('miss', `t needs a "${ch}" that s did not have enough of: return False.`, view(2, i, 'error', { [ch]: 'error' }), vars({ ch, result: false }));
        return { frames: r.frames, result: false };
      }
      count.set(ch, have - 1);
      r.step('dec', `Match found: count["${ch}"] drops to ${have - 1}.`, view(2, i + 1, null, { [ch]: 'done' }), vars({ ch }));
    }
    r.predict('end', 'Every letter of t found a partner. What is returned?', ['True', 'False'], 0, 'Equal lengths plus no shortage means every count ended at zero.');
    r.step('done', 'Every letter of t used up a letter of s, so the answer is True.', view(2, t.length, null), vars({ result: true }));
    return { frames: r.frames, result: true };
  },
  reference({ s, t }) {
    return [...s].sort().join('') === [...t].sort().join('');
  },
};

const content: ProblemContent = {
  summary: 'Two words are anagrams when you can rearrange the letters of one to get the other, using each letter exactly as many times as it appears. Decide whether two given strings are anagrams.',
  example: { input: 's = "silent", t = "listen"', output: 'true', note: 'Same letters, different order. "aab" and "abb" would be false: same length, different counts.' },
  pattern: {
    answer: 'frequency-count',
    options: ['frequency-count', 'two-pointers', 'sliding-window', 'stack'],
    why: 'Being an anagram means every letter occurs equally often in both strings. Counting letters is the whole problem; order is irrelevant.',
    notes: {
      'two-pointers': 'Two pointers walk the strings in order, but anagrams are about counts, not order.',
      'sliding-window': 'A window would matter if we looked for an anagram inside a longer string. Here the strings are compared whole.',
      stack: 'A stack matches nested or reversed structure. Letters can be in any order here.',
    },
  },
  hints: [
    'If the lengths differ you can answer immediately. What property must hold when the lengths match?',
    'Two strings are anagrams exactly when each letter appears the same number of times in both.',
    'Count the letters of one string, then use up those counts with the other. What does it mean if a count would go below zero?',
  ],
  explanation: {
    insight: 'Anagram means identical letter counts. Count one string up, the other string down, and nothing may go negative.',
    brute: 'Sort both strings and compare them: O(n log n) time.',
    optimal: 'Count letters in a map: O(n) time, and O(k) space for k distinct letters.',
    walkthrough: [
      'Check lengths first. Different lengths means different total letters, so the answer is False.',
      'Walk through s and build a map from letter to how many times it appears.',
      'Now walk through t. For each letter, if the map says there are none left, t has more of that letter than s, so return False. Otherwise subtract one.',
      'Because the lengths are equal, if t never ran short of any letter then every count ended at exactly zero, so the strings are anagrams. The sorting approach is a fine one-liner, but counting avoids the log factor.',
    ],
    edgeCases: ['Both strings empty: they are anagrams of each other (True).', 'Different lengths: answer immediately.', 'Same letters but different counts, such as "aacc" and "ccac".', 'Repeated letters, which is why a set of letters is not enough.'],
    whyItWorks: [
      'With equal lengths, the total number of letters in s equals the total in t. If t never needs a letter that is out of stock, it uses exactly the letters s provided, so no letter of s is left over either.',
      'Using a map keeps this correct for any alphabet, including capital letters or Unicode. With only a to z you could use an array of 26 counters instead.',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'One pass over s and one over t, each step an O(1) map operation.' },
    space: { big: 'O(k)', why: 'The map holds one entry per distinct letter, at most 26 for lowercase English letters.' },
  },
  solution,
  task: taskFrom(cases, 'def is_anagram(s, t):\n    # return True if t is a rearrangement of s\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([s, t]) => ({ s, t }),
};

export default content;
