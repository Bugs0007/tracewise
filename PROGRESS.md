# Progress

_Read this first when resuming. Then read `docs/`._

## Current phase
**Phase 1 — Foundations** (in progress)

## Done
- Phase 0: docs (`ARCHITECTURE`, `DECISIONS`, `CONTENT_SCHEMA`, generated `COVERAGE`), repo scaffold, lint, typecheck, Vitest, CI + Pages deploy workflow, MIT license.
- Engine: frame/panel types, `Recorder` with code anchors + op counter, layouts (binary tree, n-ary tree, linked list, graphs), input parsing.
- Player: 11 panel renderers, controls, scrub, speed, code panel, variables panel, op counter, editable inputs + presets, Predict mode quiz.
- Runners: Pyodide worker (self-hosted, lazy), JS/TS worker, React sandbox iframe; timeouts kill + recover (verified in browser).
- Content validator (CPython + Node + jsdom) and coverage generator.
- Store: XP/levels, streak, daily XP, ladder state, hints, Leitner review, badges; versioned save with migrations; export/import UI.
- Pages: Home, Map, Unit flow (Predict → Watch → Type ladder → Debug → Boss), Lab, Syntax Gym, Settings.
- Unit: binary-search (validated).

## Next
- BFS unit, linked-list reverse unit; Playwright e2e for key flows; commit Phase 1.

## Known issues
- Review, Interview, Capstone, Certificate and Trace pages are placeholders until Phase 2/5.
