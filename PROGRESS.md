# Progress

_Read this first when resuming. Then read `docs/` (ARCHITECTURE, DECISIONS, CONTENT_SCHEMA, AUTHORING_BRIEF, TEACHING_LIBRARIES, COVERAGE)._

## Status: complete (all phases built and verified)

**All 274 required concepts are done** — each has a verified visualizer, drills (predict, type ladder, debug) and a mini-boss. See `docs/COVERAGE.md` (generated from real validation results; 274 / 274 ✅).

| Module | Concepts |
|---|---|
| M1 DSA | 83 / 83 |
| M2 Backend | 41 / 41 |
| M3 Frontend | 49 / 49 |
| M4 System Design | 39 / 39 |
| M5 AI Engineering | 38 / 38 |
| M6 Cloud & DevOps | 24 / 24 |

### What works (all verified by running it)
- Visualizer engine + player: 11 panel types, step/scrub/speed, code panel, variables, op counter, editable inputs, **Predict mode**.
- Runners: Pyodide (lazy, self-hosted), JS/TS worker, sandboxed React iframe; hard timeouts that kill and recover.
- Learning loop: Predict → Watch → Type (4-level ladder with auto promote/demote) → Debug → Mini-boss with tiered hints and XP costs.
- Gamification: XP, levels, streaks, daily goal, badges, world map, focus mode, optional sound, light/dark, reduced motion.
- Practice modes: spaced-repetition review queue, Quick 10, timed no-hint Interview Mode with score report, Syntax Gym, trace-your-own-Python, architecture lab.
- Capstone: 3 projects (task manager, URL shortener, notes search), 20+ milestones, automated checks, live preview over an in-browser mock network, certificate page.
- Data: localStorage with versioned schema + migrations, Export/Import JSON.
- Offline/PWA: service worker; offline e2e test passes (including Python).
- Accessibility: axe checks pass in both themes; keyboard shortcuts.
- Tests: unit + content validation (all 274 units against real Python/Node/jsdom), Python library tests, capstone milestone validation, 32 Playwright e2e tests including a smoke test that plays every visualizer to its last frame.

## Known issues / cut scope
- Frame counts/caption lengths of agent-written visualizers are validated structurally (valid lines, captions, panels, reference match) but only a sample were reviewed visually.
- Trace mode supports Python only; JS tracing was cut.
- Predict-mode distractors come from other captions of the same run, so very short runs (<5 frames) skip the quiz.
- Mini-Django is a simulation (labelled in the UI); query strings in the capstone mock network aren't URL-decoded.
- Sound effects are synthesized blips (no assets).
- Service worker caches assets on first use; offline works after one online visit that touched the pages you want.

## Commands
```bash
npm install                    # also copies Pyodide into public/pyodide (needs Node 20+)
npm run dev                    # http://localhost:5173
npm test                       # unit + content validation + python libs (needs Python 3.11+; ~6 min for full content)
npm run check:unit -- <ids>    # validate specific units quickly
npm run build && npm run e2e   # production build + Playwright (npx playwright install chromium once)
npm run verify                 # lint + typecheck + test + build + e2e
npm run coverage:docs          # regenerate docs/COVERAGE.md from real validation results
SHOTS=1 npx playwright test    # regenerate README screenshots (after build)
```
Deploy: push to `main` (GitHub Pages workflow) or deploy `dist/` to Netlify/Vercel (`netlify.toml`, `vercel.json` included).
