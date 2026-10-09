// Shared deterministic models for the M3 "css-web" units: CSS layout algorithms
// (box model, flex, grid, specificity, positioning) and small browser-security
// models (cookie matching, SameSite, a tiny HTML scanner). Pure functions only.
import type { GraphNode, GraphPanel, Tone } from '@/engine/types';

export const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** A rect node positioned by its top-left corner (the graph panel itself centres nodes). */
export function rectNode(id: string, label: string, left: number, top: number, w: number, h: number, tone?: Tone, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, label, x: left + w / 2, y: top + h / 2, w: Math.max(2, w), h: Math.max(2, h), shape: 'rect', tone, ...extra };
}

// ─── Box model ─────────────────────────────────────────────────────────────

export type BoxSizing = 'content-box' | 'border-box';

export interface BoxIn {
  boxSizing: BoxSizing;
  width: number;
  padding: number;
  border: number;
  margin: number;
}

export interface BoxOut {
  edge: number;
  content: number;
  borderBox: number;
  marginBox: number;
}

export function computeBox(i: BoxIn): BoxOut {
  const edge = 2 * (i.padding + i.border);
  const content = i.boxSizing === 'border-box' ? Math.max(0, i.width - edge) : i.width;
  const borderBox = content + edge;
  return { edge, content, borderBox, marginBox: borderBox + 2 * i.margin };
}

/** Adjoining vertical margins: both positive -> max, both negative -> min, mixed -> sum. */
export function collapseMargins(a: number, b: number): number {
  if (a >= 0 && b >= 0) return Math.max(a, b);
  if (a < 0 && b < 0) return Math.min(a, b);
  return a + b;
}

/** Concentric rectangles for margin / border / padding / content; layers beyond `upTo` (1..4) are hidden. */
export function boxPanel(box: BoxIn, upTo: number, title = 'Box layers'): GraphPanel {
  const o = computeBox(box);
  const contentH = 48;
  const W = o.marginBox;
  const H = contentH + 2 * (box.padding + box.border + box.margin);
  const sc = Math.min(400 / Math.max(W, 1), 190 / Math.max(H, 1), 2);
  const width = Math.max(120, Math.round(W * sc));
  const height = Math.max(70, Math.round(H * sc));
  const nodes: GraphNode[] = [];
  const layers: { id: string; t: number; tone: Tone; need: number }[] = [
    { id: 'margin', t: box.margin, tone: 'frontier', need: 4 },
    { id: 'border', t: box.border, tone: 'compare', need: 3 },
    { id: 'padding', t: box.padding, tone: 'new', need: 2 },
  ];
  // layers not revealed yet are skipped; the picture is cropped to the outermost revealed layer
  let inset = layers.filter((l) => upTo < l.need).reduce((a, l) => a + l.t, 0);
  for (const l of layers) {
    if (upTo < l.need) continue;
    if (l.t > 0) nodes.push(rectNode(l.id, '', inset * sc, inset * sc, width - 2 * inset * sc, height - 2 * inset * sc, l.tone));
    inset += l.t;
  }
  const cw = o.content * sc;
  const ch = contentH * sc;
  nodes.push(rectNode('content', `content ${o.content}`, inset * sc, inset * sc, cw, ch, 'active'));
  return { type: 'graph', title, nodes, edges: [], width, height };
}

// ─── Flexbox (simplified single-line algorithm) ──────────────────────────────

export type FlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
export type Justify = 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
export type AlignItems = 'flex-start' | 'flex-end' | 'center' | 'stretch';

export interface FlexItem {
  basis: number;
  grow: number;
  shrink: number;
  /** cross size in px; omitted means `auto` (stretchable) */
  cross?: number;
}

