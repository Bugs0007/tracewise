import { describe, expect, it } from 'vitest';
import { parseBoard, scoreRow, weekStartUtc, weeklyXp } from './leaderboard';

describe('leaderboard helpers', () => {
  it('finds the Monday of the week in UTC', () => {
    expect(weekStartUtc(new Date('2026-10-11T12:00:00Z'))).toBe('2026-10-05'); // a Sunday
    expect(weekStartUtc(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05'); // the Monday itself
    expect(weekStartUtc(new Date('2026-10-07T23:59:59Z'))).toBe('2026-10-05');
    expect(weekStartUtc(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12-29'); // across a year boundary
  });

  it('sums only this week\'s XP', () => {
    const daily = { '2026-10-04': 50, '2026-10-05': 20, '2026-10-09': 30 };
    expect(weeklyXp(daily, new Date('2026-10-11T08:00:00Z'))).toBe(50);
    expect(weeklyXp({}, new Date('2026-10-11T08:00:00Z'))).toBe(0);
  });

  it('shares only a level, XP totals and the week, never anything personal', () => {
    const row = scoreRow({ xp: 350, daily: { '2026-10-06': 40 } }, new Date('2026-10-11T00:00:00Z'));
    expect(row).toEqual({ level: 3, xp: 350, week_start: '2026-10-05', week_xp: 40 });
    expect(Object.keys(row).sort()).toEqual(['level', 'week_start', 'week_xp', 'xp']);
  });

  it('ignores malformed rows from the server', () => {
    expect(parseBoard([{ rank: 1, level: 7, is_me: true }, { rank: 'x', level: 3 }, { rank: 2, level: 0 }, null])).toEqual([{ rank: 1, level: 7, isMe: true }]);
    expect(parseBoard('nope')).toEqual([]);
  });
});
