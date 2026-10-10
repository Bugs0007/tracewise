import { create } from 'zustand';
import type { LadderLevel } from '@/content/ladder';
import { nextLadderState } from '@/content/ladder';
import { CATALOG } from '@/content/catalog';
import {
  addDays,
  dayKey,
  freshSave,
  levelInfo,
  loadSave,
  scheduleReview,
  STEP_ORDER,
  STORAGE_KEY,
  type DsaProblemProgress,
  type InterviewRecord,
  type ReviewKind,
  type SaveData,
  type Settings,
  type StepId,
  type UnitProgress,
} from './save';
import { playSound } from '@/lib/sound';

export interface Celebration {
  id: number;
  kind: 'xp' | 'level' | 'badge' | 'unit' | 'ladder-up' | 'ladder-down';
  text: string;
  amount?: number;
}

interface Actions {
  awardXp: (amount: number, reason?: string) => void;
  completeStep: (unitId: string, step: StepId, xp: number) => void;
  ladderResult: (unitId: string, passed: boolean, level: LadderLevel) => 'up' | 'down' | null;
  spendHint: (unitId: string, cost: number) => void;
  reviewResult: (unitId: string, kind: ReviewKind, success: boolean) => void;
  saveDraft: (key: string, code: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  addBadge: (id: string, label: string) => void;
  recordInterview: (r: InterviewRecord) => void;
  recordGym: (wpm: number) => void;
  setCapstone: (id: string, patch: Partial<SaveData['capstone'][string]>) => void;
  /** record progress on a NeetCode track problem (counters and flags merge into the stored record) */
  dsaProblem: (slug: string, patch: Partial<DsaProblemProgress>) => void;
  /** "Mark solved" / "Needs review" on a track problem; needs-review also joins the Leitner queue */
  dsaMark: (slug: string, status: 'solved' | 'review' | null) => void;
  dsaBoss: (topic: string, patch: { quizScore?: number; solved?: boolean }) => void;
  replaceAll: (d: SaveData) => void;
  resetAll: () => void;
  dismiss: (id: number) => void;
}

export type AppState = SaveData & Actions & { celebrations: Celebration[] };

let cid = 0;

// Stable default so selectors returning it don't trigger re-render loops.
const EMPTY_PROGRESS: UnitProgress = Object.freeze({ steps: Object.freeze({}), ladder: 1, ladderFails: 0, bestLevel: 0, hintsUsed: 0 }) as UnitProgress;

export function unitProgress(s: SaveData, unitId: string): UnitProgress {
  return s.units[unitId] ?? EMPTY_PROGRESS;
}

function withStreak(s: SaveData, today = dayKey()): SaveData['streak'] {
  const st = s.streak;
  if (st.lastDay === today) return st;
  const count = st.lastDay === addDays(today, -1) ? st.count + 1 : 1;
  return { count, best: Math.max(st.best, count), lastDay: today };
}

const MODULE_BADGES: Record<string, string> = {
  dsa: 'Algorithm Adept',
  backend: 'Backend Builder',
  frontend: 'Frontend Fluent',
  sysdesign: 'Systems Thinker',
  ai: 'AI Engineer',
  cloud: 'Cloud Navigator',
};

export const useApp = create<AppState>((set, get) => {
  const celebrate = (c: Omit<Celebration, 'id'>) => {
    const item = { ...c, id: ++cid };
    set((s) => ({ celebrations: [...s.celebrations.slice(-3), item] }));
    setTimeout(() => get().dismiss(item.id), c.kind === 'level' || c.kind === 'badge' || c.kind === 'unit' ? 3200 : 1600);
  };

  const gain = (s: AppState, amount: number): Partial<SaveData> => {
    const today = dayKey();
    const before = levelInfo(s.xp).level;
    const xp = Math.max(0, s.xp + amount);
    const after = levelInfo(xp).level;
    if (amount > 0) {
      celebrate({ kind: 'xp', text: `+${amount} XP`, amount });
      if (s.settings.sound) playSound('xp');
    }
    if (after > before) {
      setTimeout(() => {
        celebrate({ kind: 'level', text: `Level ${after}!` });
        if (get().settings.sound) playSound('level');
      }, 350);
    }
    return { xp, daily: { ...s.daily, [today]: (s.daily[today] ?? 0) + Math.max(0, amount) }, streak: amount > 0 ? withStreak(s, today) : s.streak };
  };

  return {
    ...loadSave(),
    celebrations: [],

    awardXp: (amount) => set((s) => gain(s, amount)),

    completeStep: (unitId, step, xp) =>
      set((s) => {
        const p = unitProgress(s, unitId);
        if (p.steps[step]) return { units: { ...s.units, [unitId]: { ...p, lastSeen: dayKey() } } };
        const steps = { ...p.steps, [step]: true };
        const complete = STEP_ORDER.every((k) => steps[k]);
        const next: UnitProgress = { ...p, steps, lastSeen: dayKey(), completedAt: complete && !p.completedAt ? new Date().toISOString() : p.completedAt };
        const units = { ...s.units, [unitId]: next };
        const patch: Partial<AppState> = { units, ...gain(s, xp) };
        if (complete && !p.completedAt) {
          setTimeout(() => celebrate({ kind: 'unit', text: 'Unit complete — boss defeated!' }), 500);
          if (s.settings.sound) setTimeout(() => playSound('win'), 500);
          // module badge when every concept in the module is complete
          const mod = CATALOG.find((c) => c.id === unitId)?.module;
          if (mod) {
            const all = CATALOG.filter((c) => c.module === mod).every((c) => units[c.id]?.completedAt);
            if (all) setTimeout(() => get().addBadge(`module:${mod}`, MODULE_BADGES[mod]), 900);
          }
          const done = Object.values(units).filter((u) => u.completedAt).length;
          for (const n of [1, 10, 25, 50, 100]) if (done === n) setTimeout(() => get().addBadge(`units:${n}`, `${n} unit${n > 1 ? 's' : ''} cleared`), 1200);
        }
        return patch;
      }),

    ladderResult: (unitId, passed, level) => {
      const s = get();
      const p = unitProgress(s, unitId);
      // only the learner's current level moves the ladder (replaying lower levels is free practice)
      if (level !== p.ladder) {
        return null;
      }
      const r = nextLadderState(p.ladder, p.ladderFails, passed);
      set({ units: { ...s.units, [unitId]: { ...p, ladder: r.level, ladderFails: r.fails, bestLevel: Math.max(p.bestLevel, passed ? level : 0) } } });
      if (r.changed === 'up') celebrate({ kind: 'ladder-up', text: `Promoted to level ${r.level}` });
      if (r.changed === 'down') celebrate({ kind: 'ladder-down', text: `Back to level ${r.level} — rebuild it` });
      return r.changed;
    },

    spendHint: (unitId, cost) =>
      set((s) => {
        const p = unitProgress(s, unitId);
        return { units: { ...s.units, [unitId]: { ...p, hintsUsed: p.hintsUsed + 1 } }, xp: Math.max(0, s.xp - cost) };
      }),

    reviewResult: (unitId, kind, success) =>
      set((s) => {
        const key = `${unitId}:${kind}`;
        const cur = s.review[key];
        // only failures enter the queue; successes move existing items forward
        if (!cur && success) return {};
        const item = scheduleReview(cur, unitId, kind, success);
        // retire items that have graduated past the last box
        const review = { ...s.review };
        if (success && cur && cur.box >= 5) delete review[key];
        else review[key] = item;
        return { review };
      }),

    saveDraft: (key, code) => set((s) => ({ drafts: { ...s.drafts, [key]: code } })),

    setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

    addBadge: (id, label) =>
      set((s) => {
        if (s.badges.includes(id)) return {};
        celebrate({ kind: 'badge', text: `Badge: ${label}` });
        if (s.settings.sound) playSound('win');
        return { badges: [...s.badges, id] };
      }),

    recordInterview: (r) => set((s) => ({ interviews: [...s.interviews.slice(-49), r] })),

    recordGym: (wpm) => set((s) => ({ gym: { bestWpm: Math.max(s.gym.bestWpm, Math.round(wpm)), sessions: s.gym.sessions + 1 } })),

    setCapstone: (id, patch) =>
      set((s) => {
        const cur = s.capstone[id] ?? { milestone: 0, backend: '', frontend: '' };
        return { capstone: { ...s.capstone, [id]: { ...cur, ...patch } } };
      }),

    dsaProblem: (slug, patch) =>
      set((s) => {
        const cur = s.dsa.problems[slug] ?? { hints: 0, predictRight: 0, predictTotal: 0 };
        return { dsa: { ...s.dsa, problems: { ...s.dsa.problems, [slug]: { ...cur, ...patch, lastSeen: dayKey() } } } };
      }),

    dsaMark: (slug, status) =>
      set((s) => {
        const cur = s.dsa.problems[slug] ?? { hints: 0, predictRight: 0, predictTotal: 0 };
        const next: DsaProblemProgress = { ...cur, lastSeen: dayKey(), at: new Date().toISOString() };
        if (status) next.status = status;
        else delete next.status;
        const key = `dsa:${slug}:problem`;
        const review = { ...s.review };
        // "needs review" joins the queue; solving (or clearing) retires it
        if (status === 'review') review[key] = scheduleReview(review[key], `dsa:${slug}`, 'problem', false);
        else delete review[key];
        const patch: Partial<AppState> = { dsa: { ...s.dsa, problems: { ...s.dsa.problems, [slug]: next } }, review };
        if (status === 'solved' && cur.status !== 'solved') Object.assign(patch, gain(s, 20));
        return patch;
      }),

    dsaBoss: (topic, patch) =>
      set((s) => {
        const cur = s.dsa.bosses[topic] ?? {};
        const next = { ...cur };
        if (patch.quizScore !== undefined) next.quizBest = Math.max(cur.quizBest ?? 0, patch.quizScore);
        if (patch.solved && !cur.solvedAt) next.solvedAt = new Date().toISOString();
        const out: Partial<AppState> = { dsa: { ...s.dsa, bosses: { ...s.dsa.bosses, [topic]: next } } };
        if (patch.solved && !cur.solvedAt) Object.assign(out, gain(s, 40));
        return out;
      }),

    replaceAll: (d) => set({ ...d }),

    resetAll: () => set({ ...freshSave() }),

    dismiss: (id) => set((s) => ({ celebrations: s.celebrations.filter((c) => c.id !== id) })),
  };
});

// ─── persistence ───
let timer: ReturnType<typeof setTimeout> | null = null;
export function persistNow(): void {
  const s = useApp.getState();
  const data: SaveData = {
    schema: s.schema,
    createdAt: s.createdAt,
    xp: s.xp,
    streak: s.streak,
    daily: s.daily,
    units: s.units,
    review: s.review,
    drafts: s.drafts,
    badges: s.badges,
    interviews: s.interviews,
    gym: s.gym,
    capstone: s.capstone,
    dsa: s.dsa,
    settings: s.settings,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

if (typeof window !== 'undefined') {
  useApp.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(persistNow, 250);
  });
  window.addEventListener('beforeunload', persistNow);
}

export function snapshot(): SaveData {
  const { celebrations: _c, ...rest } = useApp.getState();
  const data: any = {};
  for (const [k, v] of Object.entries(rest)) if (typeof v !== 'function') data[k] = v;
  return data as SaveData;
}

export function dueReviews(s: SaveData, today = dayKey()) {
  return Object.values(s.review)
    .filter((r) => r.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
}
