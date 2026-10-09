// Shared helpers for the React Hooks / React Performance units (module "frontend").
// Each visualizer simulates its concept with a tiny deterministic model; these helpers keep
// the recorded frames consistent (caption length, hook-slot lists, lane timelines).
import { Recorder } from '@/engine/recorder';
import type { ListPanel, Panel, TimelineEvent, TimelinePanel, Tone } from '@/engine/types';

export const MAX_CAPTION = 90;

/**
 * Recorder that keeps captions within the player's one-line budget.
 * Set CAPCHECK=1 while authoring to make an over-long caption throw instead of being trimmed.
 */
export class HookRecorder extends Recorder {
  override step(at: string | number | undefined, caption: string, panels: Panel[], vars: Record<string, unknown> = {}): void {
    let text = caption;
    if (text.length > MAX_CAPTION) {
      if (typeof process !== 'undefined' && process.env?.CAPCHECK) throw new Error(`Caption is ${text.length} chars (max ${MAX_CAPTION}): ${text}`);
      text = text.slice(0, MAX_CAPTION - 1) + '…';
    }
    super.step(at, text, panels, vars);
  }
}

/** React's dependency comparison: a missing array never matches, otherwise Object.is per item. */
export function sameDeps(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (!a || !b) return false;
  return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
}

/** Short display of a value: strings are quoted, functions collapse to "fn". */
export function show(v: unknown): string {
  if (typeof v === 'string') return `'${v}'`;
  if (typeof v === 'function') return 'fn';
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

export function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

export interface Slot {
  label: string;
  value?: unknown;
  tone?: Tone;
}

/** The hook slot list of one component instance, in call order. */
export function slotsPanel(title: string, slots: Slot[], emptyText = 'no hooks called yet'): ListPanel {
  return {
    type: 'list',
    title,
    orientation: 'vertical',
    startLabel: 'first call',
    items: slots.map((s, i) => ({ label: `#${i} ${s.label}`, sub: s.value === undefined ? undefined : show(s.value), tone: s.tone })),
    emptyText,
  };
}

/** Builds a multi-lane timeline panel incrementally. */
export class LaneTimeline {
  private readonly lanes: { label: string; events: TimelineEvent[] }[];

  constructor(labels: string[]) {
    this.lanes = labels.map((label) => ({ label, events: [] }));
  }

  /** dur omitted = a dot; dur given = a bar */
  add(lane: number, t: number, label: string, tone?: Tone, dur?: number): void {
    const ev: TimelineEvent = { t, label };
    if (tone) ev.tone = tone;
    if (dur !== undefined) ev.dur = dur;
    this.lanes[lane].events.push(ev);
  }

  panel(tMax: number, now?: number, title?: string, unit?: string): TimelinePanel {
    const p: TimelinePanel = { type: 'timeline', lanes: this.lanes.map((l) => ({ label: l.label, events: l.events.map((e) => ({ ...e })) })), tMax: Math.max(1, tMax) };
    if (title) p.title = title;
    if (now !== undefined) p.now = now;
    if (unit) p.unit = unit;
    return p;
  }
}
