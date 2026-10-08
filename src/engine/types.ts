// Visualizer engine core types.
//
// Every visualizer is a pure function `run(input) -> { frames, result }`.
// A frame is a full snapshot of what to draw: a set of panels (array, graph,
// grid, ...), the highlighted code line, a one-line caption and live variables.
// The player only ever renders frames, so every visual comes from real,
// step-recorded execution state.

export type Tone =
  | 'default'
  | 'active' // the thing being worked on right now
  | 'compare' // being compared / inspected
  | 'swap' // being moved / written
  | 'visited' // already processed
  | 'frontier' // discovered, waiting (queue, heap)
  | 'done' // final / sorted / settled
  | 'found' // success / match
  | 'error' // failure / conflict / bug
  | 'muted' // out of range / pruned
  | 'path' // part of an answer path
  | 'new'; // just created

export type Scalar = string | number | boolean | null;

export interface ArrayPanel {
  type: 'array';
  title?: string;
  values: Scalar[];
  /** index -> tone */
  tones?: Record<number, Tone>;
  /** pointer name -> index (index may be -1 or values.length for "off the end") */
  pointers?: Record<string, number>;
  /** a highlighted inclusive range such as a window or search space */
  range?: { from: number; to: number; tone?: Tone; label?: string };
  /** render values as bars (sorting) */
  bars?: boolean;
  /** custom index labels (defaults to 0..n-1) */
  indexLabels?: string[];
  /** hide index labels */
  hideIndex?: boolean;
  /** stable identity per cell so moves (swaps, shifts) animate */
  ids?: (string | number)[];
}

export interface GridPanel {
  type: 'grid';
  title?: string;
  cells: Scalar[][];
  /** "r,c" -> tone */
  tones?: Record<string, Tone>;
  rowLabels?: string[];
  colLabels?: string[];
  /** dependency arrows drawn between cells */
  arrows?: { from: [number, number]; to: [number, number]; tone?: Tone }[];
  /** colour cells by numeric value (0..1 normalised) */
  heat?: boolean;
  /** small cells, no text (bit grids, mazes) */
  compact?: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  tone?: Tone;
  shape?: 'circle' | 'rect' | 'pill' | 'cylinder' | 'actor';
  w?: number;
  h?: number;
  /** small text under/next to the node (distance, rank, count) */
  badge?: string;
  /** pointer labels attached above the node (head, curr, slow ...) */
  tags?: string[];
  sub?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  tone?: Tone;
  directed?: boolean;
  dashed?: boolean;
  /** bend amount, useful for back-pointers and parallel edges */
  curve?: number;
  /** animate a token moving along the edge */
  flow?: boolean;
}

export interface GraphPanel {
  type: 'graph';
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  directed?: boolean;
  /** logical canvas size; nodes use these coordinates */
  width: number;
  height: number;
  /** draw x/y axes (embedding scatter plots) */
  axes?: boolean;
}

export interface ListItem {
  id?: string;
  label: string;
  tone?: Tone;
  sub?: string;
}

export interface ListPanel {
  type: 'list';
  title?: string;
  items: ListItem[];
  orientation: 'vertical' | 'horizontal';
  /** label for the open end, e.g. "top", "front" */
  endLabel?: string;
  startLabel?: string;
  emptyText?: string;
}

export interface BucketsPanel {
  type: 'buckets';
  title?: string;
  buckets: ListItem[][];
  tones?: Record<number, Tone>;
}

export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  tone?: Tone;
  dashed?: boolean;
}

export interface SequencePanel {
  type: 'sequence';
  title?: string;
  actors: string[];
  messages: SequenceMessage[];
  /** index of the message currently animating */
  active?: number;
}

export interface TimelineEvent {
  t: number;
  dur?: number;
  label: string;
  tone?: Tone;
}

export interface TimelinePanel {
  type: 'timeline';
  title?: string;
  lanes: { label: string; events: TimelineEvent[] }[];
  tMax: number;
  now?: number;
  unit?: string;
}

export interface ChartPanel {
  type: 'chart';
  title?: string;
  series: { label: string; points: [number, number][]; tone?: Tone }[];
  xLabel?: string;
  yLabel?: string;
  /** vertical marker at x */
  marker?: number;
  kind?: 'line' | 'bar';
}

export interface LogPanel {
  type: 'log';
  title?: string;
  lines: { text: string; tone?: Tone }[];
}

export interface KVPanel {
  type: 'kv';
  title?: string;
  entries: { k: string; v: Scalar; tone?: Tone }[];
}

export interface NotePanel {
  type: 'note';
  text: string;
  tone?: Tone;
}

export type Panel =
  | ArrayPanel
  | GridPanel
  | GraphPanel
  | ListPanel
  | BucketsPanel
  | SequencePanel
  | TimelinePanel
  | ChartPanel
  | LogPanel
  | KVPanel
  | NotePanel;

export interface Frame {
  /** 1-based line in the visualizer's code, or 0 for none */
  line: number;
  caption: string;
  panels: Panel[];
  vars: Record<string, Scalar>;
  /** cumulative operation counter (comparisons, writes, ...) */
  ops?: number;
}

export type InputKind = 'numbers' | 'number' | 'string' | 'strings' | 'edges' | 'grid' | 'json' | 'select';

export interface InputField {
  key: string;
  label: string;
  kind: InputKind;
  default: unknown;
  options?: string[];
  help?: string;
  /** soft cap to keep visualizations readable */
  maxItems?: number;
}

export interface VizResult {
  frames: Frame[];
  result?: unknown;
}

export interface VizDef<I = any> {
  id: string;
  title: string;
  /** code shown in the code panel; lines may end with `#@anchor` or `//@anchor` */
  code: string;
  language: 'python' | 'javascript' | 'text';
  inputs: InputField[];
  presets?: { label: string; input: Partial<I> }[];
  run: (input: I) => VizResult;
  /** optional reference implementation, used by tests to verify `result` */
  reference?: (input: I) => unknown;
}
