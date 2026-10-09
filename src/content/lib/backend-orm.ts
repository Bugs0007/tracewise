// Shared helpers for the M2 backend units: a pipeline graph builder and a tiny
// ORM-call -> SQL model that mirrors what src/py/minidjango/models.py prints.
import type { GraphEdge, GraphNode, GraphPanel, Tone } from '@/engine/types';

export const SIM_NOTE = 'Exercises run on minidjango, a small in-browser library that mirrors Django\'s API; it is a faithful simulation of the concepts, not Django itself.';

// ───────────────────────── pipeline graph ─────────────────────────

export interface PipeStage {
  id: string;
  label: string;
  sub?: string;
}

export interface PipeOpts {
  title?: string;
  tones?: Record<string, Tone>;
  badges?: Record<string, string>;
  /** edges that were already travelled: key "a>b" (a->b is the request direction; "b>a" the response) */
  trail?: Record<string, Tone>;
  /** the edge currently animating */
  flow?: { from: string; to: string; tone?: Tone };
  gap?: number;
}

/** Left-to-right pipeline. Request edges arc above the line, response edges below it. */
export function pipelinePanel(stages: PipeStage[], o: PipeOpts = {}): GraphPanel {
  const gap = o.gap ?? 112;
  const w = 88;
  const nodes: GraphNode[] = stages.map((s, i) => ({
    id: s.id,
    label: s.label,
    sub: s.sub,
    x: w / 2 + i * gap,
    y: 56,
    w,
    h: s.sub ? 44 : 38,
    shape: 'rect',
    tone: o.tones?.[s.id],
    badge: o.badges?.[s.id],
  }));
  const edges: GraphEdge[] = [];
  for (let i = 0; i + 1 < stages.length; i++) {
    const a = stages[i].id;
    const b = stages[i + 1].id;
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const key = `${from}>${to}`;
      const isFlow = o.flow?.from === from && o.flow?.to === to;
      edges.push({
        from,
        to,
        directed: true,
        curve: -26,
        dashed: from === b,
        flow: isFlow || undefined,
        tone: isFlow ? (o.flow?.tone ?? 'active') : o.trail?.[key],
      });
    }
  }
  return { type: 'graph', title: o.title, nodes, edges, width: w + (stages.length - 1) * gap, height: 112 };
}

// ───────────────────────── tiny ORM model ─────────────────────────

export type Val = string | number | boolean | null | (string | number)[];

export interface Cond {
  neg: boolean;
  kv: [string, Val][];
}

export interface QState {
  conds: Cond[];
  order: string[] | null;
  low: number;
  high: number | null;
  select: string[];
  values: string[] | null;
  /** slicing with a step evaluates the queryset and returns a list */
  step: number | null;
}

export const emptyQ = (): QState => ({ conds: [], order: null, low: 0, high: null, select: [], values: null, step: null });

interface ModelDef {
  table: string;
  fields: Record<string, { fk?: string }>;
}

const MODELS: Record<string, ModelDef> = {
  Book: { table: 'book', fields: { id: {}, title: {}, pages: {}, author: { fk: 'Author' } } },
  Author: { table: 'author', fields: { id: {}, name: {}, country: {} } },
};

export const AUTHORS = [
  { id: 1, name: 'Ana', country: 'PT' },
  { id: 2, name: 'Ben', country: 'US' },
  { id: 3, name: 'Cleo', country: 'KE' },
];

export const BOOKS = [
  { id: 1, title: 'Orbit', pages: 320, author_id: 1 },
  { id: 2, title: 'Harbor', pages: 150, author_id: 2 },
  { id: 3, title: 'Lantern', pages: 480, author_id: 1 },
  { id: 4, title: 'Quartz', pages: 90, author_id: 3 },
  { id: 5, title: 'Meadow', pages: 260, author_id: 2 },
  { id: 6, title: 'Compass', pages: 410, author_id: 1 },
  { id: 7, title: 'Ember', pages: 120, author_id: 3 },
  { id: 8, title: 'Tundra', pages: 350, author_id: 2 },
];

const LOOKUPS = new Set(['exact', 'iexact', 'gt', 'gte', 'lt', 'lte', 'contains', 'icontains', 'in', 'startswith', 'endswith', 'isnull', 'ne']);
const OPS: Record<string, string> = { exact: '=', gt: '>', gte: '>=', lt: '<', lte: '<=', ne: '!=', in: 'IN', iexact: 'ILIKE' };

