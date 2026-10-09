# Design progress: "Riso Trace" restyle

_If context resets: read this file and the original brief (summary below) first._

## Rules for this work
- Restyle only: tokens, base CSS, shell/chrome, shared panel renderers, page layouts. **Do not touch** content files (`src/content/units|capstone|lib`), step generators, stores, test behavior.
- Work sequentially, no subagents. Cap screenshots (~30 total, reuse). Run e2e only for touched areas per phase; **full e2e once at the end**.
- No gradients, glows, drop shadows, caps eyebrows, middle-dot meta strings, arrows on buttons, hover-lift, scroll fade-ins, uniform card grids.
- Ink semantics (one meaning everywhere): cobalt = current/active, mustard = queued/frontier, tomato = comparing/error/bug, mint = done/found/correct. Idle = outline at 40% ink.
- Fonts: Schibsted Grotesk (UI) + Commit Mono (code), self-hosted via fontsource. Min text 13px, 14px for read text.
- Commit after each phase as `Bugs0007` (identity already configured).

## Looking pass (before): what is weak
Screens reviewed: home, map, lesson (watch), graph/sequence/timeline panels, phone lesson.
- Generic navy/indigo SaaS look; blue→teal gradients on primary buttons, logo, level chip, progress bars, hero headline phrase.
- Home: six identical rounded cards, five stat tiles showing zeros, ring percentages that all say 0%, caps eyebrows, middle-dot meta strings.
- Left icon rail with 10px labels (unreadable), top bar crowded.
- Lesson: step tabs are pills with numbers; scrubber is a plain range input; captions are in a box; code/vars panels same chrome as everything; low-contrast tiny labels (pnl-title 11px caps, vars 13px mono dim).
- Panels: edge labels collide on weighted graphs (Dijkstra: weights `1`, `10`, `2` overlap near C–D); sequence diagram labels sit on arrows and overlap the header row; timeline event labels clip ("rese reset"); array range label clipped at top on phone; glow/shadow on active nodes.
- Phone: bottom tab bar has 8 tiny items; input rows stack with large gaps.
- Tone colors map to many hues with no stable meaning (violet frontier, pink swap, blue compare, orange active...).

## Phases
1. Tokens and base: done
2. App shell + Home
3. Lesson page (stepper, stage, scrubber, predict, editor/results)
4. 11 panel renderers (+ legend)
5. Remaining pages
6. Polish and QA, full e2e once, README screenshots, push

## Done
- Contributor attribution: git identity switched to the owner's GitHub noreply address for all new commits.
- Look-before pass complete (screens in scratch dir, not committed).

## Decisions
- Keep existing CSS class names the TSX already uses (`btn`, `chip`, `card`, `callout`, `bar`, `seg`, `toggle`, `opt`, `step-tab`, ...) and restyle them in place; new components get new classes.
- Tone names in the engine stay (`active`, `compare`, `swap`, `visited`, `frontier`, `done`, `found`, `error`, `muted`, `path`, `new`); they are *mapped* onto the four inks in CSS: active→cobalt, compare→tomato, swap→tomato, frontier→mustard, done/found/path/new→mint, visited→ink 55% fill, default→outline, muted→outline 25%.
