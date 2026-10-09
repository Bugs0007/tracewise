import { useEffect, useMemo, useRef, useState } from 'react';
import { PROJECTS } from '@/content/capstone';
import { CAPSTONE_HARNESS, type CapstoneProject, type MockReq } from '@/content/capstone/types';
import { backendFetcher, preloadPython, runTask, type RunResult } from '@/runner';
import { answerFetch, compileForSandbox, sandboxSrcdoc } from '@/runner/reactSandbox';
import { CodeEditor } from '@/ui/CodeEditor';
import { CodeBlock, Md } from '@/ui/common';
import { Icon } from '@/ui/Icon';
import { PyBadge, Results } from '@/features/TaskRunner';
import { href, navigate } from '@/router';
import { useApp } from '@/store/store';
import '@/features/task.css';
import './pages.css';

export default function CapstonePage({ id }: { id?: string }) {
  const project = PROJECTS.find((p) => p.id === id);
  const saved = useApp((s) => s.capstone);
  if (project) return <Workspace key={project.id} project={project} />;
  return (
    <div className="page">
      <h1>Capstone: build a full-stack app by hand</h1>
      <p className="muted" style={{ maxWidth: '62ch' }}>
        A Python backend written against minidjango (models, endpoints, validation, auth) runs in your browser, and a React frontend talks to it through an in-browser mock network. Milestones are checked automatically. Hints come in two tiers, and a milestone's full solution unlocks only after both hints and a few failed checks. There is no AI help.
      </p>
      <div className="ledger" style={{ marginTop: 20 }}>
        {PROJECTS.map((p) => {
          const st = saved[p.id];
          const n = p.milestones.length;
          const done = st?.done ? n : (st?.milestone ?? 0);
          return (
            <a key={p.id} className="ledger-row" href={href(`/capstone/${p.id}`)} data-testid={`capstone-${p.id}`}>
              <div className="ledger-name">
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
              </div>
              <div className="ticks" aria-hidden>
                {p.milestones.map((m, i) => (
                  <i key={m.id} title={m.title} className={i < done ? 'done' : i === done ? 'next' : ''} />
                ))}
              </div>
              <div className="ledger-count">
                <b>{done}</b> of {n}
              </div>
            </a>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 22 }}>
        <a className="btn" href={href('/certificate')}>
          Progress certificate
        </a>
      </div>
    </div>
  );
}

function Workspace({ project }: { project: CapstoneProject }) {
  const saved = useApp((s) => s.capstone[project.id]);
  const setCapstone = useApp((s) => s.setCapstone);
  const awardXp = useApp((s) => s.awardXp);
  const addBadge = useApp((s) => s.addBadge);
  const spendHint = useApp((s) => s.spendHint);
  const [backend, setBackend] = useState(saved?.backend || project.backendStarter);
  const [frontend, setFrontend] = useState(saved?.frontend || project.frontendStarter);
  const reached = saved?.done ? project.milestones.length : (saved?.milestone ?? 0);
  const [viewing, setViewing] = useState(Math.min(reached, project.milestones.length - 1));
  const [tab, setTab] = useState<'backend' | 'frontend'>(project.milestones[viewing].part);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [hintTier, setHintTier] = useState(0);
  const [fails, setFails] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const m = project.milestones[viewing];
  const codeRef = useRef({ backend, frontend });
  codeRef.current = { backend, frontend };

  useEffect(() => {
    void preloadPython().catch(() => undefined);
  }, []);

  // persist drafts
  useEffect(() => {
    const t = setTimeout(() => setCapstone(project.id, { backend, frontend }), 500);
    return () => clearTimeout(t);
  }, [backend, frontend, project.id, setCapstone]);

  useEffect(() => {
    setResult(null);
    setHintTier(0);
    setFails(0);
    setTab(m.part);
  }, [viewing, m.part]);

  const check = async () => {
    setRunning(true);
    const { backend: b, frontend: f } = codeRef.current;
    const r =
      m.part === 'backend'
        ? await runTask({ language: 'python', fnName: 'app', harness: CAPSTONE_HARNESS, adapter: 'run_requests', tests: m.tests }, b, { timeoutMs: 15000 })
        : await runTask({ language: 'jsx', fnName: 'App', reactTests: m.reactTests }, f, { timeoutMs: 30000, onFetch: backendFetcher(() => b, [...(m.seed ?? [])] as MockReq[]) });
    setRunning(false);
    setResult(r);
    if (r.status !== 'pass') {
      setFails((x) => x + 1);
      return;
    }
    if (viewing === reached) {
      const next = viewing + 1;
      const finished = next >= project.milestones.length;
      setCapstone(project.id, { milestone: Math.min(next, project.milestones.length), done: finished ? new Date().toISOString() : undefined, backend: b, frontend: f });
      awardXp(40);
      if (finished) {
        awardXp(200);
        addBadge('capstone', `Capstone: ${project.title}`);
      }
      setPreviewKey((k) => k + 1);
    }
  };

  const canReveal = hintTier >= 2 && fails >= 3;

  return (
    <div className="page wide">
      <div className="row">
        <a href={href('/capstone')} className="dim">
          ← Capstone
        </a>
        <span className="spacer" />
        <PyBadge lang="python" />
      </div>
      <h1 style={{ margin: '6px 0 12px' }}>{project.title}</h1>
      <div className="capstone-grid">
        <aside className="col" style={{ gap: 6 }} aria-label="Milestones">
          {project.milestones.map((ms, i) => {
            const state = i < reached ? 'done' : i === reached ? 'current' : 'locked';
            return (
              <button key={ms.id} className={`step-tab${state === 'done' ? ' done' : ''}`} aria-current={i === viewing ? 'step' : undefined} disabled={state === 'locked'} onClick={() => setViewing(i)} style={{ justifyContent: 'flex-start', textAlign: 'left' }} data-testid={`milestone-${ms.id}`}>
                <span className="num">{state === 'done' ? <Icon name="check" size={13} /> : state === 'locked' ? <Icon name="lock" size={12} /> : i + 1}</span>
                <span>
                  <span className="dim" style={{ fontSize: 13, display: 'block' }}>
                    {ms.part === 'backend' ? 'Backend' : 'Frontend'}
                  </span>
                  {ms.title}
                </span>
              </button>
            );
          })}
          {saved?.done && (
            <button className="btn primary" onClick={() => navigate('/certificate')}>
              <Icon name="certificate" size={15} /> Certificate
            </button>
          )}
        </aside>
        <section className="col" style={{ gap: 12, minWidth: 0 }}>
          <div className="card flat">
            <div className="row">
              <span className="chip accent">{m.part === 'backend' ? 'backend.py' : 'App.jsx'}</span>
              <strong>{m.title}</strong>
            </div>
            <p style={{ margin: '8px 0 0' }}>
              <Md text={m.brief} />
            </p>
          </div>
          <div className="row">
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'backend'} onClick={() => setTab('backend')}>
                backend.py
              </button>
              <button role="tab" aria-selected={tab === 'frontend'} onClick={() => setTab('frontend')}>
                App.jsx
              </button>
            </div>
            <span className="spacer" />
            {hintTier < 2 && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  spendHint(project.id, 5);
                  setHintTier((t) => t + 1);
                }}
              >
                <Icon name="bulb" size={14} /> {hintTier === 0 ? 'Nudge' : 'Bigger hint'} (−5 XP)
              </button>
            )}
            {hintTier >= 2 && (
              <button className="btn sm ghost" disabled={!canReveal} onClick={() => setHintTier(3)} title={canReveal ? 'Show the reference for this milestone' : 'Unlocks after both hints and 3 failed checks'}>
                <Icon name="eye" size={14} /> Final reveal {canReveal ? '' : `(${Math.max(0, 3 - fails)} more tries)`}
              </button>
            )}
            <button className="btn primary" onClick={check} disabled={running} data-testid="check-milestone">
              {running ? <span className="spin" /> : <Icon name="check" size={14} />} Check milestone
            </button>
          </div>
          {tab === 'backend' ? (
            <CodeEditor key="be" value={backend} onChange={setBackend} language="python" onRun={check} minHeight={360} ariaLabel="backend.py" />
          ) : (
            <CodeEditor key="fe" value={frontend} onChange={setFrontend} language="jsx" onRun={check} minHeight={360} ariaLabel="App.jsx" />
          )}
          {hintTier >= 1 && (
            <div className="callout warn hint">
              <strong>Nudge:</strong> <Md text={m.hints[0]} />
            </div>
          )}
          {hintTier >= 2 && (
            <div className="callout warn hint">
              <strong>Bigger hint:</strong> <Md text={m.hints[1]} />
            </div>
          )}
          {hintTier >= 3 && (
            <div className="hint">
              <div className="eyebrow">Reference for this milestone — read it, close it, write your own</div>
              <CodeBlock code={m.reveal} lang={m.part === 'backend' ? 'python' : 'javascript'} />
            </div>
          )}
          <Results result={result} />
          {result?.status === 'pass' && <div className="callout good pop">Milestone complete! {viewing + 1 < project.milestones.length ? 'Next one unlocked.' : 'You built the whole app.'}</div>}
        </section>
        <section className="col" style={{ gap: 8, minWidth: 0 }}>
          <Preview key={previewKey} backend={backend} frontend={frontend} />
        </section>
      </div>
    </div>
  );
}

