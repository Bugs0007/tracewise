// Groq client for the in-app AI help. The learner brings their own API key; calls go from the browser straight to
// Groq's OpenAI-compatible API (it allows browser requests), so there is no backend and nothing of ours sees the key.
//
// The key lives only in this browser's localStorage under its own entry. It is deliberately NOT part of the progress
// save, the export file or the cloud sync, and it is never put in a URL or logged.
import { useSyncExternalStore } from 'react';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';
const STORE = 'tracewise:ai';

export interface AiConfig {
  key: string;
  model: string;
  /** let the tutor write complete solutions when asked (off by default: it coaches instead) */
  fullSolutions: boolean;
}

const EMPTY: AiConfig = { key: '', model: '', fullSolutions: false };

// ─── config store (localStorage, per device) ───

const subs = new Set<() => void>();

function readConfig(): AiConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (!raw || typeof raw !== 'object') return EMPTY;
    return {
      key: typeof raw.key === 'string' ? raw.key : '',
      model: typeof raw.model === 'string' ? raw.model : '',
      fullSolutions: raw.fullSolutions === true,
    };
  } catch {
    return EMPTY;
  }
}

let current: AiConfig = readConfig();

export function getAiConfig(): AiConfig {
  return current;
}

export function setAiConfig(patch: Partial<AiConfig>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORE, JSON.stringify(current));
  } catch {
    // private mode: the key lasts for this tab only
  }
  subs.forEach((f) => f());
}

export function clearAiKey(): void {
  current = { ...current, key: '', model: '' };
  try {
    if (current.fullSolutions) localStorage.setItem(STORE, JSON.stringify(current));
    else localStorage.removeItem(STORE);
  } catch {
    // ignore
  }
  subs.forEach((f) => f());
}

export function useAiConfig(): AiConfig {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    () => current,
    () => EMPTY,
  );
}

/** "gsk_…WxYz": enough to recognise the key, never the whole thing. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

// ─── errors ───

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'server' | 'bad' | 'aborted';

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/** A friendly message for the learner; never includes the key. */
export function describeError(e: unknown): string {
  if (!(e instanceof AiError)) return 'Something went wrong talking to the AI. Try again.';
  switch (e.kind) {
    case 'auth':
      return 'Groq did not accept this API key. Check that it is copied completely and still active.';
    case 'rate':
      return `Groq is rate limiting this key${e.retryAfter ? `: try again in ${Math.ceil(e.retryAfter)} seconds` : ': wait a moment and try again'}.`;
    case 'network':
      return 'Could not reach Groq. Check your connection (or any ad or privacy blocker) and try again.';
    case 'server':
      return 'Groq had a problem on its side. Try again in a moment.';
    case 'aborted':
      return 'Stopped.';
    default:
      return e.message || 'Groq rejected the request.';
  }
}

async function failFrom(res: Response): Promise<AiError> {
  let detail = '';
  try {
    const j = await res.json();
    detail = typeof j?.error?.message === 'string' ? j.error.message : '';
  } catch {
    // not JSON
  }
  if (res.status === 401 || res.status === 403) return new AiError('auth', detail || 'unauthorized');
  if (res.status === 429) return new AiError('rate', detail || 'rate limited', Number(res.headers.get('retry-after')) || undefined);
  if (res.status >= 500) return new AiError('server', detail || `server error ${res.status}`);
  return new AiError('bad', detail ? `Groq said: ${detail}` : `Groq rejected the request (${res.status}).`);
}

// ─── models ───

const NOT_CHAT = /whisper|guard|tts|playai|orpheus|embed|safeguard|transcri/i;
const PREFERRED = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'];

/** Chat-capable models for this key. Doubles as the "is this key valid?" check. */
export async function listModels(key: string, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<string[]> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: opts.signal });
  } catch (e) {
    throw (e as Error)?.name === 'AbortError' ? new AiError('aborted', 'aborted') : new AiError('network', 'network');
  }
  if (!res.ok) throw await failFrom(res);
  const body = await res.json().catch(() => null);
  const data: { id?: unknown; active?: unknown }[] = Array.isArray(body?.data) ? body.data : [];
  const ids = data.filter((m) => typeof m.id === 'string' && m.active !== false && !NOT_CHAT.test(m.id as string)).map((m) => m.id as string);
  return [...new Set(ids)].sort();
}

/** The best model on offer: a known-good default if present, otherwise the first one. */
export function pickModel(ids: string[]): string {
  return PREFERRED.find((p) => ids.includes(p)) ?? ids[0] ?? '';
}

// ─── chat ───

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Remove <think>…</think> blocks some reasoning models put in the answer, including a block still open mid-stream. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').replace(/^\s+/, '');
}

export interface StreamOptions {
  key: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** called with the whole reply so far each time more text arrives */
  onText?: (soFar: string) => void;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
}

/** Stream a chat completion; resolves with the full reply. */
export async function streamChat(o: StreamOptions): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${o.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: o.model, messages: o.messages, stream: true, temperature: 0.3, max_completion_tokens: o.maxTokens ?? 900 }),
      signal: o.signal,
    });
  } catch (e) {
    throw (e as Error)?.name === 'AbortError' ? new AiError('aborted', 'aborted') : new AiError('network', 'network');
  }
  if (!res.ok) throw await failFrom(res);
  if (!res.body) {
    // no streaming available: read the whole answer at once
    const j = await res.json().catch(() => null);
    const text = String(j?.choices?.[0]?.message?.content ?? '');
    o.onText?.(stripThinking(text));
    return stripThinking(text);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece) {
            full += piece;
            o.onText?.(stripThinking(full));
          }
        } catch {
          // a partial or keep-alive line
        }
      }
    }
  } catch (e) {
    throw (e as Error)?.name === 'AbortError' ? new AiError('aborted', 'aborted') : new AiError('network', 'network');
  }
  return stripThinking(full);
}
