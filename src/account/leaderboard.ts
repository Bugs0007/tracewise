// Pure helpers for the opt-in leaderboard. The board shows a rank and a level, nothing else.
import { levelInfo, type SaveData } from '@/store/save';

export interface BoardRow {
  rank: number;
  level: number;
  isMe: boolean;
}

export type BoardScope = 'all' | 'week';

/** Monday (UTC) of the week containing `now`, as YYYY-MM-DD. Matches date_trunc('week', ...) in the database. */
export function weekStartUtc(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** XP earned from this week's Monday up to now, from the per-day XP log. */
export function weeklyXp(daily: Record<string, number>, now: Date = new Date()): number {
  const start = weekStartUtc(now);
  let sum = 0;
  for (const [day, xp] of Object.entries(daily)) if (day >= start && Number.isFinite(xp)) sum += xp;
  return Math.max(0, Math.round(sum));
}

/** The only fields that leave the device when a player opts in. */
export function scoreRow(data: Pick<SaveData, 'xp' | 'daily'>, now: Date = new Date()) {
  return { level: levelInfo(data.xp).level, xp: Math.max(0, Math.round(data.xp)), week_start: weekStartUtc(now), week_xp: weeklyXp(data.daily, now) };
}

export function parseBoard(rows: unknown): BoardRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ rank: Number((r as any)?.rank), level: Number((r as any)?.level), isMe: (r as any)?.is_me === true }))
    .filter((r) => Number.isInteger(r.rank) && r.rank >= 1 && Number.isInteger(r.level) && r.level >= 1);
}