function Preview({ backend, frontend }: { backend: string; frontend: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const history = useRef<MockReq[]>([]);
  const [log, setLog] = useState<{ method: string; url: string; status: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const codes = useRef({ backend, frontend });
  codes.current = { backend, frontend };
  const srcdoc = useMemo(() => sandboxSrcdoc(), []);

  useEffect(() => {
    const fetcher = backendFetcher(() => codes.current.backend, history.current);
    const onMsg = async (ev: MessageEvent) => {
      const el = iframe.current;
      if (!el || ev.source !== el.contentWindow) return;
      const msg = ev.data ?? {};
      if (msg.type === 'ready') {
        const c = compileForSandbox(codes.current.frontend);
        if (c.error) setError(c.error);
        else {
          setError(null);
          el.contentWindow?.postMessage({ type: 'preview', code: c.js, fnName: 'App' }, '*');
        }
      } else if (msg.type === 'fetch') {
        await answerFetch(el, msg, async (req) => {
          const res = await fetcher(req);
          setLog((l) => [...l.slice(-30), { method: req.method, url: req.url, status: res.status }]);
          return res;
        });
      } else if (msg.type === 'result' && msg.error) setError(msg.error);
      else if (msg.type === 'runtime-error') setError(msg.error);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <>
      <div className="row">
        <h3 style={{ margin: 0 }}>Live preview</h3>
        <span className="spacer" />
        <button className="btn sm" onClick={() => setNonce((n) => n + 1)} data-testid="reload-preview">
          <Icon name="reset" size={13} /> Reload
        </button>
        <button
          className="btn sm ghost"
          onClick={() => {
            history.current.length = 0;
            setLog([]);
            setNonce((n) => n + 1);
          }}
          title="Forget all data created in the preview"
        >
          Reset data
        </button>
      </div>
      <iframe key={nonce} ref={iframe} title="App preview" sandbox="allow-scripts" srcDoc={srcdoc} style={{ width: '100%', height: 360, border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }} />
      {error && <div className="callout bad mono" style={{ fontSize: 13 }}>{error}</div>}
      <h3 style={{ margin: 0 }}>Network</h3>
      <div className="logp" style={{ maxHeight: 160 }} aria-label="Requests made by the preview">
        {log.length === 0 && <span className="dim">No requests yet</span>}
        {log.map((l, i) => (
          <div key={i} data-tone={l.status >= 400 ? 'error' : 'done'}>
            {l.method} {l.url} → {l.status}
          </div>
        ))}
      </div>
    </>
  );
}
