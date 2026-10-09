import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { ReactTest, Unit } from '@/content/types';
import { parentMap, treePanel, type CNode } from '@/content/lib/frontend-react';
import { clip } from '@/content/lib/finish-m2m3';

const code = `
// Prop drilling: every component between owner and consumer must carry "user"
function App() {                                                  //@root
  const [user, setUser] = useState({ name: 'Ada' });
  return <Layout user={user} />;
}
function Layout({ user }) { return <Sidebar user={user} />; }     //@pass
function UserBadge({ user }) { return <b>{user.name}</b>; }       //@propUse

// Context: the consumer reads the value directly
const UserContext = createContext(null);                          //@create
function UserProvider({ children }) {                             //@provider
  const [user, setUser] = useState({ name: 'Ada' });
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
function UserBadge() {                                            //@consumer
  const user = useContext(UserContext);                           //@read
  return <b>{user.name}</b>;
}
`;

const MODES = ['prop drilling', 'context'];
const LEAVES = ['UserBadge', 'Avatar', 'Footer'];

const tree: CNode = {
  id: 'root',
  name: 'App',
  children: [
    {
      id: 'Layout',
      name: 'Layout',
      children: [
        { id: 'Sidebar', name: 'Sidebar', children: [{ id: 'UserBadge', name: 'UserBadge' }] },
        { id: 'Content', name: 'Content', children: [{ id: 'Article', name: 'Article', children: [{ id: 'Avatar', name: 'Avatar' }, { id: 'Footer', name: 'Footer' }] }] },
      ],
    },
  ],
};

interface In {
  mode: string;
  consumers: string[];
}

interface Out {
  mustKnow: number;
  rerendered: number;
}

function ancestors(id: string, parents: Record<string, string | null>): string[] {
  const out: string[] = [];
  for (let p = parents[id]; p; p = parents[p]) out.push(p);
  return out;
}

