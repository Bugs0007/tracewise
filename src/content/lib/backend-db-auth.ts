// Shared helpers for the M2 "databases & auth" units: caption safety net,
// a tiny pure-TS SHA-256 / HMAC / PBKDF2 (so visualizers can show REAL digests
// synchronously), base64url, and a sequence-diagram builder.
import type { Recorder } from '@/engine/recorder';
import type { Panel, SequenceMessage, SequencePanel, Tone } from '@/engine/types';

/** Keep captions short and on one line (the engine shows them in a narrow strip). */
export const cap = (s: string, n = 90): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');

/** Recorder.step with the caption length guard applied. */
export function step(r: Recorder, at: string | number | undefined, caption: string, panels: Panel[], vars: Record<string, unknown> = {}): void {
  r.step(at, cap(caption), panels, vars);
}

export const short = (s: string, n = 14): string => (s.length <= n ? s : s.slice(0, n) + '…');

// ───────────────────────── bytes, hex, base64url ─────────────────────────

export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

const bytesOf = (x: string | Uint8Array): Uint8Array => (typeof x === 'string' ? utf8(x) : x);

export function toHex(b: Uint8Array): string {
  let s = '';
  for (const v of b) s += v.toString(16).padStart(2, '0');
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding, like the JWT spec. */
export function b64url(x: string | Uint8Array): string {
  const b = bytesOf(x);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < b.length) out += B64[(n >> 6) & 63];
    if (i + 2 < b.length) out += B64[n & 63];
  }
  return out;
}

// ───────────────────────── SHA-256 / HMAC / PBKDF2 ─────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: string | Uint8Array): Uint8Array {
  const msg = bytesOf(data);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  const h = Uint32Array.from(H0);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  h.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const o = new Uint8Array(a.length + b.length);
  o.set(a);
  o.set(b, a.length);
  return o;
};

export function hmacSha256(key: string | Uint8Array, msg: string | Uint8Array): Uint8Array {
  let k = bytesOf(key);
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  k.forEach((v, i) => {
    ipad[i] ^= v;
    opad[i] ^= v;
  });
  return sha256(concat(opad, sha256(concat(ipad, bytesOf(msg)))));
}

/** PBKDF2-HMAC-SHA256, one 32-byte block (same as hashlib.pbkdf2_hmac("sha256", pw, salt, n)). */
export function pbkdf2Sha256(password: string, salt: string, iterations: number): Uint8Array {
  let u = hmacSha256(password, concat(utf8(salt), Uint8Array.from([0, 0, 0, 1])));
  const out = Uint8Array.from(u);
  for (let i = 1; i < iterations; i++) {
    u = hmacSha256(password, u);
    for (let j = 0; j < out.length; j++) out[j] ^= u[j];
  }
  return out;
}

// ───────────────────────── sequence diagrams ─────────────────────────

/** Accumulates messages; every `panel()` call is a snapshot with the newest message active. */
export class Seq {
  readonly messages: SequenceMessage[] = [];
  constructor(
    readonly actors: string[],
    readonly title?: string,
  ) {}

  send(from: string, to: string, label: string, tone?: Tone, dashed = false): number {
    this.messages.push({ from, to, label, tone, dashed });
    return this.messages.length - 1;
  }

  panel(): SequencePanel {
    return { type: 'sequence', title: this.title, actors: this.actors, messages: this.messages.map((m) => ({ ...m })), active: this.messages.length - 1 };
  }
}
