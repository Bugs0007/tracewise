// Builds narrated "videos" from content that already exists: a topic's intro, checklist and templates,
// and each problem's explanation plus its real trace. Nothing here is hand-written per video, so every
// one of the 150 problems (and every topic) gets a video for free, and they stay in sync with the pages.
import { parseAnchors } from '@/engine/recorder';
import type { Frame } from '@/engine/types';
import { PATTERNS } from '../patterns';
import type { ProblemContent, ProblemMeta, TopicContent, TopicMeta } from '../types';

interface Base {
  /** the chapter this scene belongs to (shown in the chapter list) */
  chapter: string;
  /** narration; also the subtitles, one sentence at a time */
  say: string;
}

export type Scene = Base &
  (
    | { kind: 'title'; heading: string; sub?: string; tag?: string }
    | { kind: 'points'; heading: string; points: string[]; active: number; code?: string; line?: number }
    | { kind: 'code'; heading: string; code: string }
    | { kind: 'trace'; heading: string; frame: Frame; code: string; step: number; total: number }
  );

export interface Video {
  id: string;
  title: string;
  kind: 'concept' | 'problem';
  scenes: Scene[];
}

/** Display text: drop the tiny markdown the content uses. */
export const plain = (s: string): string => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

/** Split narration into sentences, so subtitles stay short and speech engines never time out. */
export function sentences(s: string): string[] {
  return plain(s)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'([])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n', 'ᵏ': 'k' };
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4' };

