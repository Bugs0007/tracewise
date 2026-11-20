// Plays a Video: each scene is drawn with the same panels and code view as the step player, narrated
// sentence by sentence with the browser's speech engine, with the current sentence as a subtitle.
// Without speech (or when muted) it advances on a reading-speed timer, so subtitles still work.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeLines } from '@/player/CodeView';
import { isWide, PanelView } from '@/player/panels';
import { Icon } from '@/ui/Icon';
import { sentences, speakable, type Scene, type Video } from './script';

const RATES = [0.9, 1, 1.15, 1.3, 1.5];
const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

function pref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`video:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function setPref(key: string, v: unknown) {
  try {
    localStorage.setItem(`video:${key}`, JSON.stringify(v));
  } catch {
    /* storage blocked: the setting lasts for this visit only */
  }
}

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!hasSpeech) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

// The most expressive voices first: Edge's neural voices (Ava, Andrew, Emma, Brian are the liveliest),
// then any other neural voice, then Chrome's Google voices, then whatever the system has.
const LIVELY = ['Ava', 'Andrew', 'Emma', 'Brian', 'Jenny', 'Aria', 'Guy', 'Neerja', 'Prabhat'];
const bestVoice = (vs: SpeechSynthesisVoice[]) =>
  LIVELY.map((n) => vs.find((v) => v.name.includes(n) && /natural/i.test(v.name))).find(Boolean) ??
  vs.find((v) => /natural/i.test(v.name)) ??
  vs.find((v) => /Google (US|UK) English/i.test(v.name)) ??
  vs.find((v) => /Zira|Aria|Heera/.test(v.name)) ??
  vs.find((v) => v.default) ??
  vs[0];

export function VideoPlayer({ video, onEnded, autoStart }: { video: Video; onEnded?: () => void; autoStart?: boolean }) {
  const [scene, setScene] = useState(0);
  const [line, setLine] = useState(0);
  const [playing, setPlaying] = useState(!!autoStart);
  const [muted, setMuted] = useState<boolean>(() => pref('muted', false));
  const [subs, setSubs] = useState<boolean>(() => pref('subs', true));
  const [rate, setRate] = useState<number>(() => pref('rate', 1));
  const [voiceName, setVoiceName] = useState<string>(() => pref('voice', ''));
  const voices = useVoices();
  const voice = voices.find((v) => v.name === voiceName) ?? bestVoice(voices);
  const box = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  const lines = useMemo(() => video.scenes.map((s) => sentences(s.say)), [video]);
  const cur = video.scenes[scene];
  const sub = lines[scene]?.[line] ?? '';

  // a new video starts from the top
  useEffect(() => {
    setScene(0);
    setLine(0);
    setPlaying(!!autoStart);
  }, [video, autoStart]);

  const advance = useCallback(() => {
    if (line + 1 < (lines[scene]?.length ?? 0)) return setLine(line + 1);
    if (scene + 1 < video.scenes.length) {
      setScene(scene + 1);
      setLine(0);
      return;
    }
    setPlaying(false);
    endedRef.current?.();
  }, [line, scene, lines, video.scenes.length]);

  useEffect(() => {
    if (!playing || !sub) return;
    const my = ++token.current;
    const done = () => my === token.current && advance();
    const words = sub.split(/\s+/).length;
    if (muted || !hasSpeech) {
      const t = setTimeout(done, (900 + (words / 2.8) * 1000) / rate);
      return () => clearTimeout(t);
    }
    const u = new SpeechSynthesisUtterance(speakable(sub));
    if (voice) u.voice = voice;
    // a brighter, slightly quicker delivery; a little extra lift on exclamations
    u.rate = rate * 1.06;
    u.pitch = /!\s*$/.test(sub) ? 1.22 : 1.1;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    // some engines drop the end event; never get stuck on one sentence
    const guard = setTimeout(done, (4000 + (words / 1.6) * 1000) / rate);
    return () => {
      clearTimeout(guard);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidates the pending sentence on purpose
      token.current++;
      speechSynthesis.cancel();
    };
  }, [playing, sub, muted, rate, voice, advance, scene, line]);

  useEffect(() => () => void (hasSpeech && speechSynthesis.cancel()), []);

  const jump = (i: number) => {
    setScene(Math.max(0, Math.min(video.scenes.length - 1, i)));
    setLine(0);
  };
  const toggle = () => {
    if (!playing && scene === video.scenes.length - 1 && line === lines[scene].length - 1) {
      jump(0);
    }
    setPlaying((p) => !p);
  };
  const chapters = useMemo(() => {
    const out: { name: string; at: number }[] = [];
    video.scenes.forEach((s, i) => (out.at(-1)?.name !== s.chapter ? out.push({ name: s.chapter, at: i }) : null));
    return out;
  }, [video]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('select,input')) return;
    if (e.key === ' ' || e.key === 'k') toggle();
    else if (e.key === 'ArrowRight') jump(scene + 1);
    else if (e.key === 'ArrowLeft') jump(line > 0 ? scene : scene - 1);
    else if (e.key === 'c') setSubs((s) => (setPref('subs', !s), !s));
    else if (e.key === 'm') setMuted((m) => (setPref('muted', !m), !m));
    else if (e.key === 'f') fullscreen();
    else return;
    e.preventDefault();
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };

  return (
    <div className="vplayer" ref={box} tabIndex={0} onKeyDown={onKey} aria-label={`Video: ${video.title}`} data-testid="video-player">
      <div className="vscreen" onClick={toggle}>
        <SceneView s={cur} />
        {subs && sub && (
          <div className="vsub" aria-live="polite" data-testid="video-subtitle">
            <span>{sub}</span>
          </div>
        )}
        {!playing && scene === 0 && line === 0 && (
          <div className="vbig" aria-hidden>
            <Icon name="play" size={34} />
          </div>
        )}
      </div>

      <div className="vbar" role="group" aria-label="Scenes">
        {video.scenes.map((s, i) => (
          <button key={i} className={i < scene ? 'past' : i === scene ? 'now' : ''} onClick={() => jump(i)} title={`${s.chapter} (${i + 1}/${video.scenes.length})`} aria-label={`Scene ${i + 1}: ${s.chapter}`} />
        ))}
      </div>

      <div className="vctl">
        <button className="btn icon" onClick={() => jump(scene - 1)} aria-label="Previous scene" title="Previous (left arrow)">
          <Icon name="prev" size={16} />
        </button>
        <button className="btn primary icon" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (space)" data-testid="video-play">
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <button className="btn icon" onClick={() => jump(scene + 1)} aria-label="Next scene" title="Next (right arrow)">
          <Icon name="next" size={16} />
        </button>
        <span className="dim mono vcount">
          {scene + 1}/{video.scenes.length}
        </span>
        <span className="spacer" />
        <button className={`btn sm${subs ? ' on' : ''}`} aria-pressed={subs} onClick={() => setSubs((s) => (setPref('subs', !s), !s))} title="Subtitles (c)">
          CC
        </button>
        {hasSpeech && (
          <button className="btn icon" aria-pressed={!muted} onClick={() => setMuted((m) => (setPref('muted', !m), !m))} aria-label={muted ? 'Turn narration on' : 'Mute narration'} title="Narration (m)">
            <Icon name={muted ? 'mute' : 'sound'} size={16} />
          </button>
        )}
        <select className="vsel" value={rate} onChange={(e) => (setRate(Number(e.target.value)), setPref('rate', Number(e.target.value)))} aria-label="Speed">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        {voices.length > 1 && (
          <select className="vsel voice" value={voice?.name ?? ''} onChange={(e) => (setVoiceName(e.target.value), setPref('voice', e.target.value))} aria-label="Voice">
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name.replace(/^Microsoft |^Google /, '').replace(/ Online \(Natural\)/, ' (natural)')}
              </option>
            ))}
          </select>
        )}
        <button className="btn icon" onClick={fullscreen} aria-label="Full screen" title="Full screen (f)">
          <Icon name="expand" size={16} />
        </button>
      </div>
      {!hasSpeech && <p className="dim">This browser has no speech engine, so the video plays with subtitles only.</p>}
      {voices.length > 0 && !voices.some((v) => /natural|Google/i.test(v.name)) && (
        <p className="dim">Tip: for a livelier, more natural voice, open this page in Microsoft Edge (or Chrome) and pick a voice marked natural.</p>
      )}

      <ol className="vchapters">
        {chapters.map((c, i) => {
          const end = chapters[i + 1]?.at ?? video.scenes.length;
          return (
            <li key={c.at} className={scene >= c.at && scene < end ? 'now' : ''}>
              <button onClick={() => jump(c.at)}>{c.name}</button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SceneView({ s }: { s: Scene }) {
  switch (s.kind) {
    case 'title':
      return (
        <div className="vs vs-title">
          {s.tag && <span className="vtag">{s.tag}</span>}
          <h2>{s.heading}</h2>
          {s.sub && <p>{s.sub}</p>}
        </div>
      );
    case 'points':
      return (
        <div className={`vs vs-points${s.code ? ' with-code' : ''}`}>
          <div>
            <h3>{s.heading}</h3>
            <ul>
              {s.points.map((p, i) => (
                <li key={i} className={s.active === -1 || i === s.active ? 'on' : i < s.active ? 'was' : 'dim'}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {s.code && (
            <div className="vcode codeview">
              <CodeLines code={s.code} language="python" line={s.line} />
            </div>
          )}
        </div>
      );
    case 'code':
      return (
        <div className="vs vs-code">
          <h3>{s.heading}</h3>
          <div className="vcode codeview">
            <CodeLines code={s.code} language="python" />
          </div>
        </div>
      );
    case 'trace':
      return (
        <div className="vs vs-trace">
          <div className="vtrace-head">
            <h3>{s.heading}</h3>
            <span className="dim mono">
              step {s.step} of {s.total}
            </span>
          </div>
          <div className="vtrace-body">
            <div className="panels">
              {s.frame.panels.map((p, i) => (
                <div key={i} className={`pnl${isWide(p) ? ' wide' : ''}`}>
                  <PanelView panel={p} />
                </div>
              ))}
            </div>
            <FollowCode code={s.code} line={s.frame.line} />
          </div>
        </div>
      );
  }
}

function FollowCode({ code, line }: { code: string; line: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.ln.cur');
    const b = ref.current;
    if (el && b) b.scrollTo({ top: Math.max(0, el.offsetTop - b.clientHeight / 2), behavior: 'smooth' });
  }, [line]);
  return (
    <div className="vcode codeview" ref={ref}>
      <CodeLines code={code} language="python" line={line || undefined} />
    </div>
  );
}
