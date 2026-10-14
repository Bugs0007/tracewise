// Visualizers that draw their decisions (rotated search, find-minimum, container, trapping rain water, median).
// The point of these traces: the test, its values and the keep/discard choice are on screen, not only the pointer move.
import { describe, expect, it } from 'vitest';
import type { DecisionPanel, Frame } from '@/engine/types';
import { parseAnchors } from '@/engine/recorder';
import rotated from './problems/binary-search/search-in-rotated-sorted-array';
import findMin from './problems/binary-search/find-minimum-in-rotated-sorted-array';
import container from './problems/two-pointers/container-with-most-water';
import rain from './problems/two-pointers/trapping-rain-water';
import median from './problems/binary-search/median-of-two-sorted-arrays';
import { checkFrame } from './viz/check';

const decisions = (f: Frame): DecisionPanel[] => f.panels.filter((p): p is DecisionPanel => p.type === 'decision');
const arrayTones = (f: Frame) => (f.panels.find((p) => p.type === 'array') as { tones?: Record<number, string> } | undefined)?.tones ?? {};

/** deterministic pseudo-random */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function rotatedArray(rand: () => number): number[] {
  const n = 1 + Math.floor(rand() * 10);
  const set = new Set<number>();
  while (set.size < n) set.add(Math.floor(rand() * 60));
  const sorted = [...set].sort((a, b) => a - b);
  const k = Math.floor(rand() * n);
  return [...sorted.slice(k), ...sorted.slice(0, k)];
}

describe('rotated search shows its decisions', () => {
  const viz = rotated.viz;
  const lines = parseAnchors(viz.code).clean.split('\n').length;
  const nums = [15, 18, 22, 3, 6, 9, 12];

  it('target 18: the sorted right half is only the ruler, and the unsorted left half is kept', () => {
    const { frames, result } = viz.run({ nums, target: 18 });
    expect(result).toBe(1);
    const [a, b, c] = frames.filter((f) => decisions(f).length).slice(0, 3);
    // A: which half is sorted
    expect(decisions(a)[0]).toMatchObject({ condition: 'nums[lo] <= nums[mid]', result: false });
    expect(arrayTones(a)[4]).toBe('ruler');
    // B: the range test fails and the number line shows 18 outside 3..12
    expect(decisions(b)[0]).toMatchObject({ condition: 'nums[mid] < target <= nums[hi]', expr: '3 < 18 ≤ 12', result: false });
    const line = b.panels.find((p) => p.type === 'intervals') as { items: { start: number; end: number }[]; marks: { at: number; tone?: string }[] };
    expect(line.items[0]).toMatchObject({ start: 3, end: 12 });
    expect(line.marks[0]).toMatchObject({ at: 18, tone: 'compare' });
    expect(b.vars).toMatchObject({ leftSorted: false, targetInSortedRange: false });
    // C: keep the left side, discard the sorted side; nothing is both a ruler and kept
    const tones = arrayTones(c);
    expect([0, 1, 2].map((i) => tones[i])).toEqual(['keep', 'keep', 'keep']);
    expect([3, 4, 5, 6].map((i) => tones[i])).toEqual(['discard', 'discard', 'discard', 'discard']);
    expect(Object.values(tones)).not.toContain('ruler');
    expect(decisions(c)[0].verdict).toContain("can't be in the sorted half. Discard it, keep the left");
  });

  it('target 9: the target is inside the sorted half, which is then kept', () => {
    const { frames } = viz.run({ nums, target: 9 });
    const [, b, c] = frames.filter((f) => decisions(f).length);
    expect(decisions(b)[0]).toMatchObject({ expr: '3 < 9 ≤ 12', result: true });
    expect([4, 5, 6].map((i) => arrayTones(c)[i])).toEqual(['keep', 'keep', 'keep']);
    expect(decisions(c)[0].verdict).toContain('Keep it, discard the left');
  });

  it('asks the range question first, then which side to keep, with a note for each wrong pick', () => {
    const { frames } = viz.run({ nums, target: 18 });
    const cps = frames.filter((f) => f.predict).map((f) => f.predict!);
    expect(cps.map((c) => c.question)).toEqual(['nums[lo] = 15, nums[mid] = 3. Which half is sorted?', 'The sorted half (the ruler) spans 3..12. Is the target 18 inside that range?', 'The test failed. Which side do we keep?']);
    expect(cps[1].wrongNotes?.[0]).toContain('unsorted side is kept by default');
    expect(cps[2].wrongNotes?.[0]).toContain('even though it is the messy one');
  });

  it('every trace is well formed, correct, and never paints a cell as both ruler and kept', () => {
    const rand = rng(7);
    for (let n = 0; n < 150; n++) {
      const a = rotatedArray(rand);
      const target = rand() < 0.5 ? a[Math.floor(rand() * a.length)] : Math.floor(rand() * 70);
      const res = viz.run({ nums: a, target });
      expect(res.result, `${a} / ${target}`).toBe(a.indexOf(target));
      res.frames.forEach((f, i) => {
        expect(checkFrame(f, lines, `${a} / ${target} frame ${i}`)).toEqual([]);
        const roles = new Set(Object.values(arrayTones(f)));
        expect(roles.has('ruler') && roles.has('keep'), `${a} / ${target} frame ${i}: ruler and keep together`).toBe(false);
      });
      // each turn that does not find the target decides twice, then applies (three decision frames)
      const dec = res.frames.filter((f) => decisions(f).length).length;
      expect(dec % 3, `${a} / ${target}`).toBe(0);
    }
  });
});

