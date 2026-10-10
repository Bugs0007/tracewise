import { lazy, Suspense, useEffect } from 'react';
import { useRoute, href } from './router';
import { useApp, dueReviews } from './store/store';
import { levelInfo } from './store/save';
import { Icon } from './ui/Icon';
import { Celebrations } from './ui/Celebrations';
import { useReducedMotion } from './lib/motion';
import { HomePage } from './pages/HomePage';
import { AccountChip } from './account/AccountChip';

const MapPage = lazy(() => import('./pages/MapPage'));
const UnitPage = lazy(() => import('./pages/UnitPage'));
const LabPage = lazy(() => import('./pages/LabPage'));
const GymPage = lazy(() => import('./pages/GymPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const InterviewPage = lazy(() => import('./pages/InterviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CapstonePage = lazy(() => import('./pages/CapstonePage'));
const CertificatePage = lazy(() => import('./pages/CertificatePage'));
const DsaPage = lazy(() => import('./dsa/pages/DsaPage'));

const NAV = [
  { to: '/', label: 'Home', icon: 'home', tab: true, top: false, match: (p: string[]) => p.length === 0 },
  { to: '/map', label: 'Learn', icon: 'map', tab: true, top: true, match: (p: string[]) => p[0] === 'map' || p[0] === 'unit' || p[0] === 'dsa' },
  { to: '/practice', label: 'Practice', icon: 'lab', tab: true, top: true, match: (p: string[]) => ['practice', 'review', 'gym', 'lab'].includes(p[0]) },
  { to: '/interview', label: 'Interview', icon: 'timer', tab: true, top: true, match: (p: string[]) => p[0] === 'interview' },
  { to: '/capstone', label: 'Capstone', icon: 'trophy', tab: true, top: true, match: (p: string[]) => p[0] === 'capstone' || p[0] === 'certificate' },
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

const SEGMENTS = 10;

function TopBar() {
  const { parts } = useRoute();
  const xp = useApp((s) => s.xp);
  const streak = useApp((s) => s.streak);
  const focus = useApp((s) => s.settings.focus);
  const setSettings = useApp((s) => s.setSettings);
  const theme = useApp((s) => s.settings.theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const due = useApp((s) => dueReviews(s).length);
  const { level, into, span } = levelInfo(xp);
  const filled = Math.floor((into / span) * SEGMENTS);
  return (
    <header className="topbar">
      <a className="brand" href={href('/')} aria-label="Tracewise home">
        <Logo />
        <span>Tracewise</span>
      </a>
      <nav className="topnav" aria-label="Main">
        {NAV.filter((n) => n.top).map((n) => (
          <a key={n.to} href={href(n.to)} aria-current={n.match(parts) ? 'page' : undefined}>
            {n.label}
            {n.to === '/practice' && due > 0 && <span className="badge-dot" aria-label={`${due} reviews due`}>{due}</span>}
          </a>
        ))}
      </nav>
      <span className="spacer" />
      <a className="btn sm hide-sm" href={href('/review?quick=1')} title="A focused 10-minute mixed session">
        Quick 10
      </a>
      <div className={`streak${streak.count ? '' : ' cold'}`} title={`Daily streak, best ${streak.best}`}>
        <Icon name="flame" size={16} />
        <span data-testid="streak">{streak.count}</span>
      </div>
      <div className="xpbox" title={`${xp} XP in total`}>
        <span className="hide-sm">Level {level}</span>
        <div className="seg-bar" title={`Level ${level}`} role="progressbar" aria-valuemin={0} aria-valuemax={span} aria-valuenow={into} aria-label="Progress to next level">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <i key={i} className={i < filled ? 'on' : ''} />
          ))}
        </div>
        <span className="hide-sm mono" data-testid="xp">
          {xp} XP
        </span>
      </div>
      <button className={`btn icon sm ${focus ? '' : 'ghost'}`} onClick={() => setSettings({ focus: !focus })} aria-pressed={focus} aria-label="Focus mode" title="Focus mode: hide everything but the task">
        <Icon name="focus" size={17} />
      </button>
      <button className="btn icon sm ghost" onClick={() => setSettings({ theme: dark ? 'light' : 'dark' })} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} data-testid="theme-toggle">
        <Icon name={dark ? 'sun' : 'moon'} size={17} />
      </button>
      <a className="btn icon sm ghost" href={href('/settings')} aria-label="Settings" title="Settings" aria-current={parts[0] === 'settings' ? 'page' : undefined}>
        <Icon name="settings" size={17} />
      </a>
      <AccountChip />
    </header>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  // a short trace with a filled playhead dot at its end
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <polyline points="3,24 10,13 16,19 25,7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx="26" cy="6.5" r="4" fill="var(--cobalt)" />
    </svg>
  );
}

function TabBar() {
  const { parts } = useRoute();
  const due = useApp((s) => dueReviews(s).length);
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV.filter((n) => n.tab).map((n) => (
        <a key={n.to} href={href(n.to)} aria-current={n.match(parts) ? 'page' : undefined}>
          <Icon name={n.icon} size={20} />
          {n.label}
          {n.to === '/practice' && due > 0 && <span className="sr-only">{due} reviews due</span>}
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
    case 'dsa':
      return <DsaPage topic={b} slug={c} />;
    case 'practice':
      return <PracticePage />;
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
          <h1>Page not found</h1>
          <a href={href('/')}>Back to the home page</a>
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
      <main className="main" id="main" tabIndex={-1}>
        <Suspense fallback={<div className="page dim">Loading…</div>}>
          <Routes />
        </Suspense>
      </main>
      <TabBar />
      <Celebrations />
    </div>
  );
}
