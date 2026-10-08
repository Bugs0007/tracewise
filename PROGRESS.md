# Progress

_Read this first when resuming. Then read `docs/` (ARCHITECTURE, DECISIONS, CONTENT_SCHEMA, COVERAGE)._

## Current phase
**Phase 2 — M1 DSA content, review queue, Interview Mode v1** (starting)

Phase 1 done. Remaining work is content-heavy and suited to a cheaper model.

## Done
- **Phase 0**: docs (`ARCHITECTURE`, `DECISIONS`, `CONTENT_SCHEMA`, generated `COVERAGE`), scaffold, ESLint, typecheck, Vitest, Playwright, CI + GitHub Pages deploy, MIT license.
- **Phase 1**:
  - Engine: frame/panel types, `Recorder` (code anchors, op counter, deep-cloned snapshots), layouts (binary tree, n-ary tree, linked list, layered/circle graph), input parsing.
  - Player: 11 panel renderers (array w/ FLIP, grid w/ arrows/heat, graph w/ tweening, list, buckets, sequence, timeline, chart, log, kv, note), play/pause/step/scrub/speed/reset/end, code panel with current line, variables panel with change flash, op counter, editable inputs + presets + random, Predict-mode quiz, keyboard shortcuts.
  - Runners: Pyodide worker (self-hosted, lazy), JS/TS worker, React sandbox iframe with loop guard + fetch bridge; timeouts kill + recover (e2e verified).
  - Content validator (CPython/Node/jsdom with the browser's own harnesses) + validator self-tests; coverage generator.
  - Store: XP/levels, streak, daily XP, ladder promote/demote, hint costs, Leitner review queue, badges; versioned save + migrations + sanitising; export/import UI.
  - Pages: Home dashboard, world Map, Unit flow (Predict → Watch → Type ladder L1–L4 → Debug → Boss with tiered hints), Lab, Syntax Gym (36 snippets), Settings (theme, motion, sound, focus, font size, export/import/reset).
  - Units (validated): `binary-search`, `bfs`, `ll-reverse`.
  - E2E (Playwright, prod build): home, full binary-search loop incl. Pyodide, timeout recovery, BFS + predict quiz, export/import round trip, gym.

## Next
1. M1 DSA units (≈80) via parallel content batches.
2. Review queue page + Quick 10 session; Interview Mode v1; Lab "trace your own code".

## Known issues / notes
- Review, Interview, Capstone, Certificate and Trace pages are placeholders until Phase 2/5.
- `npm run verify` = lint + typecheck + unit/content tests + build + e2e.