describe('other visualizers that now draw their decisions', () => {
  it('find-minimum: tests nums[mid] > nums[hi] on its own frame and keeps the side that holds the drop', () => {
    const lines = parseAnchors(findMin.viz.code).clean.split('\n').length;
    const { frames, result } = findMin.viz.run({ nums: [15, 18, 22, 3, 6, 9, 12] });
    expect(result).toBe(3);
    const [test, apply] = frames.filter((f) => decisions(f).length);
    expect(decisions(test)[0]).toMatchObject({ condition: 'nums[mid] > nums[hi]', expr: '3 > 12', result: false });
    // mid (3) is smaller than hi (12): mid..hi is in order, so mid stays and the sorted right is discarded
    expect([0, 1, 2, 3].map((i) => arrayTones(apply)[i])).toEqual(['keep', 'keep', 'keep', 'keep']);
    expect([4, 5, 6].map((i) => arrayTones(apply)[i])).toEqual(['discard', 'discard', 'discard']);
    frames.forEach((f, i) => expect(checkFrame(f, lines, `frame ${i}`)).toEqual([]));
    const rand = rng(11);
    for (let n = 0; n < 100; n++) {
      const a = rotatedArray(rand);
      const res = findMin.viz.run({ nums: a });
      expect(res.result, `${a}`).toBe(Math.min(...a));
      res.frames.forEach((f, i) => expect(checkFrame(f, lines, `${a} frame ${i}`)).toEqual([]));
    }
  });

  it('container: records the #@cmp test, then discards the shorter wall', () => {
    const lines = parseAnchors(container.viz.code).clean.split('\n').length;
    const { frames, result } = container.viz.run({ height: [3, 8, 2, 6, 9, 4, 5] });
    expect(result).toBe(container.viz.reference!({ height: [3, 8, 2, 6, 9, 4, 5] }));
    const cmp = frames.find((f) => decisions(f).length)!;
    expect(decisions(cmp)[0]).toMatchObject({ condition: 'height[lo] < height[hi]', result: true });
    const moved = frames.filter((f) => decisions(f).length)[1];
    expect(Object.values(arrayTones(moved))).toContain('discard');
    frames.forEach((f, i) => expect(checkFrame(f, lines, `frame ${i}`)).toEqual([]));
  });

  it('trapping rain water: says which end is the lid before finishing a side', () => {
    const lines = parseAnchors(rain.viz.code).clean.split('\n').length;
    const { frames, result } = rain.viz.run({ height: [4, 0, 2, 1, 3, 0, 5] });
    expect(result).toBe(rain.viz.reference!({ height: [4, 0, 2, 1, 3, 0, 5] }));
    const cmp = frames.find((f) => decisions(f).length)!;
    expect(decisions(cmp)[0]).toMatchObject({ title: 'Which end is lower?', result: true });
    expect(decisions(cmp)[0].verdict).toContain('lid');
    expect(Object.values(arrayTones(cmp))).toContain('ruler');
    frames.forEach((f, i) => expect(checkFrame(f, lines, `frame ${i}`)).toEqual([]));
  });

  it('median: both cross-checks are shown, then the failing one picks the direction', () => {
    const lines = parseAnchors(median.viz.code).clean.split('\n').length;
    const { frames, result } = median.viz.run({ a: [1, 3, 8, 9, 15], b: [7, 11, 18, 19, 21, 25] });
    expect(result).toBe(11);
    const withTwo = frames.find((f) => decisions(f).length === 2)!;
    expect(decisions(withTwo).map((d) => d.condition)).toEqual(['a_left <= b_right', 'b_left <= a_right']);
    const dir = frames.find((f) => decisions(f).some((d) => d.condition === 'a_left > b_right'))!;
    expect(decisions(dir)[0].verdict).toBeTruthy();
    frames.forEach((f, i) => expect(checkFrame(f, lines, `frame ${i}`)).toEqual([]));
  });
});
