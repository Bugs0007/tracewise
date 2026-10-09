# Tracewise

**Watch it. Predict it. Type it yourself.** An open-source, interactive interview-prep console for software engineers — step-through visualizers driven by real execution, then a typing ladder that fades the scaffolding until you can write it from a blank page.

Runs entirely in your browser: no backend, no accounts, no tracking. Python runs in WebAssembly (Pyodide), JavaScript in a worker, React in a sandboxed iframe. Your progress stays in local storage, with JSON export/import.

> Built for developers who've leaned on AI coding tools and want their hands back on the keyboard: short units, instant feedback, no walls of text, and **no AI help anywhere in the app**.

## What's inside

| | |
|---|---|
| **Visualizer engine** | Every concept is a step-recorded run of real code: arrays, trees, graphs, DP tables with dependency arrows, call trees, hash buckets, sequence diagrams, timelines, charts. Play, step, scrub, change the input, and turn on **Predict mode** to guess each next step. |
| **Learning loop** | Hook → Predict → Watch → **Type it** (fill blanks → complete the body → signature only → blank page, auto-promoting) → **Debug** a realistic bug → **Mini-boss** with tiered hints. |
| **Modules** | M1 DSA · M2 Backend (Python, Django-style REST via an in-browser mini-Django) · M3 Frontend (JS, React, Next.js concepts, CSS, web) · M4 System Design (SOLID, patterns, LLD, HLD + architecture lab) · M5 AI Engineering (tokens, embeddings, RAG, LangGraph, MCP, agents — with deterministic mock models) · M6 Cloud & DevOps. See [docs/COVERAGE.md](docs/COVERAGE.md) for the verified status of every concept. |
| **Practice modes** | Spaced-repetition review queue, Quick 10-minute session, timed no-hint **Interview Mode** with a score report, **Syntax Gym** for raw typing muscle memory, "trace your own Python" in the Lab. |
| **Capstone** | Build a full-stack app by hand: a minidjango backend in Pyodide + a React frontend in the sandbox, talking over an in-browser mock network, with automated milestone checks and a printable certificate. |
| **Gamification** | XP, levels, daily streak and goal, world map per module, badges, focus mode, satisfying-but-short celebrations, optional sound. |
| **Accessibility** | Keyboard shortcuts everywhere, reduced-motion switch, light/dark themes, screen-reader labels on visualizers. |

## Run it

```bash
npm install        # Node 20+; also copies Pyodide into public/pyodide
npm run dev        # http://localhost:5173
```

## Test it

```bash
npm test           # unit tests + content validation (needs Python 3.11+)
npm run build
npm run e2e        # Playwright against the production build (npx playwright install chromium once)
npm run verify     # everything above + lint + typecheck
```

The content validator executes every lesson's solution, skeletons, starters, buggy and fixed code with real Python/Node/jsdom, runs every visualizer on every preset and compares results with independent reference implementations.

## Deploy

`npm run build` produces a fully static `dist/` with relative URLs and hash routing:
- **GitHub Pages**: push to `main`; `.github/workflows/deploy.yml` publishes it.
- **Netlify / Vercel**: `netlify.toml` and `vercel.json` are included (build `npm run build`, output `dist`).
- Any static file server works. After the first visit the service worker makes it available offline.

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Decisions](docs/DECISIONS.md) · [Content schema](docs/CONTENT_SCHEMA.md) · [Teaching libraries](docs/TEACHING_LIBRARIES.md) · [Coverage](docs/COVERAGE.md)
- [Contributing](CONTRIBUTING.md) — adding a lesson is one data file.

## Honesty notes

Django, Next.js and LLMs can't run in a browser. Backend exercises use **minidjango**, a small library that mirrors Django's API; Next.js exercises are labelled simulations of the concepts; AI exercises use deterministic mock models. Units that simulate say so.

## License

[MIT](LICENSE)
