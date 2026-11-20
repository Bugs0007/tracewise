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

describe('pronunciation', () => {
  it('reads code and maths the way a person says them', () => {
    const cases: [string, string][] = [
      ['nums[i] − 1', 'nums of i minus 1'],
      ['dp[i][j] = dp[i-1][j]', 'D P of i, j equals D P of i minus 1, j'],
      ['max(best, right - left + 1)', 'max of (best, right minus left plus 1)'],
      ['curr.next', 'cur dot next'],
      ['O(n²) and O(2ⁿ)', 'O of n squared and O of 2 to the n'],
      ['x ^ x equals 0', 'x ex-or x equals 0'],
      ['2^3 subsets', '2 to the 3 subsets'],
      ['prefix *= nums[0]', 'prefix times equals nums of 0'],
      ['7 < 19', '7 less than 19'],
      ['|0 − 0| at most 1', 'the absolute value of 0 minus 0 at most 1'],
      ['−∞', 'minus infinity'],
      ['the deque and dfs(2)', 'the deck and D F S of (2)'],
      ['yes/no', 'yes or no'],
    ];
    for (const [a, b] of cases) expect(speakable(a), a).toBe(b);
  });

  it('leaves no symbol a voice would skip or misread, in any video', async () => {
    const bad = /[−–×·^*∞°√Δα↘↙#@~|&<>=[\]{}⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀-₄_]|\b(dp|dfs|bfs|deque|len)\b|[A-Za-z_)]\.[A-Za-z]|\w\(/;
    const found: string[] = [];
    const check = (v: ReturnType<typeof problemVideo>) => v.scenes.forEach((s) => sentences(s.say).forEach((x) => bad.test(speakable(x)) && found.push(speakable(x))));
    for (const t of TOPICS) {
      const f = problemsOf(t.id)[0];
      check(conceptVideo(t, (await loadTopic(t.id))!, { meta: f, content: (await loadProblem(f.id))! }));
    }
    for (const p of PROBLEMS) check(problemVideo(p, (await loadProblem(p.id))!));
    expect(found.slice(0, 15)).toEqual([]);
  }, 60_000);
});
