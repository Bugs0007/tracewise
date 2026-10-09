# Progress

_Read this first when resuming. Then read `docs/` (ARCHITECTURE, DECISIONS, CONTENT_SCHEMA, AUTHORING_BRIEF, TEACHING_LIBRARIES, COVERAGE)._

## Status: Phase 5 (content completion + polish)

Phases 0–4 infrastructure is done. The remaining work is finishing and validating content units, then a final verification pass.

## Done and verified
- **Phase 0**: docs, scaffold, lint, typecheck, Vitest, Playwright, CI + GitHub Pages deploy, MIT license.
- **Phase 1**: visualizer engine + player (11 panel types, predict-next quiz), Pyodide/JS/React runners with kill-on-timeout, content validator, progress store (XP, streak, Leitner review, badges, export/import with migrations), Home / Map / Unit flow / Lab / Syntax Gym / Settings.
- **Phase 2**: **M1 DSA: all 83 concepts validated** (visualizer vs reference, drills, boss). Review queue, Quick 10, Interview Mode, "trace your own Python".
- **Phase 3**: mini-Django (`src/py/minidjango`: ORM with SQL log + index scans, routing + middleware, serializers, auth/JWT, transactions, migrations) and mock-LLM (`src/py/minillm`), both unit-tested and verified inside Pyodide. M2/M3 units largely written and validated.
- **Phase 4 (infra)**: architecture lab (drag/wire components, run traffic, bottleneck detection).
- **Phase 5**: capstone with 3 projects (task manager, URL shortener, notes search) — every milestone validated against the real Python backend; mock network, live preview, tiered hints, printable certificate. Accessibility pass (WCAG AA contrast in both themes, axe checks, reduced motion, keyboard). README with screenshots, CONTRIBUTING, deploy configs, service worker.
- **Tests**: unit/content tests, Python library tests, 27 Playwright e2e tests (core loop, runner timeouts, review/interview/trace, export/import, capstone, a11y in both themes).

## In progress when this was written
Content agents were completing the last units of M2/M3 (≈10), M4 (≈22), M5 (≈24) and M6 (≈14). Check `docs/COVERAGE.md` (regenerate with `npm run coverage:docs`) for exactly what is verified. Anything still ⬜ in that table is **not started**; ❌ means present but failing checks.

To finish: `node` script in this file's history lists missing ids; easiest is to open `docs/COVERAGE.md`, take the ⬜ rows and follow `docs/AUTHORING_BRIEF.md`.

## Known issues / cut scope
- Content counts per module are in `docs/COVERAGE.md`; units not yet written show as "not started" and appear locked on the map.
- Trace mode supports Python only; JS tracing was cut.
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
