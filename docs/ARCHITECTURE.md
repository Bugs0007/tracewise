# Architecture

Tracewise is a **static, frontend-only** single-page app. There is no server, database or account system: everything runs in the browser and all learner data lives in `localStorage`.

```
┌──────────────────────────── Browser tab ────────────────────────────┐
│  React UI (Vite build)                                              │
│   ├─ pages/        Home · Map · Unit flow · Lab · Gym · Review ·    │
│   │                Interview · Capstone · Settings · Certificate    │
│   ├─ player/       Visualizer player (frames → panels)              │
│   ├─ features/     TaskRunner (editor + tests), blanks, trace       │
│   └─ store/        zustand store ⇄ localStorage (versioned schema)  │
│                                                                     │
│  content/          catalog.ts + units/<module>/<id>.ts (data + viz) │
│  engine/           Recorder, layouts, input parsing, frame types    │
│                                                                     │
│  runner/  ─┬─ python.worker.ts  → Pyodide (self-hosted WASM)        │
│            │      + harness.py (tests, tracing) + src/py/* libs     │
│            ├─ js.worker.ts      → JS/TS (sucrase) in a worker       │
│            └─ reactSandbox.ts   → sandboxed iframe (opaque origin)  │
└─────────────────────────────────────────────────────────────────────┘
```

## Stack and why

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite 7** + TypeScript | Fast dev server, first-class workers (`new Worker(new URL(...))`), `?raw` imports, static output with relative `base: './'` so the same `dist/` works on GitHub Pages sub-paths, Netlify and Vercel. Next.js static export adds complexity for no benefit in a client-only app. |
| UI | **React 18.3** | Familiar to contributors; 18.3 still ships UMD builds, which the React sandbox inlines so it works offline. |
| State | **zustand** (≈1 KB) | Tiny, selector-based, trivially serialisable to `localStorage`. |
| Editor | **CodeMirror 6** | ~10× lighter than Monaco, mobile-friendly, accessible, modular. Autocomplete and bracket auto-closing are intentionally off (muscle memory). |
| Animation | SVG + CSS transitions + a small rAF tween/FLIP helper | No animation dependency. Graph nodes tween between frames; array cells use FLIP when they carry identities. A global `data-motion="reduced"` switch disables all of it. |
| Python | **Pyodide 0.29** (self-hosted from `node_modules/pyodide`, copied to `public/pyodide` on install) | Real CPython in WASM inside a Web Worker. Lazy-loaded on first use, never on first paint. No third-party CDN, cached by the service worker for offline. |
| JS/TS | Web Worker + `new Function`; TypeScript stripped by **sucrase** | Worker can be terminated on timeout, so infinite loops never freeze the UI. |
| React exercises | Sandboxed `<iframe sandbox="allow-scripts">` (opaque origin) with React UMD inlined; JSX compiled by sucrase; loops instrumented with an acorn-based time guard | The iframe cannot touch the app's storage or DOM. A hard timeout removes the iframe. |
| Tests | Vitest (unit + content validation), Playwright (e2e) | Content validation runs every solution/bug/boss through the *same* Python harness the browser uses, via local CPython. |

## The visualizer engine

Every visualizer is a pure function:

```ts
interface VizDef<I> {
  id: string; title: string;
  code: string;                 // shown in the code panel; lines end with #@anchor or //@anchor
  language: 'python' | 'javascript' | 'text';
  inputs: InputField[];         // editable inputs (numbers, edges, grid, json, ...)
  presets?: { label; input }[];
  run(input: I): { frames: Frame[]; result?: unknown };
  reference?(input: I): unknown; // independent implementation used by tests
}
interface Frame { line: number; caption: string; panels: Panel[]; vars: Record<string, Scalar>; ops?: number }
```

Generators run the real algorithm and call `recorder.step(anchor, caption, panels, vars)` at each meaningful moment. The `Recorder` deep-clones panels so later mutation never rewrites history, maps `#@anchor` names to line numbers (so code edits don't break highlighting), and counts operations for the Big-O op counter.

**Panels** are declarative data — `array`, `grid` (DP tables, matrices, boards, heatmaps), `graph` (trees, linked lists, graphs, architecture diagrams, scatter plots), `list` (stacks/queues), `buckets` (hash tables), `sequence` (sequence diagrams), `timeline`, `chart`, `log`, `kv`, `note`. One renderer per panel type lives in `src/player/panels.tsx`; content authors never write React.

The **Player** renders frames and adds play/pause, step, scrub, speed, reset, jump-to-end, a synced code panel, a variables panel (changed values flash), an operation counter, editable inputs with presets, and **Predict mode**: at checkpoints it pauses and asks "what happens next?", using the next frame's caption as the answer and nearby captions as distractors — so every visualizer gets a quiz for free.

**Trace mode** (Lab → "Trace your own code") runs the learner's own Python under `sys.settrace` in Pyodide and converts each line event (locals + call stack) into frames, so learners can step through *their* code with the same player.

Correctness: `src/content/content.test.ts` runs every visualizer on its default input and all presets, checks frames are well formed (valid lines, captions, panel types, edges referencing existing nodes) and compares `result` against `reference(input)`.

## Code execution and safety

- **Python**: one Pyodide worker, initialised lazily (`preloadPython()` is called when a Python task opens). Each run executes the harness's `run_tests(code, fn, tests, harness, adapter)` in a fresh namespace; teaching libraries (`src/py/minidjango`, `src/py/minillm`) are written into the Pyodide FS and their modules are reset between runs. On timeout (default 6 s) the worker is terminated and a fresh one warms up in the background.
- **JavaScript/TypeScript**: a dedicated worker with `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `caches` and `importScripts` removed. Terminated on timeout.
- **React (JSX)**: compiled, loop-guarded, run in a sandboxed iframe. DOM test steps (`click`, `type`, `expectText`, `expectCount`) execute inside the iframe; results come back via `postMessage`. `fetch` inside the iframe is bridged to the parent, which the capstone uses to talk to the in-browser Python backend.
- Comparison of results happens in JS (`runner/compare.ts`) with modes `exact`, `unordered`, `nested`, `float`.

## Content model

Content is data. `src/content/catalog.ts` lists every concept (≈270). Each concept has a unit file at `src/content/units/<module>/<id>.ts` exporting a `Unit` (see `docs/CONTENT_SCHEMA.md`): hook, predict question, visualizer, optional "go deeper", a practice task (whose `@@blanks@@` drive all four ladder levels), a debug task (buggy + fixed), and a boss (starter + solution + two hints). Units are discovered with `import.meta.glob` and code-split, so adding a unit never touches a registry file.

## Learning loop and gamification

`Predict → Watch → Type (4-level ladder) → Debug → Mini-boss`. XP, levels, streaks, daily goal, badges, review queue (Leitner boxes), Interview Mode, Quick 10, Syntax Gym, focus mode. All rules live in `src/store/store.ts` and `src/content/ladder.ts`.

## Persistence

`src/store/save.ts` defines `SaveData` with a `schema` number and an ordered `MIGRATIONS` table. Loading always runs `migrate()` then `sanitize()` (fills defaults, drops wrong types), so old or hand-edited exports never crash the app. Export/Import is plain JSON.

## Offline

`public/sw.js` caches the shell (network-first for navigations) and every same-origin asset on first use (cache-first), including the Pyodide runtime. After one online visit that touched Python, the app works offline.

## Deployment

`npm run build` produces `dist/` (relative URLs + hash routing). `.github/workflows/deploy.yml` publishes to GitHub Pages; `netlify.toml` and `vercel.json` are included. No server configuration is required.
