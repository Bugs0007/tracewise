// Versioned save format. Everything a learner owns lives here, in the browser.
// Bump SCHEMA_VERSION and add a step to MIGRATIONS whenever the shape changes.
import type { LadderLevel } from '@/content/ladder';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'tracewise:save';

export type StepId = 'predict' | 'watch' | 'type' | 'debug' | 'boss';
export const STEP_ORDER: StepId[] = ['predict', 'watch', 'type', 'debug', 'boss'];

export interface UnitProgress {
  steps: Partial<Record<StepId, boolean>>;
  ladder: LadderLevel;
  ladderFails: number;
  bestLevel: number;
  hintsUsed: number;
  completedAt?: string;
  lastSeen?: string;
}

export type ReviewKind = 'predict' | 'practice' | 'debug' | 'boss';

export interface ReviewItem {
  key: string;
  unitId: string;
  kind: ReviewKind;
  /** Leitner box 0..6 */
  box: number;
  due: string;
  lapses: number;
}

export interface InterviewRecord {
  at: string;
  modules: string[];
  score: number;
  total: number;
  seconds: number;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  motion: 'system' | 'reduced' | 'full';
  sound: boolean;
  focus: boolean;
  speed: number;
  fontSize: number;
}

export interface SaveData {
  schema: number;
  createdAt: string;
  xp: number;
  streak: { count: number; best: number; lastDay: string | null };
  /** day (YYYY-MM-DD) -> xp earned */
  daily: Record<string, number>;
  units: Record<string, UnitProgress>;
  review: Record<string, ReviewItem>;
  /** code drafts keyed by task */
  drafts: Record<string, string>;
  badges: string[];
  interviews: InterviewRecord[];
  gym: { bestWpm: number; sessions: number };
  capstone: Record<string, { milestone: number; backend: string; frontend: string; done?: string }>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', motion: 'system', sound: false, focus: false, speed: 1, fontSize: 14 };

export function freshSave(): SaveData {
  return {
    schema: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    xp: 0,
    streak: { count: 0, best: 0, lastDay: null },
    daily: {},
    units: {},
    review: {},
    drafts: {},
    badges: [],
    interviews: [],
    gym: { bestWpm: 0, sessions: 0 },
    capstone: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Each migration takes data at version N and returns version N+1. */
const MIGRATIONS: Record<number, (d: any) => any> = {
  // v0 = pre-release format without a schema field: {xp, progress}
  0: (d) => ({ ...freshSave(), xp: Number(d.xp) || 0, units: d.progress ?? d.units ?? {}, schema: 1 }),
};

export class SaveError extends Error {}

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SaveError('Not a save file');
  let d: any = raw;
  let v = typeof d.schema === 'number' ? d.schema : 0;
  if (v > SCHEMA_VERSION) throw new SaveError(`This file is from a newer version (schema ${v}). Update the app first.`);
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(`No migration from schema ${v}`);
    d = step(d);
    v = d.schema;
  }
  return sanitize(d);
}

/** Fill missing fields with defaults and drop wrong types, so partial/old data never crashes the app. */
function sanitize(d: any): SaveData {
  const f = freshSave();
  const obj = (x: unknown, fb: any) => (x && typeof x === 'object' && !Array.isArray(x) ? x : fb);
  const num = (x: unknown, fb: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fb);
  return {
    schema: SCHEMA_VERSION,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : f.createdAt,
    xp: Math.max(0, num(d.xp, 0)),
    streak: { ...f.streak, ...obj(d.streak, {}) },
    daily: obj(d.daily, {}),
    units: obj(d.units, {}),
    review: obj(d.review, {}),
    drafts: obj(d.drafts, {}),
    badges: Array.isArray(d.badges) ? d.badges.filter((b: unknown) => typeof b === 'string') : [],
    interviews: Array.isArray(d.interviews) ? d.interviews : [],
    gym: { ...f.gym, ...obj(d.gym, {}) },
    capstone: obj(d.capstone, {}),
    settings: { ...DEFAULT_SETTINGS, ...obj(d.settings, {}) },
  };
}

export function loadSave(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): SaveData {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : freshSave();
  } catch {
    return freshSave();
  }
}

export function exportSave(d: SaveData): string {
  return JSON.stringify({ app: 'tracewise', exportedAt: new Date().toISOString(), ...d }, null, 2);
}

export function importSave(text: string): SaveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('That file is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SaveError('That file is not a Tracewise export');
  const { app: _app, exportedAt: _e, ...rest } = parsed as any;
  if (!('schema' in rest) && !('xp' in rest)) throw new SaveError('That file is not a Tracewise export');
  return migrate(rest);
}

// ─── time helpers (local calendar days) ───

export function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dayKey(dt);
}

// ─── XP & levels ───

/** Total XP needed to reach `level` (level 1 = 0 XP). Gentle quadratic curve. */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelInfo(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, span: xpForLevel(level + 1) - base };
}

export const LEITNER_DAYS = [0, 1, 2, 4, 7, 15, 30];

export function scheduleReview(item: ReviewItem | undefined, unitId: string, kind: ReviewKind, success: boolean, today = dayKey()): ReviewItem {
  const key = `${unitId}:${kind}`;
  const cur = item ?? { key, unitId, kind, box: 0, due: today, lapses: 0 };
  if (success) {
    const box = Math.min(cur.box + 1, LEITNER_DAYS.length - 1);
    return { ...cur, box, due: addDays(today, LEITNER_DAYS[box]) };
  }
  return { ...cur, box: 0, due: addDays(today, 1), lapses: cur.lapses + (item ? 1 : 0) };
}
