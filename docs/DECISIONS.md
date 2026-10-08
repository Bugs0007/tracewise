# Decision log

Decisions made autonomously during the build, newest last. Each entry: what, why, and what was rejected.

### D1 — Name: **Tracewise**
Candidates: *Tracewise*, *Stepwise*, *Dry Run*. "Stepwise" and "Dry Run" are generic and heavily used; "Tracewise" says exactly what the app does (trace execution, step by step, and get wise) and is distinctive. Committed to Tracewise.

### D2 — Vite + React + TypeScript, not Next.js
The app is 100 % client-side. Next.js static export would add routing/export constraints with no SSR benefit. Vite gives first-class workers, `?raw` imports and a trivially static `dist/`.

### D3 — Hash routing with a 20-line router
Works on GitHub Pages sub-paths without 404 rewrites. React Router was unnecessary weight for ~10 routes.

### D4 — CodeMirror 6 instead of Monaco
Monaco is several MB, awkward in workers and on mobile. CM6 is modular and accessible. **Autocomplete and auto-closing brackets are deliberately disabled**: the target learner is rebuilding typing muscle memory.

### D5 — Self-host Pyodide (0.29.5) instead of a CDN
No third-party requests, works offline via the service worker, version pinned. `scripts/copy-pyodide.mjs` copies the runtime from `node_modules` on `npm install` (~12 MB, not committed).

### D6 — Kill-on-timeout instead of interrupt buffers
Interrupting Pyodide cleanly needs `SharedArrayBuffer`, which needs COOP/COEP headers that GitHub Pages can't set. Terminating the worker is portable; the cost is a ~2 s warm-up after a timeout, which runs in the background.

### D7 — React sandbox: inline React UMD into a `srcdoc` iframe
React 18.3 ships UMD builds; inlining them avoids CORS problems that module scripts hit inside opaque-origin iframes and keeps it offline. React 18.3.1 is pinned for this reason (React 19 dropped UMD).

### D8 — Loop guard via acorn for the iframe
The iframe may share the main thread, so infinite loops are instrumented (`__guard()` at the top of each loop body, time-based). Workers don't need it because they can be terminated.

### D9 — No animation library
SVG + CSS transitions + a small rAF tween for graph nodes and FLIP for array cells cover every visualizer. Saves ~50 KB and makes reduced motion a single switch.

### D10 — Panels are data, not components
Content authors describe frames with ~11 panel types; they never write React. This is what makes it feasible to cover ~270 concepts and to accept contributions.

### D11 — Code anchors (`#@name`) instead of line numbers
Generators reference lines by name; the recorder resolves them. Editing displayed code can't silently break highlighting (an unknown anchor throws in tests).

### D12 — One annotated solution drives all four ladder levels
`@@blank@@` markers produce level 1 (fill blanks), level 2 (lines with blanks become `TODO`, grouped by depth), level 3 (signature only) and level 4 (blank page). Validation checks that skeletons and starters *fail* the tests (so a learner can't pass by clicking Run) and the solution passes.

### D13 — Level-1 blanks: exact match first, tests second
Exact (whitespace-insensitive) answers pass instantly with per-blank feedback. Anything else is run against the tests, so equivalent answers (`lo + (hi - lo) // 2`) are accepted.

### D14 — Ladder rules
Pass at your current level → promoted next time; 3 failed runs at a level → drop one level. Replaying a lower level is free practice and doesn't move the ladder. The *Type it* step completes only on a pass at level ≥ 2 (definition of done: "type it at least from skeleton level").

### D15 — Hint economics
Debug hint −5 XP (halves the debug reward). Boss: nudge −5, bigger hint −10, reveal −20; a revealed boss still has to be typed and passed, but earns 10 XP instead of 50 and is queued for review. Peeking at the practice solution costs 5 XP.

### D16 — Review queue: Leitner boxes, failures only
Only things the learner struggled with enter the queue (wrong predictions, debug needing hints/3+ fails, bosses needing big hints). Intervals 1/2/4/7/15/30 days; graduates after box 5.

### D17 — Content validated against real interpreters
`npm test` executes every Python solution/bug/boss with local CPython using the *same* `harness.py` as the browser, JS in Node, and JSX in jsdom using the *same* iframe harness. A "fuel" tracer stops infinite loops in buggy code during validation. CI installs Python 3.12.

### D18 — Generic git identity
Commits use a repo-local identity (`Tracewise Maintainers <maintainers@example.com>`) so no personal information enters history.

### D19 — Fonts: system stacks only
No web fonts are fetched (privacy, offline, speed). Code ligatures are disabled so `<=` never renders as `≤` while learners are learning to type it.

### D20 — Mini-Django and Next.js are labeled simulations
Real Django/Next.js can't run in a browser. M2 uses a small pure-Python teaching library (`src/py/minidjango`) whose API mirrors Django's names; M3's Next.js units visualize the concepts and run exercises as plain React. Units that simulate set `simulationNote`, shown in the UI.
