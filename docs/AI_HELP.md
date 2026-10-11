# AI help

Optional tutor beside the editor on NeetCode track problems. Off until the learner adds a Groq API key.

## How it works

- **No backend.** The browser calls `https://api.groq.com/openai/v1` directly (`/models` to validate the key and list models, `/chat/completions` with `stream: true`). Groq allows browser origins, so nothing of ours is in the path.
- **The key** is stored in `localStorage` under `tracewise:ai`, separate from the progress save. It is not in the export file, the cloud sync or any URL, and is never logged. "Reset everything" and the "Remove my key" button delete it. Anyone with access to this browser profile can read it, which the Settings card says plainly.
- **What is sent** when the learner asks something: the problem summary and example, a one-line teaching note, the learner's current code (up to 6,000 characters), the latest failing tests (at most 3) and the last 8 turns of the conversation. The reference solution is never sent.
- **Coaching, not answers.** The system prompt asks for small hints and questions and forbids writing the full function unless "Allow full solutions" is switched on. Code and test output are marked as data so text inside them is not treated as instructions.
- **Not offered** in boss attempts (no hints there by design) or the capstone.
- **Replies are plain text.** `Reply.tsx` renders fenced code, lists, `code` and **bold** with React elements only, never as HTML.
- **Models.** The list comes from the key's own `/models` response (chat models only); the default prefers `llama-3.3-70b-versatile`, then `openai/gpt-oss-120b`, then `llama-3.1-8b-instant`. Groq retires models from time to time, so nothing is hard-coded beyond that preference order.

## Layout

At 1100px and wider the panel docks to the right of the editor (open/closed is remembered). Below that it opens as a full-screen sheet from the "AI help" button, or from "Ask AI why it failed" under failing tests.

## Code

`src/ai/groq.ts` (client and config store), `src/ai/prompt.ts` (prompts), `src/ai/Reply.tsx`, `src/ai/AiAssist.tsx` (panel, key form, sheet), wired in through the `assist` prop of `TaskRunner` and used by `ProblemPage`. Tests: `src/ai/ai.test.ts` and `tests/e2e/ai.spec.ts` (Groq is mocked, no real key is used anywhere in the tests).