export interface FlexCfg {
  direction: FlexDirection;
  justify: Justify;
  align: AlignItems;
  /** container size along the main axis */
  main: number;
  /** container size along the cross axis */
  cross: number;
  gap: number;
  items: FlexItem[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const AUTO_CROSS = 40;

export interface FlexSolved {
  free: number;
  mode: 'grow' | 'shrink' | 'none';
  sizes: number[];
  rem: number;
  offset: number;
  between: number;
  mainPos: number[];
  crossSize: number[];
  crossPos: number[];
  rects: Rect[];
}

/** Resolve flexible lengths: grow on positive free space, shrink (weighted by basis) on negative. */
export function flexSizes(basis: number[], grow: number[], shrink: number[], avail: number): { free: number; mode: 'grow' | 'shrink' | 'none'; sizes: number[] } {
  const free = avail - basis.reduce((a, b) => a + b, 0);
  if (free > 0) {
    const g = grow.reduce((a, b) => a + b, 0);
    if (g > 0) return { free, mode: 'grow', sizes: basis.map((b, i) => b + (free * grow[i]) / g) };
  } else if (free < 0) {
    const weights = basis.map((b, i) => b * shrink[i]);
    const w = weights.reduce((a, b) => a + b, 0);
    if (w > 0) return { free, mode: 'shrink', sizes: basis.map((b, i) => Math.max(0, b + (free * weights[i]) / w)) };
  }
  return { free, mode: 'none', sizes: [...basis] };
}

export function flexSolve(cfg: FlexCfg): FlexSolved {
  const n = cfg.items.length;
  const gaps = Math.max(0, n - 1) * cfg.gap;
  const fl = flexSizes(
    cfg.items.map((i) => i.basis),
    cfg.items.map((i) => i.grow),
    cfg.items.map((i) => i.shrink),
    cfg.main - gaps,
  );
  const sizes = fl.sizes;
  const rem = cfg.main - gaps - sizes.reduce((a, b) => a + b, 0);
  let offset = 0;
  let between = 0;
  const j: Justify = rem < 0 ? (cfg.justify === 'space-between' ? 'flex-start' : cfg.justify === 'space-around' || cfg.justify === 'space-evenly' ? 'center' : cfg.justify) : cfg.justify;
  if (j === 'flex-end') offset = rem;
  else if (j === 'center') offset = rem / 2;
  else if (j === 'space-between') between = n > 1 ? rem / (n - 1) : 0;
  else if (j === 'space-around') {
    between = n > 0 ? rem / n : 0;
    offset = between / 2;
  } else if (j === 'space-evenly') {
    between = rem / (n + 1);
    offset = between;
  }
  const mainPos: number[] = [];
  let cur = offset;
  for (let i = 0; i < n; i++) {
    mainPos.push(cur);
    cur += sizes[i] + cfg.gap + between;
  }
  const crossSize = cfg.items.map((it) => it.cross ?? (cfg.align === 'stretch' ? cfg.cross : AUTO_CROSS));
  const crossPos = crossSize.map((c) => (cfg.align === 'flex-end' ? cfg.cross - c : cfg.align === 'center' ? (cfg.cross - c) / 2 : 0));
  const rects = sizes.map((s, i): Rect => {
    const reversed = cfg.direction === 'row-reverse' || cfg.direction === 'column-reverse';
    const m = reversed ? cfg.main - mainPos[i] - s : mainPos[i];
    return cfg.direction.startsWith('row') ? { x: m, y: crossPos[i], w: s, h: crossSize[i] } : { x: crossPos[i], y: m, w: crossSize[i], h: s };
  });
  return { free: fl.free, mode: fl.mode, sizes, rem, offset, between, mainPos, crossSize, crossPos, rects };
}

// ─── Grid track sizing ─────────────────────────────────────────────────────

export interface GridTrack {
  raw: string;
  kind: 'px' | 'fr' | 'pct';
  value: number;
}

/** Parse `100px 1fr repeat(2, 2fr) 25%` into tracks (px, fr, % only). */
export function parseTrackList(tpl: string): GridTrack[] {
  const expanded = tpl.replace(/repeat\(\s*(\d+)\s*,\s*([^)]*)\)/g, (_m, n: string, body: string) => Array(Number(n)).fill(body.trim()).join(' '));
  const out: GridTrack[] = [];
  for (const tok of expanded.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^(\d*\.?\d+)(px|fr|%)$/);
    if (!m) throw new Error(`Unsupported track "${tok}" (use px, fr or %)`);
    out.push({ raw: tok, kind: m[2] === '%' ? 'pct' : (m[2] as 'px' | 'fr'), value: Number(m[1]) });
  }
  if (!out.length) throw new Error('grid-template-columns is empty');
  if (out.length > 8) throw new Error('Use at most 8 columns');
  return out;
}

export interface TrackSolved {
  fixed: number;
  gaps: number;
  free: number;
  frSum: number;
  frUnit: number;
  sizes: number[];
}