const viz: VizDef<In> = {
  id: 'react-context',
  title: 'Prop drilling vs context',
  code,
  language: 'javascript',
  inputs: [
    { key: 'mode', label: 'How does the value travel?', kind: 'select', options: MODES, default: 'prop drilling' },
    { key: 'consumers', label: 'Components that need `user`', kind: 'strings', default: ['UserBadge', 'Avatar'], maxItems: 3, help: 'Any of: ' + LEAVES.join(', ') },
  ],
  presets: [
    { label: 'Drilling to two leaves', input: { mode: 'prop drilling', consumers: ['UserBadge', 'Avatar'] } },
    { label: 'Same with context', input: { mode: 'context', consumers: ['UserBadge', 'Avatar'] } },
    { label: 'One shallow consumer', input: { mode: 'prop drilling', consumers: ['UserBadge'] } },
    { label: 'Nobody needs it', input: { mode: 'context', consumers: [] } },
  ],
  run({ mode, consumers }) {
    if (!MODES.includes(mode)) throw new Error('mode must be one of ' + MODES.join(', '));
    const bad = consumers.filter((c) => !LEAVES.includes(c));
    if (bad.length) throw new Error('Unknown component: ' + bad.join(', ') + '. Use: ' + LEAVES.join(', '));
    const r = new Recorder(code);
    const parents = parentMap(tree);
    const drilling = mode === 'prop drilling';
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    const edgeTones: Record<string, Tone> = {};
    const edgeLabels: Record<string, string> = {};
    const uses = new Set(consumers);
    const view = (title: string) => treePanel(tree, { tones, badges, edgeTones, edgeLabels, title }, { gapX: 96, gapY: 70 });

    r.step(drilling ? 'root' : 'provider', clip(drilling ? 'App owns `user` in state; some leaves need it, the tree between them does not' : 'UserProvider owns `user`; it wraps the tree and offers it to anyone below'), [view(mode)], { consumers: consumers.join(',') || 'none' });
    for (const c of uses) tones[c] = 'compare';
    r.step(drilling ? 'propUse' : 'consumer', clip(uses.size ? `${[...uses].join(' and ')} actually read the value` : 'No component reads the value'), [view(mode)], { consumers: uses.size });

    const carriers = new Set<string>();
    if (drilling) {
      // every component between the owner and a consumer must accept and forward the prop
      for (const c of uses) for (const a of ancestors(c, parents)) if (a !== 'root') carriers.add(a);
      for (const id of carriers) {
        r.op();
        tones[id] = 'frontier';
        badges[id] = 'props: user';
        edgeLabels[`${parents[id]}>${id}`] = 'user';
        edgeTones[`${parents[id]}>${id}`] = 'frontier';
        r.step('pass', clip(`${id} must accept and forward \`user\` although it never uses it`), [view(mode)], { passThrough: carriers.size });
      }
      for (const c of uses) {
        edgeLabels[`${parents[c]}>${c}`] = 'user';
        edgeTones[`${parents[c]}>${c}`] = 'frontier';
        badges[c] = 'props: user';
      }
      r.step('pass', clip(carriers.size ? `${carriers.size} pass-through component(s) now depend on a prop they do not use` : 'No pass-through needed: the consumers are direct children'), [view(mode)], { passThrough: carriers.size });
    } else {
      tones.root = 'active';
      badges.root = 'provides user';
      for (const c of uses) {
        r.op();
        badges[c] = 'useContext';
        edgeTones[`${parents[c]}>${c}`] = 'path';
      }
      r.step('read', clip(uses.size ? 'Consumers call useContext: no props appear on the components in between' : 'Provider offers a value that nobody reads'), [view(mode)], { passThrough: 0 });
    }

    // the value changes
    const rendered = new Set<string>(['root']);
    if (drilling) {
      // state lives in App: every child re-renders because App re-rendered
      const visit = (n: CNode): void => {
        rendered.add(n.id);
        n.children?.forEach(visit);
      };
      visit(tree);
    } else {
      for (const c of uses) rendered.add(c);
    }
    for (const id of rendered) tones[id] = 'swap';
    r.step(drilling ? 'root' : 'provider', clip(drilling ? `setUser runs in App: all ${rendered.size} components re-render (default React behaviour)` : `setUser runs in the provider: only it and ${uses.size} consumer(s) re-render`), [view(mode)], { rendered: rendered.size });
    for (const id of rendered) tones[id] = uses.has(id) ? 'found' : 'done';
    const out: Out = { mustKnow: drilling ? carriers.size + uses.size : uses.size, rerendered: rendered.size };
    r.step(undefined, clip(`Components that must know about \`user\`: ${out.mustKnow}; components re-rendered: ${out.rerendered}`), [view(mode)], { ...out });
    return { frames: r.frames, result: out };
  },
  reference({ mode, consumers }) {
    const set = new Set(consumers);
    const path: Record<string, string[]> = { UserBadge: ['Layout', 'Sidebar'], Avatar: ['Layout', 'Content', 'Article'], Footer: ['Layout', 'Content', 'Article'] };
    if (mode === 'context') return { mustKnow: set.size, rerendered: 1 + set.size };
    const pass = new Set([...set].flatMap((c) => path[c]));
    return { mustKnow: pass.size + set.size, rerendered: 8 };
  },
};

const THEME_PARTS = `function Toolbar() {
  return <Panel />;
}

function Panel() {
  return (
    <div>
      <ThemedButton />
      <ThemedLabel />
    </div>
  );
}
`;

const themeTests: ReactTest[] = [
  { name: 'starts light', steps: [{ expectText: 'Theme: light' }, { expectText: 'Current: light' }, { expectCount: 'button.btn-light', n: 1 }] },
  { name: 'toggle updates button and label', steps: [{ click: 'button' }, { expectText: 'Theme: dark' }, { expectText: 'Current: dark' }, { expectCount: 'button.btn-dark', n: 1 }] },
  { name: 'toggle twice returns to light', steps: [{ click: 'button' }, { click: 'button' }, { expectText: 'Current: light' }, { expectCount: 'button.btn-light', n: 1 }] },
];

