// Lists every sentence the videos speak, with its audio file key, for scripts/narrate.py to render.
// Run with: npm run narration   (exports, then renders only the files that are missing)
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { PROBLEMS, TOPICS, problemsOf } from '../src/dsa/catalog';
import { loadProblem, loadTopic } from '../src/dsa/loader';
import { audioKey, conceptVideo, problemVideo, sentences, speakable, type Video } from '../src/dsa/video/script';

it('writes scripts/.narration.json', async () => {
  const lines = new Map<string, string>();
  const add = (v: Video) => v.scenes.forEach((s) => sentences(s.say).forEach((x) => lines.set(audioKey(speakable(x)), speakable(x))));
  for (const t of TOPICS) {
    const first = problemsOf(t.id)[0];
    add(conceptVideo(t, (await loadTopic(t.id))!, { meta: first, content: (await loadProblem(first.id))! }));
  }
  for (const p of PROBLEMS) add(problemVideo(p, (await loadProblem(p.id))!));
  writeFileSync('scripts/.narration.json', JSON.stringify([...lines].map(([key, text]) => ({ key, text }))));
}, 120_000);
