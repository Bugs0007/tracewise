// Shared helpers for the LLM fundamentals + RAG units (module M5, batch llm-rag-1).
// Everything here is a deterministic TypeScript port of the same algorithms the Python
// `minillm` teaching library uses (tokenize, embed), so the visualizers show exactly what
// the Python exercises compute. No real model is involved anywhere.

/** Round to `d` decimals (and never return -0). */
export function round(x: number, d = 6): number {
  const f = 10 ** d;
  const v = Math.round(x * f) / f;
  return v === 0 ? 0 : v;
}

/** Keep captions within the 90 character budget. */
export function cap(s: string, max = 90): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/** Short number formatting for captions. */
export function f2(x: number, d = 2): string {
  return String(round(x, d));
}

// ───────────────────────── tokenizer (port of minillm.tokenize) ─────────────────────────

const WORD = /[A-Za-z]+|\d+|[^\sA-Za-z\d]/g;

/** Words up to 4 letters stay whole; longer words are cut into 4-letter pieces (`##` marks continuations). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const w of text.match(WORD) ?? []) {
    if (/^[A-Za-z]+$/.test(w) && w.length > 4) {
      const pieces: string[] = [];
      for (let j = 0; j < w.length; j += 4) pieces.push(w.slice(j, j + 4));
      out.push(pieces[0]);
      for (const p of pieces.slice(1)) out.push('##' + p);
    } else out.push(w);
  }
  return out;
}

/** The raw "words" the tokenizer works on (before splitting long ones). */
export function rawWords(text: string): string[] {
  return text.match(WORD) ?? [];
}

// ───────────────────────── md5 + embed (port of minillm.embed) ─────────────────────────

const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

export function md5hex(s: string): string {
  const bytes = Array.from(new TextEncoder().encode(s));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(i < 4 ? (bitLen >>> (8 * i)) & 0xff : 0);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let off = 0; off < bytes.length; off += 64) {
    const M: number[] = [];
    for (let i = 0; i < 16; i++) M.push((bytes[off + 4 * i] | (bytes[off + 4 * i + 1] << 8) | (bytes[off + 4 * i + 2] << 16) | (bytes[off + 4 * i + 3] << 24)) >>> 0);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const hex = (n: number) => [0, 8, 16, 24].map((sh) => ((n >>> sh) & 0xff).toString(16).padStart(2, '0')).join('');
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/** int(md5(s).hexdigest(), 16) % mod, computed digit by digit so no BigInt is needed. */
export function hashMod(s: string, mod: number): number {
  let r = 0;
  for (const ch of md5hex(s)) r = (r * 16 + parseInt(ch, 16)) % mod;
  return r;
}

/** A pretend vocabulary id for a token, stable across runs. */
export function tokenId(tok: string): number {
  return hashMod('id:' + tok, 50000);
}

/** Hashed bag of words + character trigrams, L2-normalised (same recipe as minillm.embed). */
export function embed(text: string, dim = 16): number[] {
  const v = new Array<number>(dim).fill(0);
  const ws = (text.match(/[A-Za-z]+|\d+/g) ?? []).map((w) => w.toLowerCase());
  for (const w of ws) {
    v[hashMod('w:' + w, dim)] += 1;
    const padded = `#${w}#`;
    for (let k = 0; k < padded.length - 2; k++) v[hashMod('t:' + padded.slice(k, k + 3), dim)] += 0.5;
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => round(x / n, 6));
}

// ───────────────────────── vectors ─────────────────────────

export const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
export const norm = (a: number[]): number => Math.sqrt(dot(a, a));

export function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  return na && nb ? dot(a, b) / (na * nb) : 0;
}

/** Order by score descending, ties by key ascending (the tie rule used by every search exercise). */
export function rankDesc<T>(items: T[], score: (t: T) => number, key: (t: T) => string): T[] {
  return [...items].sort((x, y) => score(y) - score(x) || (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
}

// ───────────────────────── numerics ─────────────────────────

/** Softmax with temperature, numerically stable (subtracts the max first). */
export function softmaxT(logits: number[], temperature: number): number[] {
  const scaled = logits.map((x) => x / temperature);
  const m = Math.max(...scaled);
  const exps = scaled.map((x) => Math.exp(x - m));
  const total = exps.reduce((s, x) => s + x, 0);
  return exps.map((e) => e / total);
}

/** MINSTD linear congruential generator: tiny, seedable and identical on every machine. */
export function lcg(seed: number): () => number {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/** Lower-cased alphanumeric words, used by keyword search. */
export const words = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/** Min-max normalise to 0..1 (all zeros when every value is equal). */
export function minmax(xs: number[]): number[] {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return xs.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0));
}
