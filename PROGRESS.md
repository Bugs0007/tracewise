# Progress

_Read this first when resuming. Then read `docs/` (ARCHITECTURE, DECISIONS, CONTENT_SCHEMA, COVERAGE)._

## Current phase
**Phase 2 — M1 DSA content, review queue, Interview Mode v1** (in progress; session paused at the usage limit)

Phase 1 done. Remaining work is content-heavy and suited to a cheaper model.

## Done
- **Phase 0**: docs, scaffold, ESLint, typecheck, Vitest, Playwright, CI + GitHub Pages deploy, MIT license.
- **Phase 1**: visualizer engine + player (11 panel types, predict-next quiz), Pyodide/JS/React runners with timeouts, content validator, progress store with export/import and migrations, Home / Map / Unit flow / Lab / Gym / Settings, units `binary-search`, `bfs`, `ll-reverse`, e2e for the full loop.
- **Phase 2 (partial, committed)**: Review queue page (Leitner), Quick 10 session, Interview Mode v1 (timed, no hints, score report → review queue), Lab "Trace your own Python" (sys.settrace → frames), shared content helpers in `src/content/lib/` (list/tree/ops harnesses, graph helpers). E2E: 10 tests pass (`tests/e2e/`).

## In flight when paused — VERIFY BEFORE COMMITTING
Ten content batches were being written by parallel agents into `src/content/units/dsa/*.ts` and `src/content/lib/<batch>.ts` (arrays/pointers, lists/stacks, hashing/bits/Big-O, trees ×2, sorting, recursion/greedy, DP, graphs, shortest paths/MST). These files are **uncommitted** and may be incomplete. To resume:
1. `npx tsc --noEmit -p tsconfig.json` and `npm run test:content` — delete or fix any unit that fails (`npm run check:unit -- <id>`).
2. `npm run coverage:docs` to regenerate `docs/COVERAGE.md`, then commit.

## Next
1. Finish/verify M1 units (≈80), then commit Phase 2.
2. Phase 3: `src/py/minidjango` teaching library + M2 units; M3 units (JSX tasks use the sandbox; validator already supports them).
3. Phase 4: M4, M5 (`src/py/minillm` mock models). Phase 5: capstone, M6, polish, README screenshots, CONTRIBUTING.md.

## Known issues
- Capstone and Certificate pages are placeholders (Phase 5).
- `npm run verify` = lint + typecheck + tests + build + e2e.

## Commands
```bash
npm install          # also copies Pyodide into public/pyodide
npm run dev          # http://localhost:5173
npm test             # unit + content validation (needs Python 3.11+)
npm run build && npm run e2e
```
Deploy: push to `main` (GitHub Pages workflow), or deploy `dist/` to Netlify/Vercel (configs included).
