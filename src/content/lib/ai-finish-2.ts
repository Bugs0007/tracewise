// Shared helpers for the "agents (loop, multi, memory, guardrails) and production LLM apps" units:
// timeline / chart panel builders, a score helper and the hidden Python harnesses
// (scripted agent runs, a flaky structured-output model, a danger-logging tool set).
import type { ChartPanel, Tone, TimelinePanel } from '@/engine/types';

export { tokenize } from '@/content/lib/ai-llm-rag-1';
export type { FlowDef } from '@/content/lib/ai-mcp-agents';
export { AGENT_HARNESS, MOCK_NOTE, Seq, cap, flowGraph, kvPanel, logPanel, r2, r4, short, step, words, jaccard } from '@/content/lib/ai-mcp-agents';

export interface Lane {
  label: string;
  events: { t: number; dur?: number; label: string; tone?: Tone }[];
}

export function timelinePanel(title: string, lanes: Lane[], tMax: number, now?: number, unit = 'ms'): TimelinePanel {
  return {
    type: 'timeline',
    title,
    lanes: lanes.map((l) => ({ label: l.label, events: l.events.map((e) => ({ ...e })) })),
    tMax: Math.max(1, tMax),
    now,
    unit,
  };
}

export function chartPanel(title: string, series: { label: string; points: [number, number][]; tone?: Tone }[], xLabel: string, yLabel: string, kind: 'line' | 'bar' = 'line', marker?: number): ChartPanel {
  return { type: 'chart', title, series: series.map((s) => ({ ...s, points: s.points.map((p) => [...p] as [number, number]) })), xLabel, yLabel, kind, marker };
}

export const round = (n: number, d = 6): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/**
 * Adapter for agent-loop tasks. Args: [script, question, max_steps]. The script is turned into a MockLLM
 * (see AGENT_HARNESS.mk_llm) and the learner's fn(llm, TOOLS, question, max_steps) is run.
 * Returns the fn's value plus how often the model was called and the tool observations it saw last.
 */
export const RUN_AGENT_HARNESS = `
def run_agent_script(fn, script, question, max_steps=5):
    llm = mk_llm(script)
    out = fn(llm, TOOLS, question, max_steps)
    seen = [m["content"] for m in llm.calls[-1]["messages"] if m["role"] == "tool"]
    return {"out": out, "model_calls": len(llm.calls), "observations": seen}
`;

/** A flaky model for structured output: broken JSON until the prompt contains the validator's feedback. */
export const FLAKY_HARNESS = `
import json
from minillm import MockLLM

BAD_OUTPUTS = [
    'Sure! Here is the JSON: {"name": "Ada", "age": "36", "tags": ["math"]}',
    '{"name": "Ada", "tags": ["math"]}',
]

def flaky(messages, tools):
    prompt = messages[-1]["content"]
    if "Previous errors" in prompt:
        return '{"name": "Ada", "age": 36, "tags": ["math"]}'
    return BAD_OUTPUTS[0]

def flaky_llm():
    return MockLLM(flaky)
`;