export function solveTracks(tracks: GridTrack[], container: number, gap: number): TrackSolved {
  const fixed = tracks.reduce((a, t) => a + (t.kind === 'px' ? t.value : t.kind === 'pct' ? (t.value * container) / 100 : 0), 0);
  const gaps = Math.max(0, tracks.length - 1) * gap;
  const free = Math.max(0, container - fixed - gaps);
  const frSum = tracks.reduce((a, t) => a + (t.kind === 'fr' ? t.value : 0), 0);
  const frUnit = free / Math.max(1, frSum);
  const sizes = tracks.map((t) => (t.kind === 'px' ? t.value : t.kind === 'pct' ? (t.value * container) / 100 : t.value * frUnit));
  return { fixed, gaps, free, frSum, frUnit, sizes };
}

export interface GridItemIn {
  span?: number;
  /** explicit 1-based start column */
  col?: number;
}

export interface Placement {
  row: number;
  col: number;
  span: number;
}

/** Row-major auto placement with optional explicit start columns (sparse packing). */
export function placeGridItems(items: GridItemIn[], ncols: number): Placement[] {
  const out: Placement[] = [];
  let row = 0;
  let cursor = 0;
  for (const it of items) {
    const span = Math.max(1, Math.min(ncols, Math.round(it.span ?? 1)));
    let col: number;
    if (it.col !== undefined) {
      col = Math.max(0, Math.min(ncols - span, it.col - 1));
      if (col < cursor) row++;
    } else {
      if (cursor + span > ncols) {
        row++;
        cursor = 0;
      }
      col = cursor;
    }
    out.push({ row, col, span });
    cursor = col + span;
  }
  return out;
}

// ─── Specificity ───────────────────────────────────────────────────────────

export type Spec = [number, number, number];

export interface SpecToken {
  text: string;
  kind: 'id' | 'class' | 'attribute' | 'pseudo-class' | 'pseudo-element' | 'type' | 'universal' | 'combinator' | 'functional';
  spec: Spec;
}

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const isIdentChar = (c: string | undefined): boolean => c !== undefined && (/[\w-]/.test(c) || c.charCodeAt(0) > 127);

function readIdent(s: string, i: number): number {
  let j = i;
  while (j < s.length && (isIdentChar(s[j]) || s[j] === '\\')) j += s[j] === '\\' ? 2 : 1;
  return Math.min(j, s.length);
}

function readBalanced(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  let q: string | null = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return j + 1;
  }
  return s.length;
}

function splitTop(arg: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of arg) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export const cmpSpec = (a: Spec, b: Spec): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
export const maxSpec = (list: Spec[]): Spec => list.reduce((m, s) => (cmpSpec(s, m) > 0 ? s : m), [0, 0, 0] as Spec);

