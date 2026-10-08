# Content schema

Every concept is one TypeScript file: `src/content/units/<module>/<id>.ts`, default-exporting a `Unit`. The `id` must match the file name and an entry in `src/content/catalog.ts`. Files are discovered automatically — no registry to edit.

Types live in `src/content/types.ts` (units) and `src/engine/types.ts` (visualizers). A complete, annotated example is `src/content/units/dsa/binary-search.ts`.

## Unit

```ts
const unit: Unit = {
  id: 'binary-search',
  hook: 'One or two lines on why interviewers care.',     // supports `code` and **bold**
  predict: Question,                                       // asked BEFORE the visualizer
  viz: VizDef,                                             // the step-through visualizer
  vizInput?: { ... },                                      // override the viz default input
  deeper?: { points: string[]; complexity?: { time; space }; pitfalls?: string[] },
  practice: PracticeTask,                                  // the typing ladder
  debug: DebugTask,                                        // realistic bug to fix
  boss: BossTask,                                          // mini-boss with tiered hints
  quiz?: Question[],                                       // extra review questions
  simulationNote?: string,                                 // shown when a concept is simulated
};
export default unit;
```

### Question
```ts
{ prompt: string; code?: string; codeLang?: 'python' | 'javascript' | ...; options: string[]; answer: number /* index */; explain: string }
```

### Tasks (shared fields)
```ts
language: 'python' | 'javascript' | 'typescript' | 'jsx';
fnName: string;               // function/class/component the tests call
tests?: { args: unknown[]; expected: unknown; name?: string }[];   // python/js/ts
reactTests?: { name: string; steps: ReactStep[] }[];               // jsx
compare?: 'exact' | 'unordered' | 'nested' | 'float';
harness?: string;             // hidden code prepended (helper classes, builders)
adapter?: string;             // harness function called as adapter(fn, ...args)
```
Results are JSON-normalised: Python tuples → lists, sets → sorted lists, `float('inf')` → `"Infinity"`; JS `undefined` → `null`, `Set` → sorted array, `Map` → object.

`adapter` lets tests drive anything that isn't a plain function: build a linked list from an array, replay a list of operations against a class, call a mini-Django view with a fake request, etc.

### PracticeTask (ladder)
```ts
statement: string;   // what to implement, 1–2 sentences
signature: string;   // level 3 starter, e.g. "def binary_search(nums, target):"
solution: string;    // reference solution; wrap level-1 blanks in @@...@@ (≥ 2 blanks)
skeleton?: string;   // optional explicit level-2 starter
```
Derived levels: **1** fill the `@@blanks@@`; **2** every line containing a blank becomes `# TODO` (consecutive same-depth lines collapse); **3** signature + empty body; **4** blank editor + statement.

Rules (enforced by tests): solution passes; the level-2 skeleton and level-3 starter **fail**; at least 2 blanks; at least 2 tests.

Avoid `@@` inside code for any other purpose.

### DebugTask
```ts
statement: string; buggy: string; fixed: string;
bugType: string;      // 'off-by-one', 'wrong base case', 'mutation during iteration', 'stale closure', ...
hint: string; explanation: string;
```
Rules: `buggy` fails ≥ 1 test, `fixed` passes all. Bugs must be realistic interview bugs, ideally a one-line fix.

### BossTask
```ts
title: string; statement: string; starter: string; solution: string;
hints: [nudge: string, biggerHint: string];   // tier 3 reveals `solution`
combines?: string[];                          // other unit ids it builds on
```
Rules: `solution` passes, `starter` fails, exactly 2 hints.

### React tasks (`language: 'jsx'`)
`fnName` is the component name. Steps run inside the sandbox iframe against a fresh render per test:
```ts
{ click: 'button' } | { click: 'text=Add' }          // CSS selector or exact text
{ type: 'input', value: 'hello' }                     // sets value + fires input
{ expectText: 'Count: 1', in?: '.total' }
{ expectNoText: 'Loading' }
{ expectCount: 'li', n: 3 }
```
Hooks (`useState`, `useEffect`, …) are in scope; `import` lines are stripped.

## Visualizer (`VizDef`)

```ts
const code = `
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1        #@init
    while lo <= hi:                  #@loop
`;
const viz: VizDef<{ nums: number[]; target: number }> = {
  id: 'binary-search', title: 'Binary search', code, language: 'python',
  inputs: [
    { key: 'nums', label: 'Sorted array', kind: 'numbers', default: [1, 3, 5], maxItems: 24 },
    { key: 'target', label: 'Target', kind: 'number', default: 3 },
  ],
  presets: [{ label: 'Missing', input: { target: 4 } }],
  run(input) {
    const r = new Recorder(code);
    r.step('init', 'Caption: one plain-English line', [panel, ...], { lo, hi });
    return { frames: r.frames, result };
  },
  reference(input) { /* independent implementation */ },
};
```
Input kinds: `numbers`, `number`, `string`, `strings`, `edges` (`A-B:4, B-C`), `grid` (rows of space-separated cells), `json`, `select`.

Rules: ≥ 3 frames for every preset, every frame has a caption and ≥ 1 panel, anchors exist, graph edges reference existing nodes, `result` equals `reference(input)` when a reference is given. Keep captions short and concrete; show state, don't narrate theory.

### Panels (see `src/engine/types.ts`)
| type | use for | key fields |
|---|---|---|
| `array` | arrays, strings, sorting bars | `values`, `tones{i}`, `pointers{name:i}`, `range`, `bars`, `ids` (animate moves) |
| `grid` | DP tables, matrices, boards, bit grids, heatmaps | `cells`, `tones{"r,c"}`, `row/colLabels`, `arrows`, `heat`, `compact` |
| `graph` | trees, linked lists, graphs, architectures, scatter plots | `nodes{id,label,x,y,tone,shape,badge,tags}`, `edges{from,to,label,tone,directed,curve,dashed,flow}`, `width`, `height` |
| `list` | stacks, queues, call stacks | `items`, `orientation`, `endLabel` |
| `buckets` | hash tables | `buckets: ListItem[][]` |
| `sequence` | protocols (OAuth, TLS, MCP) | `actors`, `messages`, `active` |
| `timeline` | debounce, render modes, transactions | `lanes`, `tMax`, `now` |
| `chart` | growth curves, metrics | `series`, `kind`, `marker` |
| `log` / `kv` / `note` | console output, maps, callouts | — |

Tones: `default active compare swap visited frontier done found error muted path new`.

Layout helpers in `src/engine/layout.ts`: `buildTree` + `binaryTreePanel`, `nTreePanel` (call trees, tries), `linkedListPanel`, `circleLayout`, `layeredLayout`, `graphPanel`.

## Checking your unit

```bash
npm run check:unit -- binary-search      # validate one or more units (comma separated)
npm run test:content                      # validate everything
```
