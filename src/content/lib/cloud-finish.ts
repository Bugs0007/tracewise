// Helpers for the last M6 batch (messaging, edge, networking, Linux and TCP/DNS/TLS units).
import type { Tone } from '@/engine/types';
import { ipToInt, parseCidr } from '@/content/lib/cloud-aws';

/** Parse "key=a|b key2=c" into { key: [a, b], key2: [c] }. "*" or empty means no constraint. */
export function parseAttrPolicy(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const t = text.trim();
  if (!t || t === '*') return out;
  for (const part of t.split(/\s+/)) {
    const m = part.match(/^([\w.-]+)=([^=\s]+)$/);
    if (!m) throw new Error(`"${part}" should look like key=value or key=a|b`);
    out[m[1]] = m[2].split('|');
  }
  return out;
}

export function parseAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.trim().split(/\s+/)) {
    const m = part.match(/^([\w.-]+)=([^=\s]+)$/);
    if (!m) throw new Error(`"${part}" should look like key=value`);
    out[m[1]] = m[2];
  }
  return out;
}

// ─── CIDR / routing ──────────────────────────────────────────

export function intToIp(n: number): string {
  return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
}

/** First and last address of a block (as ints) and the address count. */
export function cidrSpan(cidr: string): { first: number; last: number; size: number } {
  const { base, bits } = parseCidr(cidr);
  const size = 2 ** (32 - bits);
  const first = Math.floor(base / size) * size;
  return { first, last: first + size - 1, size };
}

/** Is `inner` fully contained in `outer`? (range comparison) */
export function cidrWithin(inner: string, outer: string): boolean {
  const a = cidrSpan(inner);
  const b = cidrSpan(outer);
  return a.first >= b.first && a.last <= b.last;
}

export interface Route {
  cidr: string;
  target: string;
}

/** Longest-prefix match over a route table. Returns the route index or -1. Ties keep the first. */
export function lpmIndex(routes: Route[], ip: string): number {
  const n = ipToInt(ip);
  let best = -1;
  let bestBits = -1;
  routes.forEach((rt, i) => {
    const { bits } = parseCidr(rt.cidr);
    const { first, last } = cidrSpan(rt.cidr);
    if (n >= first && n <= last && bits > bestBits) {
      best = i;
      bestBits = bits;
    }
  });
  return best;
}

// ─── Linux permission bits ───────────────────────────────────

const SYM = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];

export function modeToSym(mode: number): string {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) throw new Error('Mode must be between 0 and 777 (octal)');
  return SYM[(mode >> 6) & 7] + SYM[(mode >> 3) & 7] + SYM[mode & 7];
}

export function symToMode(sym: string): number {
  if (!/^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/.test(sym)) throw new Error(`"${sym}" should look like rwxr-xr--`);
  let n = 0;
  for (let i = 0; i < 9; i++) n = n * 2 + (sym[i] === '-' ? 0 : 1);
  return n;
}

export function parseOctal(text: string): number {
  if (!/^[0-7]{3}$/.test(text.trim())) throw new Error(`"${text}" should be three octal digits like 754`);
  return parseInt(text.trim(), 8);
}

export const tone = (ok: boolean, yes: Tone = 'found', no: Tone = 'error'): Tone => (ok ? yes : no);

/** Python glob helper for IAM-style wildcards in hidden harnesses. */
export const GLOB_PY = `
from fnmatch import fnmatchcase
`;