/** Tokenise one complex selector and attach each token's specificity contribution. */
export function specTokens(sel: string): SpecToken[] {
  const s = sel.trim();
  const out: SpecToken[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[\s>+~]/.test(c)) {
      let j = i;
      while (j < s.length && /[\s>+~]/.test(s[j])) j++;
      out.push({ text: s.slice(i, j).trim() || ' ', kind: 'combinator', spec: [0, 0, 0] });
      i = j;
    } else if (c === '#') {
      const j = readIdent(s, i + 1);
      out.push({ text: s.slice(i, j), kind: 'id', spec: [1, 0, 0] });
      i = j;
    } else if (c === '.') {
      const j = readIdent(s, i + 1);
      out.push({ text: s.slice(i, j), kind: 'class', spec: [0, 1, 0] });
      i = j;
    } else if (c === '[') {
      const j = readBalanced(s, i, '[', ']');
      out.push({ text: s.slice(i, j), kind: 'attribute', spec: [0, 1, 0] });
      i = j;
    } else if (c === ':') {
      if (s[i + 1] === ':') {
        let j = readIdent(s, i + 2);
        if (s[j] === '(') j = readBalanced(s, j, '(', ')');
        out.push({ text: s.slice(i, j), kind: 'pseudo-element', spec: [0, 0, 1] });
        i = j;
      } else {
        const nameEnd = readIdent(s, i + 1);
        const name = s.slice(i + 1, nameEnd).toLowerCase();
        if (LEGACY_PSEUDO_ELEMENTS.has(name)) {
          out.push({ text: s.slice(i, nameEnd), kind: 'pseudo-element', spec: [0, 0, 1] });
          i = nameEnd;
        } else if (s[nameEnd] === '(') {
          const j = readBalanced(s, nameEnd, '(', ')');
          const arg = s.slice(nameEnd + 1, j - 1);
          let spec: Spec;
          if (['not', 'is', 'matches', 'has', '-webkit-any', '-moz-any'].includes(name)) spec = maxSpec(splitTop(arg).map((p) => specificity(p)));
          else if (name === 'where') spec = [0, 0, 0];
          else {
            const of = arg.match(/\sof\s(.+)$/);
            spec = of ? addSpec([0, 1, 0], maxSpec(splitTop(of[1]).map((p) => specificity(p)))) : [0, 1, 0];
          }
          out.push({ text: s.slice(i, j), kind: 'functional', spec });
          i = j;
        } else {
          out.push({ text: s.slice(i, nameEnd), kind: 'pseudo-class', spec: [0, 1, 0] });
          i = nameEnd;
        }
      }
    } else if (c === '*') {
      out.push({ text: '*', kind: 'universal', spec: [0, 0, 0] });
      i++;
    } else if (isIdentChar(c)) {
      const j = readIdent(s, i);
      out.push({ text: s.slice(i, j), kind: 'type', spec: [0, 0, 1] });
      i = j;
    } else i++;
  }
  return out;
}

export function addSpec(a: Spec, b: Spec): Spec {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function specificity(sel: string): Spec {
  return specTokens(sel).reduce((acc, t) => addSpec(acc, t.spec), [0, 0, 0] as Spec);
}

// ─── Positioning ───────────────────────────────────────────────────────────

export type PositionValue = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';

export interface PosScene {
  a: 'static' | 'relative';
  b: 'static' | 'relative';
  c: PositionValue;
  top: number;
  left: number;
  scrollY: number;
}

export const VIEWPORT = { w: 600, h: 400 };
export const FLOW: Record<'A' | 'B' | 'C', Rect> = {
  A: { x: 20, y: 30, w: 520, h: 330 },
  B: { x: 90, y: 90, w: 360, h: 220 },
  C: { x: 120, y: 130, w: 150, h: 60 },
};

/** Which box does C measure its offsets from? Walk up to the nearest positioned ancestor. */
export function sceneContainingBlock(s: PosScene): 'A' | 'B' | 'viewport' | 'page' {
  if (s.c === 'fixed') return 'viewport';
  if (s.c === 'absolute') return s.b !== 'static' ? 'B' : s.a !== 'static' ? 'A' : 'page';
  return 'B';
}

export function sceneSolve(s: PosScene): { cb: string; x: number; y: number } {
  const cb = sceneContainingBlock(s);
  const flow = FLOW.C;
  if (s.c === 'relative') return { cb, x: flow.x + s.left, y: flow.y + s.top };
  if (s.c === 'absolute') {
    const o = cb === 'A' ? FLOW.A : cb === 'B' ? FLOW.B : { x: 0, y: 0 };
    return { cb, x: o.x + s.left, y: o.y + s.top };
  }
  if (s.c === 'fixed') return { cb, x: s.left, y: s.scrollY + s.top };
  if (s.c === 'sticky') {
    const stuck = Math.max(flow.y, s.scrollY + s.top);
    return { cb, x: flow.x, y: Math.min(stuck, FLOW.B.y + FLOW.B.h - flow.h) };
  }
  return { cb, x: flow.x, y: flow.y };
}

// ─── Cookies ───────────────────────────────────────────────────────────────

export type SameSiteValue = 'Strict' | 'Lax' | 'None';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: SameSiteValue;
  /** absolute expiry in seconds, or null for a session cookie */
  expires: number | null;
}

export interface SendCtx {
  /** the request is initiated from a different registrable site */
  crossSite: boolean;
  /** a top-level navigation (link click / form submit), not a subresource */
  topLevelNav: boolean;
  method: string;
}

export function domainMatches(c: Pick<Cookie, 'domain' | 'hostOnly'>, host: string): boolean {
  return c.hostOnly ? host === c.domain : host === c.domain || host.endsWith('.' + c.domain);
}