/** Code words a speech engine would misread, and how to say them. */
const WORDS: [RegExp, string][] = [
  [/\be\.g\./gi, 'for example'],
  [/\bi\.e\./gi, 'that is'],
  [/\bdp\b/g, 'D P'],
  [/\bdfs\b/g, 'D F S'],
  [/\bbfs\b/g, 'B F S'],
  [/\bXOR\b/gi, 'ex-or'],
  [/\bdeque\b/g, 'deck'],
  [/\bheapq\b/g, 'heap Q'],
  [/\bheapify\b/g, 'heapify'],
  [/\blen\b/g, 'length'],
  [/\bidx\b/g, 'index'],
  [/\bstr\b/g, 'string'],
  [/\bnums\b/g, 'nums'],
  [/\bcurr\b/g, 'cur'],
  [/\blo\b/g, 'low'],
  [/\bhi\b(?!")/g, 'high'],
  [/\bk-?th\b/g, 'k-th'],
  [/\b0s\b/g, 'zeros'],
  [/\b1s\b/g, 'ones'],
  [/\b1-D\b/g, 'one-D'],
  [/\b2-D\b/g, 'two-D'],
  [/\b(Sum|Stock|Ways|Rooms|Robber|Paths|Search|List|Number|Window|Jump|Word|Subsets|Combination) II\b/g, '$1 two'],
  [/\bIII\b/g, 'three'],
];

/** Text for the speech engine: symbols and code read aloud the way a person would say them.
 *  The video audit test checks that no symbol a voice would skip or misread survives this. */
export function speakable(s: string): string {
  let t = plain(s)
    .replace(/[−–]/g, '-')
    .replace(/[’′]/g, "'")
    .replace(/…/g, ' to ')
    .replace(/[₀-₄]/g, (c) => SUB[c]);
  // powers: n², 2ⁿ, 2³¹, 2^3
  t = t.replace(/([0-9A-Za-z)])([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿᵏ]+)/g, (_, b: string, p: string) => {
    const e = [...p].map((c) => SUP[c]).join('');
    return `${b}${e === '2' ? ' squared' : e === '3' ? ' cubed' : ` to the ${e}`}`;
  });
  t = t.replace(/\b(\d+|[a-z])\^(\d+|[a-z])\b/g, '$1 to the $2');
  // big-O
  t = t.replace(/\bO\(([^)]*)\)/g, (_, x: string) => `O of ${x}`);
  // indexing: dp[i][j] -> dp of i, j ; nums[0] -> nums of 0
  t = t.replace(/\]\[/g, ', ').replace(/\b([A-Za-z_]\w*)\[([^[\]]+)\]/g, '$1 of $2');
  // calls: max(a, b) -> max of a, b ; path.pop() -> path dot pop
  t = t.replace(/\b([A-Za-z_]\w*)\(\)/g, '$1').replace(/\b(?!O\()([A-Za-z_]\w*)\((?=[^)]*\))/g, '$1 of (');
  for (const [re, to] of WORDS) t = t.replace(re, to);
  t = t
    .replace(/(?<=[\w)])\.(?=[A-Za-z_])/g, ' dot ')
    .replace(/\|([^|]+)\|/g, 'the absolute value of $1')
    .replace(/\((\^|\||&|<<|>>|<<\s*and\s*>>)\)/g, '')
    .replace(/~\(/g, 'not (')
    .replace(/\+=/g, ' plus equals ')
    .replace(/-=/g, ' minus equals ')
    .replace(/\*=/g, ' times equals ')
    .replace(/\^=/g, ' ex-or equals ')
    .replace(/\/\//g, ' integer divided by ')
    .replace(/\*\*/g, ' to the power ')
    .replace(/<<|«/g, ' shifted left by ')
    .replace(/>>|»/g, ' shifted right by ')
    .replace(/→|->/g, ' to ')
    .replace(/←|<-/g, ' from ')
    .replace(/≤|<=/g, ' at most ')
    .replace(/≥|>=/g, ' at least ')
    .replace(/≲/g, ' at most about ')
    .replace(/≠|!=/g, ' not equal to ')
    .replace(/==/g, ' equals ')
    .replace(/</g, ' less than ')
    .replace(/>/g, ' greater than ')
    .replace(/\s\^\s/g, ' ex-or ')
    .replace(/\^/g, ' to the ')
    .replace(/\s?[×·*]\s?/g, ' times ')
    .replace(/-∞/g, 'minus infinity')
    .replace(/∞/g, 'infinity')
    .replace(/(\d)\s?°/g, '$1 degrees')
    .replace(/√/g, 'square root of ')
    .replace(/Δ/g, 'delta ')
    .replace(/α/g, 'alpha ')
    .replace(/↘/g, 'down-right')
    .replace(/↙/g, 'down-left')
    .replace(/#(\d)/g, 'number $1')
    .replace(/@(\d)/g, ' at $1')
    .replace(/"\$"/g, '"dollar"')
    .replace(/#/g, ' hash ')
    .replace(/&/g, ' and ')
    .replace(/\|/g, ' or ')
    .replace(/%/g, ' mod ')
    .replace(/(^|[\s(,[:])-(?=\d|infinity|[a-z]\b)/g, '$1minus ')
    .replace(/\b([a-z])\s?-\s?(\d)\b/g, '$1 minus $2')
    .replace(/(\w)\s?\+\s?(\w)/g, '$1 plus $2')
    .replace(/\s=\s|(?<=[\w)])=(?=[\w(-])/g, ' equals ')
    .replace(/\s-\s/g, ' minus ')
    .replace(/([\w)])\s?\/\s?(?=\d|\()/g, '$1 divided by ')
    .replace(/([a-z])\/([a-z])/gi, '$1 or $2')
    .replace(/\{\}/g, ' an empty map ')
    .replace(/\[\]/g, ' an empty list ')
    .replace(/[[\]{}]/g, ' ')
    .replace(/(\w)_(\w)/g, '$1 $2')
    .replace(/(^|[\s(])_+(?=\w)/g, '$1')
    .replace(/\s+([,.:;?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** File name of the pre-rendered narration for one spoken sentence (public/narration/<key>.webm).
 *  A 53-bit hash of the spoken text, so the same sentence is rendered once and shared by every video. */
export function audioKey(spoken: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < spoken.length; i++) {
    const c = spoken.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Seconds a scene takes to narrate, for duration estimates and silent playback. */
export const sceneSeconds = (s: Scene): number => sentences(s.say).reduce((t, x) => t + 0.8 + x.split(/\s+/).length / 2.6, 0);
export const videoSeconds = (v: Video): number => v.scenes.reduce((t, s) => t + sceneSeconds(s), 0);

function defaultInput(c: ProblemContent): Record<string, unknown> {
  return Object.fromEntries(c.viz.inputs.map((f) => [f.key, f.default]));
}

/** The real trace on the default input, trimmed so a video stays short: steps whose caption repeats are
 *  dropped, and long traces keep the opening steps (where the idea is explained) and the ending. */
export function traceFrames(c: ProblemContent, max: number): { frames: Frame[]; skipped: number; code: string } {
  const code = parseAnchors(c.viz.code).clean;
  let all: Frame[] = [];
  try {
    all = c.viz.run(defaultInput(c)).frames;
  } catch {
    return { frames: [], skipped: 0, code };
  }
  const distinct = all.filter((f, i) => i === 0 || f.caption !== all[i - 1].caption);
  if (distinct.length <= max) return { frames: distinct, skipped: 0, code };
  const tail = Math.min(5, Math.floor(max / 4));
  return { frames: [...distinct.slice(0, max - tail), ...distinct.slice(-tail)], skipped: distinct.length - max, code };
}

function traceScenes(chapter: string, heading: string, c: ProblemContent, max: number): Scene[] {
  const { frames, skipped, code } = traceFrames(c, max);
  const cut = frames.length - Math.min(5, Math.floor(max / 4));
  return frames.map((frame, i) => ({
    kind: 'trace' as const,
    chapter,
    heading,
    frame,
    code,
    step: i + 1,
    total: frames.length,
    say: (skipped && i === cut ? 'The same steps repeat for a while, so we skip ahead to the end. ' : '') + frame.caption,
  }));
}

/** The host's voice: short, upbeat lines around the content, varied per video so they do not repeat. */
const HYPE = {
  open: ["Alright, let's crack this one!", "Ooh, this one's a classic!", "Let's go! This one's fun.", "Okay, here's a good one!", "Ready? Let's solve this together!"],
  pattern: ["Here's the trick!", "Now the secret sauce!", "So what's the move here?", "This is where it clicks!"],
  run: ["Now the fun part. Let's watch it run!", "Time to see it in action!", "Let's step through it, one move at a time!"],
  done: ["And that's it! Nice work.", "Boom! Done.", "And there you have it!", "Done and dusted!"],
  outro: ["You've got this. On to the next one!", "Great job. Keep that momentum going!", "Lock that in, and let's keep going!"],
};
function pick(list: string[], seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const patternLabel = (id: string) => PATTERNS[id]?.label ?? id;

export function conceptVideo(meta: TopicMeta, topic: TopicContent, demo?: { meta: ProblemMeta; content: ProblemContent }): Video {
  const scenes: Scene[] = [];
  const intro = 'The idea';
  scenes.push({ kind: 'title', chapter: intro, heading: meta.title, tag: 'Concept', sub: meta.blurb, say: `Hey! Welcome to ${meta.title}. ${meta.blurb} Once this idea clicks, a whole family of problems gets easy. Let's dive in!` });
  topic.intro.forEach((p, i) => scenes.push({ kind: 'points', chapter: intro, heading: 'The core idea', points: topic.intro.map(plain), active: i, say: p }));

  const spot = 'How to spot it';
  scenes.push({
    kind: 'points',
    chapter: spot,
    heading: 'How to spot it in a question',
    points: topic.checklist.map(plain),
    active: -1,
    say: "Here's the big one for exams! The hard part isn't the code, it's knowing which pattern to use. So look for these signals in the question.",
  });
  topic.checklist.forEach((p, i) => scenes.push({ kind: 'points', chapter: spot, heading: 'How to spot it in a question', points: topic.checklist.map(plain), active: i, say: p }));

  topic.template.forEach((t, i) =>
    scenes.push({
      kind: 'code',
      chapter: 'Templates',
      heading: t.title,
      code: t.code,
      say: `${i === 0 ? 'Here is the template you can reuse. Learn its shape, not the exact names. ' : 'Another template. '}${t.title}.`,
    }),
  );

  if (demo) {
    const ch = `See it work: ${demo.meta.title}`;
    scenes.push({
      kind: 'title',
      chapter: ch,
      heading: demo.meta.title,
      tag: 'Quick demo',
      sub: plain(demo.content.summary),
      say: `Okay, enough theory! Let's watch the pattern work on a real problem: ${demo.meta.title}. ${demo.content.summary}`,
    });
    scenes.push(...traceScenes(ch, demo.meta.title, demo.content, 14));
  }

  const recap = 'Recap';
  scenes.push({
    kind: 'points',
    chapter: recap,
    heading: 'Remember',
    points: [meta.blurb, ...topic.checklist.slice(0, 3).map(plain)],
    active: -1,
    say: `Quick recap! ${meta.blurb} Watch for the signals on the checklist, start from the template, and then adapt it. Up next, we solve every problem in this topic. Let's go!`,
  });
  return { id: 'concept', title: `${meta.title}: the concept`, kind: 'concept', scenes };
}

export function problemVideo(meta: ProblemMeta, c: ProblemContent): Video {
  const scenes: Scene[] = [];
  const code = parseAnchors(c.solution).clean;
  const q = 'The question';
  scenes.push({ kind: 'title', chapter: q, heading: `${meta.n}. ${meta.title}`, tag: meta.difficulty, sub: plain(c.summary), say: `${pick(HYPE.open, meta.id)} Problem ${meta.n}: ${meta.title}. ${c.summary}` });
  const ex = [`Input: ${c.example.input}`, `Output: ${c.example.output}`, ...(c.example.note ? [c.example.note] : [])];
  scenes.push({ kind: 'points', chapter: q, heading: 'Example', points: ex.map(plain), active: -1, say: `For example. ${ex.join('. ')}` });

  const idea = 'The idea';
  const pat = patternLabel(c.pattern.answer);
  scenes.push({ kind: 'title', chapter: idea, heading: pat, tag: 'Pattern', sub: plain(c.pattern.why), say: `${pick(HYPE.pattern, meta.id + 'p')} The pattern is ${pat}. ${c.pattern.why}` });
  const plan = [c.explanation.brute, c.explanation.optimal, c.explanation.insight].map(plain);
  scenes.push({ kind: 'points', chapter: idea, heading: 'From brute force to optimal', points: plan, active: 0, say: c.explanation.brute });
  scenes.push({ kind: 'points', chapter: idea, heading: 'From brute force to optimal', points: plan, active: 1, say: `The better way. ${c.explanation.optimal}` });
  scenes.push({ kind: 'points', chapter: idea, heading: 'From brute force to optimal', points: plan, active: 2, say: `And here's the key insight! ${c.explanation.insight}` });

  const walk = 'The code';
  c.explanation.walkthrough.forEach((w, i) =>
    scenes.push({ kind: 'points', chapter: walk, heading: 'How the code works', points: c.explanation.walkthrough.map(plain), active: i, code, say: i === 0 ? `Now the code. ${w}` : w }),
  );

  const run = traceScenes('Watch it run', meta.title, c, 24);
  if (run[0]) run[0].say = `${pick(HYPE.run, meta.id + 'r')} ${run[0].say}`;
  const last = run.at(-1);
  if (last) last.say = `${last.say} ${pick(HYPE.done, meta.id + 'd')}`;
  scenes.push(...run);

  const fin = 'Complexity and edge cases';
  const cx = [`Time: ${c.complexity.time.big}. ${c.complexity.time.why}`, `Space: ${c.complexity.space.big}. ${c.complexity.space.why}`].map(plain);
  scenes.push({ kind: 'points', chapter: fin, heading: 'Complexity', points: cx, active: -1, say: `Complexity. Time is ${c.complexity.time.big}. ${c.complexity.time.why} Space is ${c.complexity.space.big}. ${c.complexity.space.why}` });
  scenes.push({ kind: 'points', chapter: fin, heading: 'Edge cases to test', points: c.explanation.edgeCases.map(plain), active: -1, say: `Before you submit, check these edge cases. ${c.explanation.edgeCases.join(' ')}` });
  scenes.push({ kind: 'code', chapter: fin, heading: 'Final solution', code, say: `Here is the full solution once more. If you remember one line, make it this: ${c.explanation.insight} ${pick(HYPE.outro, meta.id + 'o')}` });
  return { id: meta.id, title: `${meta.n}. ${meta.title}`, kind: 'problem', scenes };
}
