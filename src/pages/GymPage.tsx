import { useEffect, useMemo, useRef, useState } from 'react';
import { GYM, type GymSnippet } from '@/content/gym';
import { useApp } from '@/store/store';
import { Icon } from '@/ui/Icon';
import { playSound } from '@/lib/sound';
import './pages.css';

const LANG_LABEL: Record<GymSnippet['lang'], string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'React' };

export default function GymPage() {
  const groups = useMemo(() => [...new Set(GYM.map((g) => g.group))], []);
  const [group, setGroup] = useState(groups[0]);
  const [snip, setSnip] = useState<GymSnippet>(GYM[0]);
  const best = useApp((s) => s.gym.bestWpm);
  const sessions = useApp((s) => s.gym.sessions);
  const inGroup = GYM.filter((g) => g.group === group);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">Muscle memory</div>
          <h1 style={{ margin: 0 }}>Syntax Gym</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Retype real idioms until your fingers know them. Wrong keys don't advance — accuracy first, speed follows. Indentation after <kbd>Enter</kbd> is automatic.
          </p>
        </div>
        <div className="row">
          <span className="chip accent">best {best} WPM</span>
          <span className="chip">{sessions} reps</span>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        {groups.map((g) => (
          <button
            key={g}
            className={`btn sm ${g === group ? 'primary' : ''}`}
            onClick={() => {
              setGroup(g);
              setSnip(GYM.find((x) => x.group === g)!);
            }}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        {inGroup.map((g) => (
          <button key={g.id} className={`btn sm ${g.id === snip.id ? '' : 'ghost'}`} onClick={() => setSnip(g)} aria-pressed={g.id === snip.id}>
            {g.title}
          </button>
        ))}
      </div>
      <Typer
        key={snip.id}
        snippet={snip}
        onNext={() => {
          const i = GYM.indexOf(snip);
          const n = GYM[(i + 1) % GYM.length];
          setGroup(n.group);
          setSnip(n);
        }}
      />
    </div>
  );
}

function Typer({ snippet, onNext }: { snippet: GymSnippet; onNext: () => void }) {
  const target = snippet.code;
  const [pos, setPos] = useState(0);
  const [errors, setErrors] = useState(0);
  const [bad, setBad] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const recordGym = useApp((s) => s.recordGym);
  const awardXp = useApp((s) => s.awardXp);
  const sound = useApp((s) => s.settings.sound);

  useEffect(() => ta.current?.focus(), []);

  const skipIndent = (p: number) => {
    while (p < target.length && target[p] === ' ') p++;
    return p;
  };

  const press = (key: string) => {
    if (end) return;
    const now = performance.now();
    if (start === null) setStart(now);
    const want = target[pos];
    let next = -1;
    if (key === 'Enter' && want === '\n') next = skipIndent(pos + 1);
    else if (key === 'Tab' && want === ' ') next = Math.min(skipIndent(pos), pos + 4);
    else if (key.length === 1 && key === want) next = pos + 1;
    if (next < 0) {
      setErrors((e) => e + 1);
      setBad(true);
      setTimeout(() => setBad(false), 180);
      if (sound) playSound('tick');
      return;
    }
    setPos(next);
    if (next >= target.length) {
      setEnd(now);
      const mins = (now - (start ?? now)) / 60000 || 1 / 60;
      const wpm = target.length / 5 / mins;
      recordGym(wpm);
      awardXp(Math.min(15, 5 + Math.floor(wpm / 10)));
    }
  };

  const restart = () => {
    setPos(0);
    setErrors(0);
    setStart(null);
    setEnd(null);
    ta.current?.focus();
  };

  const elapsed = start ? ((end ?? performance.now()) - start) / 1000 : 0;
  const wpm = elapsed > 0 ? Math.round(pos / 5 / (elapsed / 60)) : 0;
  const acc = pos + errors > 0 ? Math.round((pos / (pos + errors)) * 100) : 100;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <span className="chip accent">{LANG_LABEL[snippet.lang]}</span>
        <strong>{snippet.title}</strong>
        <span className="spacer" />
        <span className="mono dim">
          {pos}/{target.length}
        </span>
      </div>
      <div
        className={`gym-text${focused ? ' active' : ''}${bad ? ' shake' : ''}`}
        onClick={() => ta.current?.focus()}
        data-testid="gym-text"
      >
        <textarea
          ref={ta}
          className="gym-hidden"
          aria-label={`Type the snippet: ${snippet.title}`}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'Enter' || e.key === 'Tab' || e.key.length === 1) {
              e.preventDefault();
              press(e.key);
            }
          }}
          value=""
          onChange={() => undefined}
        />
        {target.split('').map((ch, i) => {
          const cls = i < pos ? 'c-ok' : i === pos ? (bad ? 'c-bad' : 'c-cur') : 'c-todo';
          if (ch === '\n')
            return (
              <span key={i} className={cls}>
                <span className="nl">⏎</span>
                {'\n'}
              </span>
            );
          return (
            <span key={i} className={cls}>
              {ch}
            </span>
          );
        })}
      </div>
      <div className="row" style={{ gap: 26 }}>
        <div>
          <div className="big-num">{wpm}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            WPM
          </div>
        </div>
        <div>
          <div className="big-num">{acc}%</div>
          <div className="dim" style={{ fontSize: 12 }}>
            accuracy
          </div>
        </div>
        <div>
          <div className="big-num">{errors}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            misses
          </div>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={restart}>
          <Icon name="reset" size={15} /> Restart
        </button>
        {end && (
          <button className="btn primary pop" onClick={onNext} autoFocus>
            Next snippet
          </button>
        )}
      </div>
      {end && (
        <div className="callout good pop" data-testid="gym-done">
          Done in {elapsed.toFixed(1)}s — {wpm} WPM at {acc}% accuracy.
        </div>
      )}
    </div>
  );
}
