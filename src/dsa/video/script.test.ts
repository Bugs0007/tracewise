import { describe, expect, it } from 'vitest';
import { PROBLEMS, TOPICS, problemsOf } from '../catalog';
import { loadProblem, loadTopic } from '../loader';
import { conceptVideo, problemVideo, sentences, speakable, videoSeconds } from './script';

describe('videos', () => {
  it('reads symbols aloud', () => {
    expect(speakable('need = target - x → O(n²)')).toBe('need equals target minus x to O of n squared');
    expect(sentences('One. Two: three. **Four**.')).toEqual(['One.', 'Two: three.', 'Four.']);
  });

  it('every topic has a concept video with a demo', async () => {
    for (const t of TOPICS) {
      const c = await loadTopic(t.id);
      const first = problemsOf(t.id)[0];
      const v = conceptVideo(t, c!, { meta: first, content: (await loadProblem(first.id))! });
      expect(v.scenes.some((s) => s.kind === 'trace'), t.id).toBe(true);
      expect(videoSeconds(v), t.id).toBeLessThan(15 * 60);
    }
  });

  it('every problem has a short video that includes its trace', async () => {
    for (const p of PROBLEMS) {
      const v = problemVideo(p, (await loadProblem(p.id))!);
      expect(v.scenes.filter((s) => s.kind === 'trace').length, p.id).toBeGreaterThan(0);
      expect(v.scenes.every((s) => sentences(s.say).length > 0), p.id).toBe(true);
      expect(videoSeconds(v), p.id).toBeLessThan(12 * 60);
    }
  }, 60_000);
});
