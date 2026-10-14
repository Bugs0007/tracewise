// The decision-step helpers: decision card, role tones, value-range number line.
import { describe, expect, it } from 'vitest';
import { checkPanel } from './check';
import { chain, decisionView, isEmpty, roleTones, spanText, valueRangeView } from './decision';
import { TraceRecorder } from './trace';

describe('decision step', () => {
  it('chain fills the values into a comparison', () => {
    expect(chain([3, 18, 12], ['<', '≤'])).toBe('3 < 18 ≤ 12');
    expect(chain([15, 3], ['≤'])).toBe('15 ≤ 3');
    expect(() => chain([1, 2, 3], ['<'])).toThrow();
  });

  it('decisionView is a well-formed panel, and the checker rejects an undecided keep/discard', () => {
    const ok = decisionView({ title: 'Is it inside?', condition: 'a < t', expr: '1 < 2', values: [{ label: 'a', value: 1 }], result: false, verdict: 'No.', keep: 'left', discard: 'right' });
    expect(checkPanel(ok)).toEqual([]);
    expect(checkPanel(decisionView({ ...ok, result: null }))).toContain('decision: keep/discard before the test has a result');
    expect(checkPanel(decisionView({ ...ok, verdict: undefined }))).toContain('decision: a decided step needs a verdict or an answer');
    expect(checkPanel(decisionView({ ...ok, values: [] }))).toContain('decision: no values being compared');
  });

  it('roleTones: a ruler, a kept side and a discarded side never share a tone', () => {
    const t = roleTones(7, { window: [1, 6], ruler: [3, 6], compared: [3, 6], keep: [1, 2], discard: [3, 6] });
    expect(t[0]).toBe('muted');
    expect(t[1]).toBe('keep');
    expect(t[3]).toBe('compare');
    const rulerOnly = roleTones(7, { ruler: [3, 6], compared: [3] });
    expect(rulerOnly[3]).toBe('compare');
    expect(rulerOnly[4]).toBe('ruler');
    const roles = roleTones(7, { ruler: [0, 1], keep: [2, 3], discard: [4, 5] });
    expect([roles[0], roles[2], roles[4]]).toEqual(['ruler', 'keep', 'discard']);
  });

  it('roleTones skips empty spans and clamps to the array', () => {
    expect(roleTones(3, { keep: [2, 1] })).toEqual({});
    expect(Object.keys(roleTones(3, { discard: [-2, 9] }))).toEqual(['0', '1', '2']);
    expect(isEmpty([4, 3])).toBe(true);
    expect(spanText([4, 3], [1, 2, 3])).toContain('nothing');
    expect(spanText([0, 1], [9, 8, 7])).toBe('indices 0..1 (values 9, 8)');
  });

  it('valueRangeView keeps the target on the axis, outside the bar when it does not fit', () => {
    const p = valueRangeView({ range: [3, 12], target: 18, inside: false });
    expect(checkPanel(p)).toEqual([]);
    expect(p.max!).toBeGreaterThanOrEqual(18);
    expect(p.items[0]).toMatchObject({ start: 3, end: 12, tone: 'ruler' });
    expect(p.marks![0]).toMatchObject({ at: 18, tone: 'compare' });
    expect(p.marks![0].label).toContain('outside');
    expect(valueRangeView({ range: [3, 12], target: 9, inside: true }).marks![0]).toMatchObject({ at: 9, tone: 'keep' });
    expect(valueRangeView({ range: [3, 12], target: 9, inside: null }).marks![0].tone).toBe('active');
  });

  it('predict wrong-answer notes ride along with the checkpoint', () => {
    const r = new TraceRecorder('x = 1  #@a');
    r.step('a', 'one', [{ type: 'note', text: 'n' }]);
    r.predict('q', 'Which?', ['A', 'B'], 1, 'because', ['A is wrong for this reason', undefined]);
    expect(r.frames[0].predict?.wrongNotes).toEqual(['A is wrong for this reason', undefined]);
    const r2 = new TraceRecorder('x = 1  #@a');
    r2.step('a', 'one', [{ type: 'note', text: 'n' }]);
    r2.predict('q', 'Which?', ['A', 'B'], 1, 'because');
    expect(r2.frames[0].predict?.wrongNotes).toBeUndefined();
  });
});