export function sqlValue(v: Val): string {
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return '(' + v.map((x) => sqlValue(x)).join(', ') + ')';
  return "'" + v.replace(/'/g, "''") + "'";
}

/** "author__name__icontains" -> { col: "author.name", op: "icontains", joins: [...] } */
function resolveKey(key: string): { col: string; op: string; joins: string[] } {
  const parts = key.split('__');
  let op = 'exact';
  if (parts.length > 1 && LOOKUPS.has(parts[parts.length - 1])) op = parts.pop()!;
  let model = 'Book';
  const joins: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i] === 'pk' ? 'id' : parts[i];
    const def = MODELS[model];
    const f = def.fields[name];
    if (!f) throw new Error(`FieldError: ${model} has no field named '${name}'`);
    if (f.fk && i < parts.length - 1) {
      const rm = MODELS[f.fk];
      joins.push(`INNER JOIN ${rm.table} ON ${def.table}.${name}_id = ${rm.table}.id`);
      model = f.fk;
      continue;
    }
    return { col: `${def.table}.${f.fk ? name + '_id' : name}`, op, joins };
  }
  return { col: `${MODELS[model].table}.id`, op, joins };
}

function lookupSql(key: string, val: Val): string {
  const { col, op } = resolveKey(key);
  if (op === 'isnull') return `${col} IS ${val ? 'NULL' : 'NOT NULL'}`;
  if (op === 'contains') return `${col} LIKE '%${val}%'`;
  if (op === 'icontains') return `${col} ILIKE '%${val}%'`;
  if (op === 'startswith') return `${col} LIKE '${val}%'`;
  if (op === 'endswith') return `${col} LIKE '%${val}'`;
  return `${col} ${OPS[op]} ${sqlValue(val)}`;
}

export interface SqlParts {
  select: string;
  from: string;
  where: string;
  order: string;
  limit: string;
}

export function sqlParts(q: QState, count = false): SqlParts {
  const joins: string[] = [];
  for (const c of q.conds) for (const [k] of c.kv) for (const j of resolveKey(k).joins) if (!joins.includes(j)) joins.push(j);
  for (const name of q.select) {
    const f = MODELS.Book.fields[name];
    if (!f?.fk) throw new Error(`FieldError: Invalid field name '${name}' given to select_related()`);
    const rm = MODELS[f.fk];
    const j = `LEFT OUTER JOIN ${rm.table} ON book.${name}_id = ${rm.table}.id`;
    if (!joins.includes(j)) joins.push(j);
  }
  const cols = count ? 'COUNT(*)' : q.values ? q.values.map((c) => `book.${c}`).join(', ') : ['book.*', ...q.select.map((n) => `${MODELS[MODELS.Book.fields[n].fk!].table}.*`)].join(', ');
  const where = q.conds
    .map((c) => {
      const s = c.kv.map(([k, v]) => lookupSql(k, v)).join(' AND ');
      return c.neg ? `NOT (${s})` : s;
    })
    .join(' AND ');
  const order = q.order && !count ? q.order.map((o) => `book.${o.replace(/^-/, '')} ${o.startsWith('-') ? 'DESC' : 'ASC'}`).join(', ') : '';
  let limit = '';
  if (!count) {
    if (q.high !== null) limit = `LIMIT ${q.high - q.low}`;
    if (q.low) limit += `${limit ? ' ' : ''}OFFSET ${q.low}`;
  }
  return { select: cols, from: 'book' + (joins.length ? ' ' + joins.join(' ') : ''), where, order, limit };
}

export function toSql(q: QState, count = false): string {
  const p = sqlParts(q, count);
  return `SELECT ${p.select} FROM ${p.from}` + (p.where ? ` WHERE ${p.where}` : '') + (p.order ? ` ORDER BY ${p.order}` : '') + (p.limit ? ` ${p.limit}` : '');
}

export const existsSql = (q: QState): string => {
  const p = sqlParts(q);
  return `SELECT 1 FROM book${p.where ? ` WHERE ${p.where}` : ''} LIMIT 1`;
};

// ── parsing "Book.objects.filter(pages__gt=100).order_by("-pages")[:3]" ──

