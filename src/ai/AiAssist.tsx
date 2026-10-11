// The AI help panel: docked beside the editor on wide screens, a full-screen sheet on phones and tablets.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/ui/Icon';
import { AiError, clearAiKey, describeError, listModels, maskKey, pickModel, setAiConfig, streamChat, useAiConfig } from './groq';
import { ACTION_LABEL, ACTION_PROMPT, buildMessages, type AssistAction, type AssistContext } from './prompt';
import { Reply } from './Reply';
import './ai.css';

// ─── key setup and management ───

const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

/** Setup form when there is no key; connection details (key, model, remove) when there is one. */
export function AiKeyForm({ onConnected }: { onConnected?: () => void }) {
  const cfg = useAiConfig();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // when connected, fetch the model list for the picker (quietly: the current model stays selectable if this fails)
  useEffect(() => {
    if (!cfg.key) return;
    const ac = new AbortController();
    listModels(cfg.key, { signal: ac.signal })
      .then((ids) => alive.current && setModels(ids))
      .catch(() => undefined);
    return () => ac.abort();
  }, [cfg.key]);

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key) return setError('Paste your Groq API key first.');
    if (/\s/.test(key)) return setError('A key has no spaces. Check what you pasted.');
    setBusy(true);
    setError('');
    try {
      const ids = await listModels(key);
      if (!alive.current) return;
      setAiConfig({ key, model: pickModel(ids) || FALLBACK_MODEL });
      setModels(ids);
      setValue('');
      onConnected?.();
    } catch (err) {
      if (alive.current) setError(describeError(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (cfg.key) {
    const options = models.includes(cfg.model) || !cfg.model ? models : [cfg.model, ...models];
    return (
      <div className="ai-key connected" data-testid="ai-connected">
        <div className="ai-key-row">
          <span className="chip good">
            <Icon name="check" size={13} /> Connected
          </span>
          <code data-testid="ai-key-mask">{maskKey(cfg.key)}</code>
        </div>
        <label className="ai-field">
          Model
          <select className="input" value={cfg.model} onChange={(e) => setAiConfig({ model: e.target.value })} data-testid="ai-model">
            {options.length ? options.map((m) => <option key={m}>{m}</option>) : <option>{cfg.model || FALLBACK_MODEL}</option>}
          </select>
        </label>
        <button className="btn sm" onClick={clearAiKey} data-testid="ai-remove-key">
          Remove my key from this browser
        </button>
      </div>
    );
  }

  return (
    <form className="ai-key" onSubmit={connect} data-testid="ai-setup">
      <p>
        <strong>Get unstuck with AI.</strong> Bring your own Groq API key. Create one at{' '}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
          console.groq.com/keys
        </a>
        .
      </p>
      <label className="ai-field">
        Groq API key
        <span className="ai-keybox">
          <input
            className="input"
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="gsk_…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={!!error}
            data-testid="ai-key-input"
          />
          <button type="button" className="btn sm ghost" onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      {error && (
        <div className="callout bad" role="alert" data-testid="ai-key-error">
          {error}
        </div>
      )}
      <button className="btn primary" type="submit" disabled={busy} data-testid="ai-connect">
        {busy ? <span className="spin" /> : null} {busy ? 'Checking…' : 'Save and connect'}
      </button>
      <p className="dim ai-note">
        The key is kept only in this browser. It is not part of your progress, your export or any cloud sync, and it is sent only to Groq. When you ask for help, your code and the problem text go to Groq too.
      </p>
    </form>
  );
}

// ─── chat ───

interface Turn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** what to show for a user turn that came from a button */
  label?: string;
  error?: string;
  streaming?: boolean;
}

/** Conversations survive closing the panel and switching between dock and sheet, for the length of the visit. */
const chats = new Map<string, Turn[]>();
let turnId = 0;

export interface AssistRequest {
  id: number;
  action: AssistAction;
}

export interface AiAssistPanelProps {
  /** one conversation per problem */
  chatId: string;
  /** read at the moment of sending, so the tutor always sees the current code and test results */
  getContext: () => AssistContext;
  request?: AssistRequest | null;
  /** called once the panel has picked up `request`, so the parent can clear it */
  onRequestConsumed?: () => void;
  onClose?: () => void;
  /** whether the tests have been run at least once (the "why did they fail" button needs a result) */
  hasResult?: boolean;
  autoFocus?: boolean;
}

export function AiAssistPanel({ chatId, getContext, request, onRequestConsumed, onClose, hasResult, autoFocus }: AiAssistPanelProps) {
  const cfg = useAiConfig();
  const [turns, setTurns] = useState<Turn[]>(() => chats.get(chatId) ?? []);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [manage, setManage] = useState(false);
  const turnsRef = useRef(turns);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const handled = useRef(0);

  const commit = useCallback(
    (next: Turn[]) => {
      turnsRef.current = next;
      chats.set(chatId, next.filter((t) => !t.streaming));
      setTurns(next);
    },
    [chatId],
  );

  // keep the newest text in view while it streams
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    // on a phone, focusing the box would raise the keyboard over the conversation straight away
    if (autoFocus && window.matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, [autoFocus]);

  const send = useCallback(
    async (ask: string, label?: string) => {
      const text = ask.trim();
      if (!text || busy || !cfg.key) return;
      setManage(false);
      const history = turnsRef.current.filter((t) => !t.error && !t.streaming).map((t) => ({ role: t.role, text: t.text }));
      const messages = buildMessages({ ctx: getContext(), history, ask: text, allowSolution: cfg.fullSolutions });
      const reply: Turn = { id: ++turnId, role: 'assistant', text: '', streaming: true };
      commit([...turnsRef.current, { id: ++turnId, role: 'user', text, label }, reply]);
      setBusy(true);
      const ac = new AbortController();
      abort.current = ac;
      const patch = (p: Partial<Turn>) => commit(turnsRef.current.map((t) => (t.id === reply.id ? { ...t, ...p } : t)));
      try {
        const full = await streamChat({ key: cfg.key, model: cfg.model || FALLBACK_MODEL, messages, signal: ac.signal, onText: (s) => patch({ text: s }) });
        patch(full.trim() ? { text: full, streaming: false } : { streaming: false, error: 'The model sent back an empty answer. Try asking again.' });
      } catch (e) {
        const aborted = e instanceof AiError && e.kind === 'aborted';
        const partial = turnsRef.current.find((t) => t.id === reply.id)?.text ?? '';
        patch(aborted && partial ? { streaming: false } : { streaming: false, error: describeError(e), ...(e instanceof AiError && e.kind === 'auth' ? { text: '' } : {}) });
        if (e instanceof AiError && e.kind === 'auth') setManage(true);
      } finally {
        setBusy(false);
        abort.current = null;
      }
    },
    [busy, cfg.key, cfg.model, cfg.fullSolutions, commit, getContext],
  );

  // a button elsewhere on the page (for example "Ask AI why" under failed tests) can start a request
  useEffect(() => {
    if (request && request.id !== handled.current) {
      handled.current = request.id;
      void send(ACTION_PROMPT[request.action], ACTION_LABEL[request.action]);
      onRequestConsumed?.();
    }
  }, [request, send, onRequestConsumed]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim()) return;
    void send(draft);
    setDraft('');
  };

  const connected = !!cfg.key && !manage;
  return (
    <section className="ai-panel" aria-label="AI help" data-testid="ai-panel">
      <header className="ai-head">
        <Icon name="sparkle" size={16} />
        <h3>AI help</h3>
        {cfg.key && cfg.model && <span className="chip ai-model-chip">{cfg.model}</span>}
        <span className="spacer" />
        {cfg.key && (
          <button className="btn icon sm ghost" onClick={() => setManage((m) => !m)} aria-pressed={manage} aria-label="AI settings" title="AI settings" data-testid="ai-settings">
            <Icon name="settings" size={16} />
          </button>
        )}
        {onClose && (
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Close AI help" data-testid="ai-close">
            <Icon name="x" size={16} />
          </button>
        )}
      </header>

      {!connected ? (
        <div className="ai-body">
          <AiKeyForm onConnected={() => setManage(false)} />
          {cfg.key && (
            <div className="ai-solutions">
              <span>
                <strong>Allow full solutions</strong>
                <small className="dim">Off: the tutor gives hints and questions, not the answer.</small>
              </span>
              <button className="toggle" role="switch" aria-checked={cfg.fullSolutions} aria-label="Allow full solutions" onClick={() => setAiConfig({ fullSolutions: !cfg.fullSolutions })} data-testid="ai-full-solutions" />
            </div>
          )}
          {turns.some((t) => t.error) && turns[turns.length - 1]?.error && (
            <div className="callout bad" role="alert">
              {turns[turns.length - 1].error}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="ai-log" ref={log} role="log" aria-live="polite" aria-busy={busy} tabIndex={0} aria-label="Conversation" data-testid="ai-log">
            {turns.length === 0 && (
              <p className="dim ai-empty">
                Stuck? Pick one of the buttons below or ask your own question. I can see your code and your latest test results, and I will nudge you toward the answer rather than hand it over.
              </p>
            )}
            {turns.map((t) => (
              <div key={t.id} className={`ai-turn ${t.role}`} data-testid={`ai-turn-${t.role}`}>
                {t.role === 'user' ? (
                  <p>{t.label ?? t.text}</p>
                ) : (
                  <>
                    {t.text && <Reply text={t.text} />}
                    {t.streaming && !t.text && <span className="dim">Thinking…</span>}
                    {t.error && (
                      <div className="callout bad" role="alert" data-testid="ai-error">
                        {t.error}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="ai-actions" role="group" aria-label="Quick questions">
            {(Object.keys(ACTION_LABEL) as AssistAction[]).map((a) => (
              <button key={a} className="btn sm" disabled={busy || (a === 'why-failed' && !hasResult)} title={a === 'why-failed' && !hasResult ? 'Run the tests first' : undefined} onClick={() => send(ACTION_PROMPT[a], ACTION_LABEL[a])} data-testid={`ai-action-${a}`}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
          <form className="ai-input" onSubmit={submit}>
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) submit(e);
              }}
              rows={2}
              placeholder="Ask about this problem…"
              aria-label="Ask the AI tutor"
              data-testid="ai-input"
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()} data-testid="ai-stop">
                Stop
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={!draft.trim()} data-testid="ai-send">
                Send
              </button>
            )}
          </form>
          <footer className="ai-foot">
            <span className="dim">Your code and this problem are sent to Groq.</span>
            <span className="spacer" />
            {turns.length > 0 && (
              <button className="btn sm ghost" disabled={busy} onClick={() => commit([])} data-testid="ai-clear">
                Clear chat
              </button>
            )}
          </footer>
        </>
      )}
    </section>
  );
}

/** Full-screen version for phones and tablets. */
export function AiSheet({ onClose, ...panel }: AiAssistPanelProps & { onClose: () => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return createPortal(
    <div className="code-sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="code-sheet ai-sheet pop" role="dialog" aria-modal="true" aria-label="AI help" data-testid="ai-sheet">
        <AiAssistPanel {...panel} onClose={onClose} autoFocus />
      </div>
    </div>,
    document.body,
  );
}
