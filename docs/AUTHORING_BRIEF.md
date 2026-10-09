# Authoring brief for content units

Everything an author (human or agent) needs to add units to Tracewise. Read this, `docs/CONTENT_SCHEMA.md` and, for backend/AI units, `docs/TEACHING_LIBRARIES.md`.

## Read first
1. `docs/CONTENT_SCHEMA.md` — Unit/VizDef/task types, panel types, rules.
2. `src/engine/types.ts`, `src/content/types.ts`, `src/engine/recorder.ts`, `src/engine/layout.ts`, `src/content/lib/harness.ts`.
3. Reference units: `src/content/units/dsa/binary-search.ts`, `src/content/units/dsa/bfs.ts`. For module-specific style look at any existing file in `src/content/units/<module>/` — copy a sibling's structure.
4. JS/React tasks: `src/runner/js-core.ts`, `src/runner/reactSandbox.ts`.

## Quality bar (checked by `npm run check:unit -- <ids>`)
- **Visualizer**: simulate the real algorithm/concept inside `run()` and record frames with `Recorder` — never hand-written frame lists. 10–60 frames on the default input; captions ≤ 90 characters, concrete ("nums[4]=9 > 7 → hi = 3"); meaningful tones; `vars` for live state; `r.op()` for operation counts. 2–4 `presets` incl. edge cases; return `result`; provide an independent `reference(input)`. Throw a clear `Error` on invalid input. Code panel code carries `#@anchor` (Python) / `//@anchor` (JS) markers at the END of lines the frames point at, with nothing after them.
- **hook**: 1–2 sentences on why interviewers care. **predict**: a question people genuinely get wrong; 4 options, `explain`.
- **deeper**: 3–5 points, complexity (optional), 2–3 pitfalls.
- **practice**: 3–7 `@@blanks@@` on key logic; ≥ 4 tests with edge cases. The validator checks the level-2 skeleton and level-3 starter FAIL and the solution PASSES. JS task signatures end with `{`.
- **debug**: realistic bug, ideally a one-line fix; `buggy` fails ≥ 1 test, `fixed` passes all; precise `hint` and `explanation`.
- **boss**: classic problem combining earlier ideas; starter = signature + empty body/pass; ≥ 4 tests; exactly 2 hints; `combines`.
- Test args are JSON-serialisable and deterministic (inject time/randomness as parameters). Use `compare: 'unordered' | 'nested' | 'float'` where order doesn't matter.
- Never use `@@` except for blanks. Inside TS template literals escape backticks and `${`; prefer string concatenation in exercise code.
- Simulated concepts (mini-Django, Next.js-style, mock LLM) set `simulationNote`.
- Shared helpers go in `src/content/lib/<your-batch>.ts` — never put non-unit files in `src/content/units/`.
- Write everything in your own words. No references to real people, companies, employers or resumes.

## Validate
```bash
npm run check:unit -- id1,id2          # per unit (fast)
npx tsc --noEmit -p tsconfig.json      # fix errors in YOUR files only (other authors work concurrently)
npx eslint <your files>
```
Do not create scratch test files in the repo; do not run git, build or Playwright; do not edit engine, player, runner, catalog, docs, src/py or other units.