export interface ParsedCall {
  name: string;
  args: { key?: string; val: Val }[];
  raw: string;
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
      cur += ch;
    } else if (ch === ')' || ch === ']') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseVal(s: string): Val {
  const t = s.trim();
  if (/^(["']).*\1$/.test(t)) return t.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === 'True') return true;
  if (t === 'False') return false;
  if (t === 'None') return null;
  if (t.startsWith('[') && t.endsWith(']')) return splitTop(t.slice(1, -1)).map((x) => parseVal(x) as string | number);
  throw new Error(`Can't read value "${t}" (use numbers, "strings", True/False/None or [lists])`);
}

/** Split "Book.objects.filter(a=1).order_by("x")[:3]" into its head and calls. */
export function parseExpr(src: string): { head: string; calls: ParsedCall[] } {
  const s = src.trim();
  const m = s.match(/^([A-Za-z_]\w*(?:\.objects)?)/);
  if (!m) throw new Error(`Can't read "${s}"`);
  const head = m[1];
  let i = head.length;
  const calls: ParsedCall[] = [];
  const closeAt = (open: string, close: string, from: number): number => {
    let depth = 0;
    let quote = '';
    for (let k = from; k < s.length; k++) {
      const ch = s[k];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) return k;
    }
    throw new Error(`Missing ${close} in "${s}"`);
  };
  while (i < s.length) {
    if (s[i] === ' ') {
      i++;
      continue;
    }
    if (s[i] === '.') {
      const nm = s.slice(i + 1).match(/^(\w+)/);
      if (!nm) throw new Error(`Expected a method name after "." in "${s}"`);
      i += 1 + nm[1].length;
      let argText = '';
      if (s[i] === '(') {
        const end = closeAt('(', ')', i);
        argText = s.slice(i + 1, end);
        i = end + 1;
      }
      const args = splitTop(argText).map((a) => {
        const kv = a.match(/^(\w+)\s*=\s*(.+)$/);
        return kv ? { key: kv[1], val: parseVal(kv[2]) } : { val: parseVal(a) };
      });
      calls.push({ name: nm[1], args, raw: `${nm[1]}(${argText})` });
    } else if (s[i] === '[') {
      const end = closeAt('[', ']', i);
      calls.push({ name: '[]', args: [], raw: s.slice(i, end + 1) });
      i = end + 1;
    } else throw new Error(`Unexpected "${s[i]}" in "${s}"`);
  }
  return { head, calls };
}

export type Slice = { index: number } | { lo: number | null; hi: number | null; step: number | null };

export function parseSlice(raw: string): Slice {
  const body = raw.slice(1, -1).trim();
  if (!body.includes(':')) {
    const n = Number(body);
    if (!Number.isInteger(n) || n < 0) throw new Error('Negative indexing is not supported.');
    return { index: n };
  }
  const [a, b, c] = body.split(':').map((x) => x.trim());
  const num = (x: string | undefined) => (x === undefined || x === '' ? null : Number(x));
  return { lo: num(a), hi: num(b), step: num(c) };
}

export const CHAIN_METHODS = new Set(['all', 'filter', 'exclude', 'order_by', 'select_related', 'prefetch_related', 'values_list', 'values']);

/** Apply a lazy (chainable) call and return a NEW state; never touches the database. */
export function applyCall(q: QState, c: ParsedCall): QState {
  const n: QState = { ...q, conds: [...q.conds], select: [...q.select], order: q.order ? [...q.order] : null };
  switch (c.name) {
    case 'all':
    case 'prefetch_related':
      return n;
    case 'filter':
    case 'exclude': {
      if (!c.args.length || c.args.some((a) => !a.key)) throw new Error(`${c.name}() takes keyword lookups like pages__gt=100`);
      const kv = c.args.map((a) => [a.key!, a.val] as [string, Val]);
      kv.forEach(([k]) => resolveKey(k));
      n.conds.push({ neg: c.name === 'exclude', kv });
      return n;
    }
    case 'order_by':
      n.order = c.args.map((a) => String(a.val));
      return n;
    case 'select_related':
      n.select = [...n.select, ...c.args.map((a) => String(a.val))];
      return n;
    case 'values_list':
    case 'values':
      n.values = c.args.map((a) => String(a.val));
      return n;
    case '[]': {
      const sl = parseSlice(c.raw);
      if ('index' in sl) {
        n.low = q.low + sl.index;
        n.high = q.low + sl.index + 1;
        return n;
      }
      n.low = q.low + (sl.lo ?? 0);
      n.high = sl.hi !== null ? q.low + sl.hi : q.high;
      if (q.high !== null && n.high !== null) n.high = Math.min(n.high, q.high);
      n.step = sl.step;
      return n;
    }
    default:
      throw new Error(`"${c.name}" is not a chainable queryset method here`);
  }
}

// ── running a query against the sample tables ──

type Row = { id: number; title: string; pages: number; author_id: number };

function rowValue(row: Row, key: string): unknown {
  const parts = key.split('__');
  if (parts.length > 1 && LOOKUPS.has(parts[parts.length - 1])) parts.pop();
  if (parts[0] === 'author' && parts.length > 1) {
    const a = AUTHORS.find((x) => x.id === row.author_id);
    return a ? (a as Record<string, unknown>)[parts[1] === 'pk' ? 'id' : parts[1]] : null;
  }
  if (parts[0] === 'author') return row.author_id;
  if (parts[0] === 'pk') return row.id;
  return (row as Record<string, unknown>)[parts[0]];
}

function lookupMatch(row: Row, key: string, arg: Val): boolean {
  const { op } = resolveKey(key);
  const v = rowValue(row, key);
  if (op === 'isnull') return (v === null || v === undefined) === Boolean(arg);
  if (v === null || v === undefined) return false;
  const s = String(v);
  switch (op) {
    case 'exact': return v === arg;
    case 'ne': return v !== arg;
    case 'iexact': return s.toLowerCase() === String(arg).toLowerCase();
    case 'gt': return (v as number) > (arg as number);
    case 'gte': return (v as number) >= (arg as number);
    case 'lt': return (v as number) < (arg as number);
    case 'lte': return (v as number) <= (arg as number);
    case 'in': return (arg as (string | number)[]).includes(v as string | number);
    case 'contains': return s.includes(String(arg));
    case 'icontains': return s.toLowerCase().includes(String(arg).toLowerCase());
    case 'startswith': return s.startsWith(String(arg));
    case 'endswith': return s.endsWith(String(arg));
  }
  return false;
}

export function runQuery(q: QState): Row[] {
  let rows = BOOKS.filter((r) => q.conds.every((c) => c.kv.every(([k, v]) => lookupMatch(r, k, v)) !== c.neg));
  if (q.order) {
    for (const o of [...q.order].reverse()) {
      const name = o.replace(/^-/, '');
      const dir = o.startsWith('-') ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const x = (a as Record<string, unknown>)[name] as number | string;
        const y = (b as Record<string, unknown>)[name] as number | string;
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
  }
  return q.high !== null ? rows.slice(q.low, q.high) : rows.slice(q.low);
}

export const rowLabel = (r: Row): string => `${r.title} (${r.pages}p, ${AUTHORS.find((a) => a.id === r.author_id)!.name})`;

// ───────────────────────── shared Python harness ─────────────────────────

/**
 * Author / Book models plus seed_library() and a small request helper. Same rows as BOOKS / AUTHORS above.
 * Learner code may use Author, Book, JsonResponse, path, App, Client, connection, models directly.
 */
export const LIBRARY_HARNESS = `
from minidjango import models, connection, reset
from minidjango.http import App, path, JsonResponse, get_object_or_404
from minidjango.test import Client

class Author(models.Model):
    name = models.CharField(max_length=50)
    country = models.CharField(max_length=2)

class Book(models.Model):
    title = models.CharField(max_length=100)
    pages = models.IntegerField(default=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

_BOOKS = [("Orbit", 320, 1), ("Harbor", 150, 2), ("Lantern", 480, 1), ("Quartz", 90, 3), ("Meadow", 260, 2), ("Compass", 410, 1), ("Ember", 120, 3), ("Tundra", 350, 2)]

def seed_library(n_books=8):
    reset()
    for name, country in [("Ana", "PT"), ("Ben", "US"), ("Cleo", "KE")]:
        Author.objects.create(name=name, country=country)
    for title, pages, aid in _BOOKS[:n_books]:
        Book.objects.create(title=title, pages=pages, author_id=aid)
    connection.reset_queries()

def get_json(view, url, method="GET", data=None):
    seed_library()
    client = Client(App([path("books/", view)]))
    r = client.request(method, url, data)
    return [r.status_code, r.json(), connection.query_count]
`;
