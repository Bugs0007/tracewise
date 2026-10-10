// Pure merge of two saves (this device and the cloud copy). It is a join: every field combines in a way that
// never loses progress, so syncing in any order, from any number of devices, converges on the same result.
// Known limit: because progress only ever grows under a merge, deleting something on one device (a retired
// review item, a reset) is not propagated. Reset therefore also deletes the cloud copy (see account.ts).
import { DEFAULT_SETTINGS, freshSave, type InterviewRecord, type ReviewItem, type SaveData, type UnitProgress } from '@/store/save';

const earliest = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : a ?? b);
const latest = (a?: string, b?: string) => (a && b ? (a > b ? a : b) : a ?? b);

function mergeUnit(a: UnitProgress, b: UnitProgress): UnitProgress {
  // the side that got further on the typing ladder owns ladder/fails; steps are a union
  const lead = b.bestLevel > a.bestLevel || (b.bestLevel === a.bestLevel && b.ladder > a.ladder) ? b : a;
  const out: UnitProgress = {
    steps: { ...a.steps, ...b.steps },
    ladder: lead.ladder,
    ladderFails: lead.ladderFails,
    bestLevel: Math.max(a.bestLevel, b.bestLevel),
    hintsUsed: Math.max(a.hintsUsed, b.hintsUsed),
  };
  const done = earliest(a.completedAt, b.completedAt);
  const seen = latest(a.lastSeen, b.lastSeen);
  if (done) out.completedAt = done;
  if (seen) out.lastSeen = seen;
  return out;
}

function mergeReview(a: ReviewItem, b: ReviewItem): ReviewItem {
  // the item that was reviewed more recently has the later due date; ties keep the one with more lapses
  if (a.due !== b.due) return a.due > b.due ? a : b;
  return b.lapses > a.lapses ? b : a;
}

function mergeStreak(a: SaveData['streak'], b: SaveData['streak']): SaveData['streak'] {
  const lead = (a.lastDay ?? '') !== (b.lastDay ?? '') ? ((a.lastDay ?? '') > (b.lastDay ?? '') ? a : b) : b.count > a.count ? b : a;
  return { count: lead.count, lastDay: lead.lastDay, best: Math.max(a.best, b.best, lead.count) };
}

export function isDefaultSettings(s: SaveData['settings']): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).every((k) => s[k] === DEFAULT_SETTINGS[k]);
}

/** Combine this device's save (`local`) with the cloud copy (`remote`). Neither argument is mutated. */
export function mergeSaves(local: SaveData, remote: SaveData): SaveData {
  const units: SaveData['units'] = { ...remote.units };
  for (const [id, u] of Object.entries(local.units)) units[id] = remote.units[id] ? mergeUnit(u, remote.units[id]) : u;

  const review: SaveData['review'] = { ...remote.review };
  for (const [k, r] of Object.entries(local.review)) review[k] = remote.review[k] ? mergeReview(r, remote.review[k]) : r;

  const daily: SaveData['daily'] = { ...remote.daily };
  for (const [d, xp] of Object.entries(local.daily)) daily[d] = Math.max(xp, remote.daily[d] ?? 0);

  const capstone: SaveData['capstone'] = { ...remote.capstone };
  for (const [id, c] of Object.entries(local.capstone)) {
    const r = remote.capstone[id];
    if (!r) {
      capstone[id] = c;
      continue;
    }
    const lead = r.milestone > c.milestone ? r : c;
    const done = earliest(c.done, r.done);
    capstone[id] = { ...lead, ...(done ? { done } : {}) };
  }

  const seen = new Set<string>();
  const interviews: InterviewRecord[] = [...remote.interviews, ...local.interviews]
    .filter((i) => i && typeof i.at === 'string' && !seen.has(i.at) && (seen.add(i.at), true))
    .sort((x, y) => (x.at < y.at ? -1 : 1))
    .slice(-50);

  return {
    schema: local.schema,
    createdAt: earliest(local.createdAt, remote.createdAt) ?? freshSave().createdAt,
    xp: Math.max(local.xp, remote.xp),
    streak: mergeStreak(local.streak, remote.streak),
    daily,
    units,
    review,
    drafts: { ...remote.drafts, ...local.drafts },
    badges: [...new Set([...remote.badges, ...local.badges])],
    interviews,
    gym: { bestWpm: Math.max(local.gym.bestWpm, remote.gym.bestWpm), sessions: Math.max(local.gym.sessions, remote.gym.sessions) },
    capstone,
    // settings are per device; a brand-new device (still on defaults) adopts the cloud copy's
    settings: isDefaultSettings(local.settings) ? remote.settings : local.settings,
  };
}

/** JSON with sorted keys, so two saves can be compared regardless of key order. */
export function stable(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
}
