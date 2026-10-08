import { lazy, Suspense, useEffect } from 'react';
import { useRoute, href } from './router';
import { useApp, dueReviews } from './store/store';
import { levelInfo } from './store/save';
import { Icon } from './ui/Icon';
import { Celebrations } from './ui/Celebrations';
import { useReducedMotion } from './lib/motion';
import { HomePage } from './pages/HomePage';

const MapPage = lazy(() => import('./pages/MapPage'));
const UnitPage = lazy(() => import('./pages/UnitPage'));
const LabPage = lazy(() => import('./pages/LabPage'));
const GymPage = lazy(() => import('./pages/GymPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const InterviewPage = lazy(() => import('./pages/InterviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CapstonePage = lazy(() => import('./pages/CapstonePage'));
const CertificatePage = lazy(() => import('./pages/CertificatePage'));

const NAV = [
  { to: '/', label: 'Home', icon: 'home', match: (p: string[]) => p.length === 0 },
  { to: '/map', label: 'Map', icon: 'map', match: (p: string[]) => p[0] === 'map' || p[0] === 'unit' },
  { to: '/lab', label: 'Lab', icon: 'lab', match: (p: string[]) => p[0] === 'lab' },
  { to: '/gym', label: 'Gym', icon: 'gym', match: (p: string[]) => p[0] === 'gym' },
  { to: '/review', label: 'Review', icon: 'review', match: (p: string[]) => p[0] === 'review' },
  { to: '/interview', label: 'Interview', icon: 'timer', match: (p: string[]) => p[0] === 'interview' },
  { to: '/capstone', label: 'Capstone', icon: 'trophy', match: (p: string[]) => p[0] === 'capstone' || p[0] === 'certificate' },
  { to: '/settings', label: 'Settings', icon: 'settings', match: (p: string[]) => p[0] === 'settings' },
];

function useThemeEffects() {
  const theme = useApp((s) => s.settings.theme);
  const fontSize = useApp((s) => s.settings.fontSize);
  const reduced = useReducedMotion();
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [reduced]);
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-fs', `${fontSize}px`);
  }, [fontSize]);
}

function TopBar() {
  const xp = useApp((s) => s.xp);
  const streak = useApp((s) => s.streak);
  const focus = useApp((s) => s.settings.focus);
  const setSettings = useApp((s) => s.setSettings);
  const { level, into, span } = levelInfo(xp);
  return (
    <header className="topbar">
      <a className="brand" href={href('/')} aria-label="Tracewise home">
        <Logo />
        <span className="hide-sm">Tracewise</span>
      </a>
      <span className="spacer" />
      <a className="btn sm primary hide-sm" href={href('/review?quick=1')} title="A focused 10-minute mixed session">
        <Icon name="bolt" size={15} /> Quick 10
      </a>
      <div className={`streak${streak.count ? '' : ' cold'}`} title={`Daily streak (best ${streak.best})`}>
        <Icon name="flame" size={18} />
        <span data-testid="streak">{streak.count}</span>
      </div>
      <div className="xpbox" title={`${xp} XP total`}>
        <span className="lvl" aria-label={`Level ${level}`}>
          {level}
        </span>
        <div className="grow">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={span} aria-valuenow={into} aria-label="Progress to next level">
            <span style={{ width: `${(into / span) * 100}%` }} />
          </div>
          <div className="dim mono" style={{ fontSize: 11, marginTop: 2 }} data-testid="xp">
            {xp} XP
          </div>
        </div>
      </div>
      <button className={`btn icon sm ${focus ? 'primary' : 'ghost'}`} onClick={() => setSettings({ focus: !focus })} aria-pressed={focus} aria-label="Focus mode" title="Focus mode: hide everything but the task">
        <Icon name="focus" size={16} />
      </button>
    </header>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c8cff" />
          <stop offset="1" stopColor="#5ee6d0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lg-brand)" />
      <path d="M8 21 L13 12 L18 18 L24 9" fill="none" stroke="#0b0e17" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="12" r="2.2" fill="#0b0e17" />
      <circle cx="18" cy="18" r="2.2" fill="#0b0e17" />
    </svg>
  );
}

function Nav() {
  const { parts } = useRoute();
  const due = useApp((s) => dueReviews(s).length);
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => (
        <a key={n.to} href={href(n.to)} aria-current={n.match(parts) ? 'page' : undefined}>
          <Icon name={n.icon} size={20} />
          {n.label}
          {n.to === '/review' && due > 0 && <span className="badge-dot">{due}</span>}
        </a>
      ))}
    </nav>
  );
}

function Routes() {
  const { parts } = useRoute();
  const [a, b, c] = parts;
  switch (a) {
    case undefined:
      return <HomePage />;
    case 'map':
      return <MapPage module={b} />;
    case 'unit':
      return <UnitPage id={b} step={c} />;
    case 'lab':
      return <LabPage id={b} />;
    case 'gym':
      return <GymPage />;
    case 'review':
      return <ReviewPage />;
    case 'interview':
      return <InterviewPage />;
    case 'settings':
      return <SettingsPage />;
    case 'capstone':
      return <CapstonePage id={b} />;
    case 'certificate':
      return <CertificatePage />;
    default:
      return (
        <div className="page">
          <h1>Not found</h1>
          <a href={href('/')}>Go home</a>
        </div>
      );
  }
}

export default function App() {
  useThemeEffects();
  const focus = useApp((s) => s.settings.focus);
  const { path } = useRoute();
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [path]);
  return (
    <div className={`shell${focus ? ' focus' : ''}`}>
      <a className="skip-link" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <TopBar />
      <Nav />
      <main className="main" id="main" tabIndex={-1}>
        <Suspense fallback={<div className="page dim">Loading…</div>}>
          <Routes />
        </Suspense>
      </main>
      <Celebrations />
    </div>
  );
}