export function pathMatches(cookiePath: string, reqPath: string): boolean {
  return reqPath === cookiePath || reqPath.startsWith(cookiePath.endsWith('/') ? cookiePath : cookiePath + '/');
}

export function sameSiteAllows(sameSite: SameSiteValue | undefined, ctx: SendCtx): boolean {
  if (!ctx.crossSite) return true;
  const mode = sameSite ?? 'Lax';
  if (mode === 'None') return true;
  if (mode === 'Strict') return false;
  return ctx.topLevelNav && ['GET', 'HEAD', 'OPTIONS'].includes(ctx.method.toUpperCase());
}

export type CookieVerdict = 'expired' | 'domain' | 'path' | 'secure' | 'samesite' | null;

export function cookieVerdicts(jar: Cookie[], url: string, now: number, ctx: SendCtx): { cookie: Cookie; failed: CookieVerdict }[] {
  const u = new URL(url);
  return jar.map((cookie) => {
    let failed: CookieVerdict = null;
    if (cookie.expires !== null && cookie.expires <= now) failed = 'expired';
    else if (!domainMatches(cookie, u.hostname)) failed = 'domain';
    else if (!pathMatches(cookie.path, u.pathname)) failed = 'path';
    else if (cookie.secure && u.protocol !== 'https:') failed = 'secure';
    else if (!sameSiteAllows(cookie.sameSite, ctx)) failed = 'samesite';
    return { cookie, failed };
  });
}

// ─── Escaping + a tiny HTML scanner ──────────────────────────────────────────

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtmlTs = (s: string): string => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export interface HtmlTag {
  kind: 'tag';
  name: string;
  closing: boolean;
  attrs: { name: string; value: string }[];
  raw: string;
}
export interface HtmlText {
  kind: 'text';
  text: string;
}
export type HtmlToken = HtmlTag | HtmlText;

/** Very small HTML tokenizer: enough to see tags, attributes (quoted or not) and text. */
export function scanHtml(html: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  let i = 0;
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };
  while (i < html.length) {
    if (html[i] === '<' && /[a-zA-Z/]/.test(html[i + 1] ?? '')) {
      flush();
      const start = i;
      i++;
      const closing = html[i] === '/';
      if (closing) i++;
      let name = '';
      while (i < html.length && /[^\s/>]/.test(html[i])) name += html[i++];
      const attrs: { name: string; value: string }[] = [];
      while (i < html.length && html[i] !== '>') {
        if (/[\s/]/.test(html[i])) {
          i++;
          continue;
        }
        let an = '';
        while (i < html.length && /[^\s=/>]/.test(html[i])) an += html[i++];
        let av = '';
        while (i < html.length && /\s/.test(html[i])) i++;
        if (html[i] === '=') {
          i++;
          while (i < html.length && /\s/.test(html[i])) i++;
          if (html[i] === '"' || html[i] === "'") {
            const q = html[i++];
            while (i < html.length && html[i] !== q) av += html[i++];
            i++;
          } else while (i < html.length && /[^\s>]/.test(html[i])) av += html[i++];
        }
        if (an) attrs.push({ name: an.toLowerCase(), value: av });
      }
      i++;
      out.push({ kind: 'tag', name: name.toLowerCase(), closing, attrs, raw: html.slice(start, i) });
    } else text += html[i++];
  }
  flush();
  return out;
}

export interface ScriptFinding {
  where: string;
  kind: 'script-tag' | 'event-handler' | 'javascript-url';
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data']);

/** What in the scanned markup would execute script? */
export function scriptFindings(tokens: HtmlToken[]): ScriptFinding[] {
  const out: ScriptFinding[] = [];
  for (const t of tokens) {
    if (t.kind !== 'tag' || t.closing) continue;
    if (t.name === 'script') out.push({ where: '<script>', kind: 'script-tag' });
    for (const a of t.attrs) {
      if (a.name.startsWith('on')) out.push({ where: `<${t.name} ${a.name}>`, kind: 'event-handler' });
      // eslint-disable-next-line no-control-regex
      else if (URL_ATTRS.has(a.name) && /^javascript:/i.test(a.value.replace(/[\u0000- ]/g, ''))) out.push({ where: `<${t.name} ${a.name}>`, kind: 'javascript-url' });
    }
  }
  return out;
}
