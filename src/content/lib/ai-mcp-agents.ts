// Shared helpers for the M5 "MCP, agents and production LLM apps" units:
// caption guard, a sequence-diagram builder, a flow-graph builder for agent
// loops, small panels, tiny text helpers and the hidden Python harnesses
// (tool registry + scripted MockLLM) used by the exercises.
import type { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, GraphPanel, KVPanel, LogPanel, Panel, Scalar, SequenceMessage, SequencePanel, Tone } from '@/engine/types';

export const MOCK_NOTE = 'Deterministic mock models; no real LLM is called.';

/** Keep captions short and on one line. */
export const cap = (s: string, n = 90): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');

/** Recorder.step with the caption length guard applied. */
export function step(r: Recorder, at: string | number | undefined, caption: string, panels: Panel[], vars: Record<string, unknown> = {}): void {
  r.step(at, cap(caption), panels, vars);
}

export const short = (s: string, n = 24): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');
export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const r4 = (n: number): number => Math.round(n * 10000) / 10000;

// ───────────────────────── sequence diagrams ─────────────────────────

export class Seq {
  readonly messages: SequenceMessage[] = [];
  constructor(
    readonly actors: string[],
    readonly title?: string,
  ) {}

  send(from: string, to: string, label: string, tone?: Tone, dashed = false): number {
    this.messages.push({ from, to, label: short(label, 44), tone, dashed });
    return this.messages.length - 1;
  }

  /** `last` keeps the diagram readable by showing only the most recent messages. */
  panel(last = 9): SequencePanel {
    const from = Math.max(0, this.messages.length - last);
    const shown = this.messages.slice(from).map((m) => ({ ...m }));
    return { type: 'sequence', title: this.title, actors: this.actors, messages: shown, active: shown.length - 1 };
  }
}

// ───────────────────────── small panels ─────────────────────────

export function logPanel(title: string, lines: { text: string; tone?: Tone }[], keep = 9): LogPanel {
  return { type: 'log', title, lines: lines.slice(-keep).map((l) => ({ ...l })) };
}

export function kvPanel(title: string, entries: Record<string, Scalar>, tones: Record<string, Tone> = {}): KVPanel {
  return { type: 'kv', title, entries: Object.entries(entries).map(([k, v]) => ({ k, v, tone: tones[k] })) };
}

// ───────────────────────── flow graphs ─────────────────────────

export interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  shape?: GraphNode['shape'];
  sub?: string;
}

export interface FlowDef {
  title?: string;
  width: number;
  height: number;
  nodes: FlowNode[];
  /** edges as "from>to" with an optional label */
  edges: { from: string; to: string; label?: string; curve?: number; dashed?: boolean }[];
}

export interface FlowState {
  nodes?: Record<string, Tone>;
  /** edge key "from>to" -> tone */
  edges?: Record<string, Tone>;
  badges?: Record<string, string>;
  tags?: Record<string, string[]>;
  /** edge keys that animate a token */
  flow?: string[];
}

export function flowGraph(def: FlowDef, st: FlowState = {}): GraphPanel {
  const nodes: GraphNode[] = def.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    x: n.x,
    y: n.y,
    w: n.w ?? 104,
    h: n.h ?? 34,
    shape: n.shape ?? 'rect',
    sub: n.sub,
    tone: st.nodes?.[n.id],
    badge: st.badges?.[n.id],
    tags: st.tags?.[n.id],
  }));
  const edges: GraphEdge[] = def.edges.map((e) => {
    const key = e.from + '>' + e.to;
    return { from: e.from, to: e.to, label: e.label, curve: e.curve, dashed: e.dashed, directed: true, tone: st.edges?.[key], flow: st.flow?.includes(key) };
  });
  return { type: 'graph', title: def.title, nodes, edges, directed: true, width: def.width, height: def.height };
}

// ───────────────────────── text helpers ─────────────────────────

export const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []) as string[];

export function jaccard(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** posix path normalisation (collapses "." and ".."), mirrors posixpath.normpath. */
export function normPath(p: string): string {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!abs) out.push('..');
    } else out.push(part);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
}

// ───────────────────────── hidden Python harnesses ─────────────────────────

/**
 * Tool registry + scripted model for agent exercises. `mk_llm(script)` turns a
 * JSON script into a MockLLM: strings are final answers, {"tool": n, "args": {}}
 * is one tool call, {"calls": [{"id","name","args"}]} is a parallel batch.
 */
export const AGENT_HARNESS = `
import json
from minillm import MockLLM, tool_call, reply, count_tokens, embed, tokenize

def _boom(**kw):
    raise RuntimeError("tool crashed")

TOOLS = {
    "add": lambda a, b: a + b,
    "get_weather": lambda city: {"Paris": "sunny, 21C", "Oslo": "snow, -3C"}.get(city, "unknown city"),
    "search": lambda q: {"capital of france": "Paris", "population of paris": "2.1 million"}.get(q, "no results"),
    "boom": _boom,
}

def _msg(item):
    if isinstance(item, dict) and "tool" in item:
        return tool_call(item["tool"], **item.get("args", {}))
    if isinstance(item, dict) and "calls" in item:
        return {"role": "assistant", "content": None, "tool_calls": [
            {"id": c["id"], "name": c["name"], "arguments": json.dumps(c.get("args", {}), sort_keys=True)} for c in item["calls"]]}
    return item

def mk_llm(script):
    return MockLLM([_msg(s) for s in script])
`;

/** Scripted model that answers from the latest tool message (so forgetting to pass results back is visible). */
export const ECHO_LLM_HARNESS = `
def echo_model(messages, tools):
    tool_msgs = [m for m in messages if m["role"] == "tool"]
    if tool_msgs:
        return "Answer: " + tool_msgs[-1]["content"]
    q = [m for m in messages if m["role"] == "user"][-1]["content"]
    if "weather" in q:
        return tool_call("get_weather", city="Paris")
    if "add" in q:
        return tool_call("add", a=2, b=3)
    if "launch" in q:
        return tool_call("launch_missiles", target="moon")
    return "I can answer that directly."
`;
