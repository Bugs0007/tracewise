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

/** Text for the speech engine: symbols and code read aloud the way a person would say them. */
export function speakable(s: string): string {
  return plain(s)
    .replace(/O\(([^)]*)\)/g, (_, x: string) => `O of ${x.replace(/\^2|²/g, ' squared').replace(/\*/g, ' times ')}`)
    .replace(/→|->/g, ' to ')
    .replace(/←|<-/g, ' from ')
    .replace(/≤|<=/g, ' at most ')
    .replace(/≥|>=/g, ' at least ')
    .replace(/≠|!=/g, ' not equal to ')
    .replace(/==/g, ' equals ')
    .replace(/²/g, ' squared')
    .replace(/\s=\s/g, ' equals ')
    .replace(/\s-\s/g, ' minus ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s\*\s/g, ' times ')
    .replace(/\s\/\/\s/g, ' integer divided by ')
    .replace(/\s%\s/g, ' mod ')
    .replace(/\[\]/g, ' an empty list ')
    .replace(/(\w)_(\w)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
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

const patternLabel = (id: string) => PATTERNS[id]?.label ?? id;

export function conceptVideo(meta: TopicMeta, topic: TopicContent, demo?: { meta: ProblemMeta; content: ProblemContent }): Video {
  const scenes: Scene[] = [];
  const intro = 'The idea';
  scenes.push({ kind: 'title', chapter: intro, heading: meta.title, tag: 'Concept', sub: meta.blurb, say: `${meta.title}. ${meta.blurb}` });
  topic.intro.forEach((p, i) => scenes.push({ kind: 'points', chapter: intro, heading: 'The core idea', points: topic.intro.map(plain), active: i, say: p }));

  const spot = 'How to spot it';
  scenes.push({
    kind: 'points',
    chapter: spot,
    heading: 'How to spot it in a question',
    points: topic.checklist.map(plain),
    active: -1,
    say: 'In an exam, the hard part is to know which pattern to use. Look for these signals in the question.',
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
      say: `Now let us watch the pattern work on a real problem: ${demo.meta.title}. ${demo.content.summary}`,
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
    say: `To recap. ${meta.blurb} Watch for the signals on the checklist, start from the template, and then adapt it. The next videos solve every problem in this topic.`,
  });
  return { id: 'concept', title: `${meta.title}: the concept`, kind: 'concept', scenes };
}

export function problemVideo(meta: ProblemMeta, c: ProblemContent): Video {
  const scenes: Scene[] = [];
  const code = parseAnchors(c.solution).clean;
  const q = 'The question';
  scenes.push({ kind: 'title', chapter: q, heading: `${meta.n}. ${meta.title}`, tag: meta.difficulty, sub: plain(c.summary), say: `Problem ${meta.n}: ${meta.title}. ${c.summary}` });
  const ex = [`Input: ${c.example.input}`, `Output: ${c.example.output}`, ...(c.example.note ? [c.example.note] : [])];
  scenes.push({ kind: 'points', chapter: q, heading: 'Example', points: ex.map(plain), active: -1, say: `For example. ${ex.join('. ')}` });

  const idea = 'The idea';
  const pat = patternLabel(c.pattern.answer);
  scenes.push({ kind: 'title', chapter: idea, heading: pat, tag: 'Pattern', sub: plain(c.pattern.why), say: `The pattern is ${pat}. ${c.pattern.why}` });
  const plan = [c.explanation.brute, c.explanation.optimal, c.explanation.insight].map(plain);
  scenes.push({ kind: 'points', chapter: idea, heading: 'From brute force to optimal', points: plan, active: 0, say: c.explanation.brute });
  scenes.push({ kind: 'points', chapter: idea, heading: 'From brute force to optimal', points: plan, active: 1, say: `The better way. ${c.explanation.optimal}` });
  scenes.push({ kind: 'points', chapter: idea, heading: 'From brute force to optimal', points: plan, active: 2, say: `The key insight. ${c.explanation.insight}` });

  const walk = 'The code';
  c.explanation.walkthrough.forEach((w, i) =>
    scenes.push({ kind: 'points', chapter: walk, heading: 'How the code works', points: c.explanation.walkthrough.map(plain), active: i, code, say: i === 0 ? `Now the code. ${w}` : w }),
  );

  scenes.push(...traceScenes('Watch it run', meta.title, c, 24));

  const fin = 'Complexity and edge cases';
  const cx = [`Time: ${c.complexity.time.big}. ${c.complexity.time.why}`, `Space: ${c.complexity.space.big}. ${c.complexity.space.why}`].map(plain);
  scenes.push({ kind: 'points', chapter: fin, heading: 'Complexity', points: cx, active: -1, say: `Complexity. Time is ${c.complexity.time.big}. ${c.complexity.time.why} Space is ${c.complexity.space.big}. ${c.complexity.space.why}` });
  scenes.push({ kind: 'points', chapter: fin, heading: 'Edge cases to test', points: c.explanation.edgeCases.map(plain), active: -1, say: `Before you submit, check these edge cases. ${c.explanation.edgeCases.join(' ')}` });
  scenes.push({ kind: 'code', chapter: fin, heading: 'Final solution', code, say: `Here is the full solution once more. Remember the one line: ${c.explanation.insight}` });
  return { id: meta.id, title: `${meta.n}. ${meta.title}`, kind: 'problem', scenes };
}
