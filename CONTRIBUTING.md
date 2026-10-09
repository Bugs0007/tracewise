# Contributing to Tracewise

Thanks for helping! Most contributions are **content**: a lesson ("unit") is a single TypeScript data file. You don't need to touch React.

## Setup

```bash
npm install            # also copies the Pyodide runtime into public/pyodide
npm run dev            # http://localhost:5173
```
You need Node 20+ and **Python 3.11+** (the content validator runs every exercise with real Python).

## Add or improve a lesson

1. Find the concept in `src/content/catalog.ts` (or add a row there).
2. Create `src/content/units/<module>/<id>.ts` exporting a default `Unit`. Start by copying `src/content/units/dsa/binary-search.ts`.
3. Read `docs/CONTENT_SCHEMA.md` — it documents every field, panel type and rule. For backend/AI units read `docs/TEACHING_LIBRARIES.md` too.
4. Validate it:
   ```bash
   npm run check:unit -- <id>
   ```
   This runs the visualizer on every preset, compares its result to your `reference`, and executes your solution, skeleton, starter, buggy and fixed code against the tests. It must pass.
5. Open `http://localhost:5173/#/unit/<id>` and play through all five steps.
6. `npm run coverage:docs` updates `docs/COVERAGE.md`.

### What makes a good unit
- **Visualizer**: drive it from the real algorithm (record frames with `Recorder` as it runs — never hand-written frames). Short, concrete captions. Meaningful tones. 2–4 presets including edge cases.
- **Predict**: a question people genuinely get wrong.
- **Practice**: 3–7 `@@blanks@@` on the lines that matter; tests with edge cases.
- **Debug**: a bug you have actually seen in interviews or code review, ideally a one-line fix.
- **Boss**: a classic problem that combines this idea with an earlier one, plus two hints that teach rather than tell.
- Write everything in your own words. No references to real people, companies or resumes.

## Code changes

```bash
npm run verify     # lint + typecheck + unit/content tests + build + Playwright e2e
```
Keep dependencies lean and licences clear (MIT/Apache/BSD/MPL). Explain notable decisions in `docs/DECISIONS.md`.

## Capstone projects

Capstones live in `src/content/capstone/` (schema in `types.ts`, reference project `task-manager.ts`; new projects go in `projects/`). `npx vitest run src/content/capstone` checks every milestone's reference against the real Python backend and that the previous milestone's code fails.