const unit: Unit = {
  id: 'react-context',
  hook: '"How do you share state across distant components?" is the follow-up to lifting state. Knowing when context beats prop drilling, and what it does NOT do (it is not a state manager, and it re-renders every consumer), is expected at mid level and above.',
  predict: {
    prompt: 'A `theme` value is needed by a button nested five levels deep. Components in between never use it. What does context change compared with passing a prop?',
    options: ['The intermediate components no longer need to accept or forward the value', 'The button re-renders less often than with props', 'The value is stored outside React, so updates are free', 'Intermediate components cannot re-render any more'],
    answer: 0,
    explain: 'Context lets a deep component read a value straight from the nearest provider, so the components in between stay unaware of it. It does not make anything cheaper by itself: consumers still re-render when the value changes.',
  },
  simulationNote: 'The visualizer models React\'s default re-render rules for one example tree. The exercises run real React in a sandbox.',
  viz,
  deeper: {
    points: [
      '`createContext(default)` makes the channel, `<Ctx.Provider value>` fills it for a subtree, and `useContext(Ctx)` reads the nearest provider. Outside any provider you get the default.',
      'Prop drilling is fine for one or two levels. Reach for context when many components at different depths need the same value (theme, current user, locale).',
      'Every consumer re-renders when the provider\'s `value` changes (compared with `Object.is`). A new object literal on each render therefore re-renders all consumers every time.',
      'A provider that owns state and renders `{children}` lets everything between provider and consumers skip re-rendering, because their elements did not change.',
      'Context is for passing data down, not for managing it. Keep the state logic (useState/useReducer) in the provider component and expose a small value or custom hook.',
      'Split unrelated data into separate contexts so that a theme change does not re-render components that only need the user.',
    ],
    pitfalls: ['Putting fast-changing state (like typing in an input) in a wide context', 'Passing `value={{ a, b }}` inline and re-rendering every consumer', 'Reading context in a component rendered outside the provider and getting the silent default'],
  },
  practice: {
    language: 'jsx',
    fnName: 'App',
    statement: 'Create a `ThemeContext` and a `ThemeProvider` that keeps `theme` in state (starts `"light"`) and offers `{ theme, toggle }`. `ThemedButton` shows `Theme: <theme>`, has class `btn-<theme>` and toggles on click; `ThemedLabel` shows `Current: <theme>`. `App` renders both inside the provider via `Toolbar` and `Panel` (given), with no props passed between them.',
    signature: 'function App() {',
    solution: `const ThemeContext = @@createContext('light')@@;

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light');
  return (
    <@@ThemeContext.Provider@@ value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function ThemedButton() {
  const { theme, toggle } = @@useContext(ThemeContext)@@;
  return (
    <button className={'btn-' + theme} onClick={toggle}>
      Theme: {theme}
    </button>
  );
}

function ThemedLabel() {
  const { theme } = useContext(ThemeContext);
  return <p>Current: {theme}</p>;
}

${THEME_PARTS}
function App() {
  return (
    <ThemeProvider>
      <Toolbar />
    </ThemeProvider>
  );
}`,
    reactTests: themeTests,
  },
  debug: {
    language: 'jsx',
    fnName: 'App',
    statement: 'Clicking the button changes its own text but the label stays on "Current: light". The label reads the same context. Find out why it never updates.',
    buggy: `const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light');
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function ThemedButton() {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <button className={'btn-' + theme} onClick={toggle}>
      Theme: {theme}
    </button>
  );
}

function ThemedLabel() {
  const { theme } = useContext(ThemeContext);
  return <p>Current: {theme}</p>;
}

function App() {
  return (
    <div>
      <ThemeProvider>
        <ThemedButton />
      </ThemeProvider>
      <ThemedLabel />
    </div>
  );
}`,
    fixed: `const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light');
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function ThemedButton() {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <button className={'btn-' + theme} onClick={toggle}>
      Theme: {theme}
    </button>
  );
}

function ThemedLabel() {
  const { theme } = useContext(ThemeContext);
  return <p>Current: {theme}</p>;
}

function App() {
  return (
    <ThemeProvider>
      <ThemedButton />
      <ThemedLabel />
    </ThemeProvider>
  );
}`,
    reactTests: themeTests,
    bugType: 'consumer outside the provider',
    hint: 'Which components sit inside <ThemeProvider> in App, and which do not?',
    explanation: 'ThemedLabel is rendered next to the provider, not inside it. A consumer outside any provider silently receives the default value passed to createContext, which never changes. Wrap every consumer in the provider.',
  },
  boss: {
    title: 'Auth context with gated pages',
    statement:
      'Build `App` with an auth context. Users: Ada (role admin) and Bob (role member). `AuthProvider` owns `user` (initially null) and offers `{ user, login(name), logout() }`; wrap it in a `useAuth` hook. `Navbar`: with no user show `Guest` and buttons `Login as Ada` and `Login as Bob`; with a user show `Hello, <name>` and a `Logout` button. `Page`: no user shows `Please log in`, an admin shows `Admin panel`, a member shows `Member area`. Only the provider holds state.',
    language: 'jsx',
    fnName: 'App',
    starter: `function App() {
  return <div></div>;
}`,
    solution: `const AuthContext = createContext(null);

const USERS = {
  Ada: { name: 'Ada', role: 'admin' },
  Bob: { name: 'Bob', role: 'member' },
};

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const login = (name) => setUser(USERS[name]);
  const logout = () => setUser(null);
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

function useAuth() {
  return useContext(AuthContext);
}

function Navbar() {
  const { user, login, logout } = useAuth();
  if (!user) {
    return (
      <nav>
        <span>Guest</span>
        <button onClick={() => login('Ada')}>Login as Ada</button>
        <button onClick={() => login('Bob')}>Login as Bob</button>
      </nav>
    );
  }
  return (
    <nav>
      <span>Hello, {user.name}</span>
      <button onClick={logout}>Logout</button>
    </nav>
  );
}

function Page() {
  const { user } = useAuth();
  if (!user) return <p>Please log in</p>;
  return user.role === 'admin' ? <p>Admin panel</p> : <p>Member area</p>;
}

function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Page />
    </AuthProvider>
  );
}`,
    reactTests: [
      { name: 'guest view', steps: [{ expectText: 'Guest' }, { expectText: 'Please log in' }, { expectNoText: 'Admin panel' }, { expectCount: 'button', n: 2 }] },
      { name: 'admin sees the admin panel', steps: [{ click: 'text=Login as Ada' }, { expectText: 'Hello, Ada' }, { expectText: 'Admin panel' }, { expectNoText: 'Please log in' }, { expectCount: 'button', n: 1 }] },
      { name: 'member sees the member area', steps: [{ click: 'text=Login as Bob' }, { expectText: 'Hello, Bob' }, { expectText: 'Member area' }, { expectNoText: 'Admin panel' }] },
      { name: 'logout resets everything', steps: [{ click: 'text=Login as Ada' }, { click: 'text=Logout' }, { expectText: 'Guest' }, { expectText: 'Please log in' }, { expectNoText: 'Hello, Ada' }] },
      { name: 'switching user after logout', steps: [{ click: 'text=Login as Ada' }, { click: 'text=Logout' }, { click: 'text=Login as Bob' }, { expectText: 'Member area' }, { expectNoText: 'Admin panel' }] },
    ],
    hints: ['Create the context, then ONE component (AuthProvider) with useState for the user. Navbar and Page are siblings, so they must read the shared value with useContext instead of receiving props.', 'Wrap Navbar and Page in AuthProvider inside App. login(name) looks the user up in a small table and sets it; logout sets null. Page decides by user and user.role.'],
    combines: ['react-lifting-state', 'hook-custom'],
  },
  quiz: [
    {
      prompt: 'A provider renders `<Ctx.Provider value={{ user, theme }}>` and its parent re-renders for an unrelated reason. What happens to the consumers?',
      options: ['Nothing: context values are cached', 'They re-render because the inline object is a new reference each time', 'Only consumers of `user` re-render', 'React throws a warning and skips them'],
      answer: 1,
      explain: 'Context compares the value with Object.is. A fresh object literal is never equal to the previous one, so every consumer re-renders. Memoise the value or keep it in state.',
    },
  ],
};

export default unit;
