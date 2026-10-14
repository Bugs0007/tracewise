# AI Field Guide

Open `#/ai-stories` from **AI Guide** in the top navigation, the home-page card, or the AI Engineering module. The original code-based AI units remain available.

The guide is a separate, browser-local, theory-first course. Its fictional Northstar Support team builds an assistant from a first classifier through grounded answers and controlled actions. Each of 44 lessons has a three-scene conceptual diagram, an analogy with its limitations, technical mechanisms, tradeoffs, misconception feedback, a spoken-answer rubric and a follow-up question. Ten reusable experiment types calculate or simulate selected concepts using labeled toy data. No model calls, microphone access, credentials or coding exercises are required.

## Routes and learning paths

- `#/ai-stories`: full curriculum, searchable by title, concept terms and scenario; includes a two-day priority route with per-day study estimates.
- `#/ai-stories/<lesson-id>`: the story, an experiment where relevant, and explanation practice.
- `#/ai-stories/<lesson-id>?activity=interview`: opens directly into recall practice.
- `#/ai-stories/review`: due lessons and all practiced lessons.
- `#/ai-stories/interview`: eight scenario-based mock questions with an optional pausable timer and self-assessment.
- `#/ai-stories/sources`: primary papers and official technical references.

The 11 chapters cover ML/data foundations, neural networks/transformers, token generation, prompting/context, search/embeddings, RAG, agents/tools/MCP, adaptation, evaluation/security, production operations and system design/multimodality. The course gives a broad interview foundation rather than a guarantee of exhaustive coverage for every AI role.

## Practice and persistence

A lesson is marked **practiced** only after a correct concept check and the learner checking all three spoken-answer rubric points. This is self-assessment, not automated grading or a readiness certification. Confidence schedules a review immediately, in one day, or in three days. The learner can review anything at any time.

Notes, path selection, last lesson and practice records use the versioned local-storage key `tracewise:ai-field-guide:v1`. They are separate from account sync, XP and the existing progress export/import. Notes are capped at 6,000 characters per lesson. Invalid storage falls back safely; storage write failure shows an alert. Mock checklists stay in session memory. Browser storage removal removes this guide's records.

## Authoring and validation

- `src/field-guide/curriculum.ts`: typed content, chapter sequence, references and mock scenarios.
- `types.ts`: required teaching fields.
- `model.ts`: storage validation, review scheduling and experiment calculations.
- `Labs.tsx`: ten experiments; no external requests or actual model training.
- `FieldGuidePage.tsx` and `field-guide.css`: responsive reader, dashboard and practice UI.

Run `npx vitest run src/field-guide`, `npm run build`, then `npx playwright test tests/e2e/field-guide.spec.ts`. Browser tests cover discovery/search, concept feedback, notes and reload, recall links, sampling/retrieval experiments, action permissions, mock interviews, accessibility and mobile sizing.

Conceptual flows are not execution traces. Attention scores, retrieval scores, curves, geometry, pricing and timing assumptions are explicitly labeled as synthetic/illustrative. Source links support deeper reading; current framework/provider details should be checked against official documentation.
