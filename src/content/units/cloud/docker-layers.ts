import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kv, list, step } from '@/content/lib/cloud-devops';

const code = `
def rebuilt_layers(old, new, changed):
    rebuilt = []
    miss = False
    for i, line in enumerate(new):                            #@loop
        if not miss and (i >= len(old) or old[i] != line):    #@diff
            miss = True                                       #@miss
        elif not miss and touches(line, changed):             #@files
            miss = True                                       #@filemiss
        if miss:                                              #@decide
            rebuilt.append(i)                                 #@rebuild
    return rebuilt
`;

const KEYWORDS = new Set(['FROM', 'WORKDIR', 'COPY', 'ADD', 'RUN', 'ENV', 'ARG', 'EXPOSE', 'CMD', 'ENTRYPOINT', 'USER', 'LABEL', 'VOLUME']);

const secondsOf = (line: string): number => {
  const k = line.split(/\s+/)[0].toUpperCase();
  return k === 'RUN' ? 10 : k === 'FROM' ? 3 : k === 'COPY' || k === 'ADD' ? 2 : 1;
};

/** Does a COPY/ADD line read any of the changed files? */
function touches(line: string, changed: string[]): boolean {
  const parts = line.split(/\s+/);
  if (parts[0] !== 'COPY' && parts[0] !== 'ADD') return false;
  const srcs = parts.slice(1).filter((p) => !p.startsWith('--')).slice(0, -1);
  return srcs.some((s) => changed.some((f) => s === '.' || s === './' || f === s || f.startsWith(s.replace(/\/+$/, '') + '/')));
}

interface In {
  before: string[];
  after: string[];
  changed: string[];
}

const BASE = ['FROM python:3.12-slim', 'WORKDIR /app', 'COPY requirements.txt .', 'RUN pip install -r requirements.txt', 'COPY . .', 'CMD python app.py'];
const BAD_ORDER = ['FROM python:3.12-slim', 'WORKDIR /app', 'COPY . .', 'RUN pip install -r requirements.txt', 'CMD python app.py'];

function check(lines: string[], label: string): string[] {
  if (!lines.length) throw new Error(`${label}: add at least one instruction`);
  if (lines.length > 10) throw new Error(`${label}: use at most 10 instructions`);
  return lines.map((l) => {
    const t = l.trim().replace(/\s+/g, ' ');
    const k = t.split(' ')[0];
    if (!KEYWORDS.has(k)) throw new Error(`${label}: "${t}" must start with an instruction such as FROM, COPY, RUN`);
    return t;
  });
}

const viz: VizDef<In> = {
  id: 'docker-layers',
  title: 'Docker layer cache',
  code,
  language: 'python',
  inputs: [
    { key: 'before', label: 'Dockerfile of the last build', kind: 'strings', default: BASE, maxItems: 10, help: 'One instruction per item, separated by commas (so avoid commas inside instructions).' },
    { key: 'after', label: 'Dockerfile now', kind: 'strings', default: BASE, maxItems: 10 },
    { key: 'changed', label: 'Files changed since then', kind: 'strings', default: ['app.py'], maxItems: 6, help: 'e.g. app.py, requirements.txt' },
  ],
  presets: [
    { label: 'Edit app code', input: { before: BASE, after: BASE, changed: ['app.py'] } },
    { label: 'Bump a dependency', input: { before: BASE, after: BASE, changed: ['requirements.txt'] } },
    { label: 'COPY . . too early', input: { before: BAD_ORDER, after: BAD_ORDER, changed: ['app.py'] } },
    { label: 'Insert an ENV line', input: { before: BASE, after: ['FROM python:3.12-slim', 'ENV MODE=prod', ...BASE.slice(1)], changed: [] } },
  ],
  run(input) {
    const before = check(input.before, 'Last build');
    const after = check(input.after, 'Dockerfile now');
    const changed = input.changed.map((c) => c.trim()).filter(Boolean);
    const r = new Recorder(code);
    const status: ('cached' | 'rebuilt' | null)[] = after.map(() => null);
    let seconds = 0;
    const full = after.reduce((a, l) => a + secondsOf(l), 0);
    const rebuilt: number[] = [];

    const oldPanel = (): Panel =>
      list(
        'Cache from the last build (bottom = first layer)',
        before.map((l, i): ListItem => ({ id: 'o' + i, label: l, tone: 'muted' as Tone })),
        { startLabel: 'base', endLabel: 'top' },
      );
    const newPanel = (current: number): Panel =>
      list(
        'This build',
        after.map((l, i): ListItem => {
          const s = status[i];
          const tone: Tone = i === current ? 'active' : s === 'cached' ? 'done' : s === 'rebuilt' ? 'new' : 'default';
          return { id: 'n' + i, label: l, tone, sub: s === 'cached' ? 'CACHED' : s === 'rebuilt' ? `REBUILT +${secondsOf(l)}s` : undefined };
        }),
        { startLabel: 'base', endLabel: 'top' },
      );
    const stats = (): Panel => kv('Build time', { 'this build': seconds + 's', 'no cache': full + 's', 'changed files': changed.join(', ') || '(none)' });
    const view = (cur: number): Panel[] => [oldPanel(), newPanel(cur), stats()];

    step(r, 'loop', `Compare the new Dockerfile with the cached build, layer by layer. Changed: ${changed.join(', ') || 'no files'}`, view(-1), { layers: after.length });
    let miss = false;
    after.forEach((line, i) => {
      r.op();
      status[i] = null;
      if (!miss && (i >= before.length || before[i] !== line)) {
        miss = true;
        step(r, 'miss', i >= before.length ? `Layer ${i} is new: no cache entry, so it is built` : `Layer ${i} text differs from the cache: miss`, view(i), { layer: i, miss });
      } else if (!miss && touches(line, changed)) {
        miss = true;
        step(r, 'filemiss', `Layer ${i} copies a changed file: its checksum differs, so miss`, view(i), { layer: i, miss });
      }
      if (miss) {
        status[i] = 'rebuilt';
        rebuilt.push(i);
        seconds += secondsOf(line);
        step(r, 'rebuild', i === rebuilt[0] ? `Rebuild layer ${i}: ${line}` : `Layer ${i} sits on a changed layer, so it rebuilds too`, view(-1), { layer: i, seconds });
      } else {
        status[i] = 'cached';
        step(r, 'decide', `Layer ${i} unchanged and every layer below it is cached: reuse`, view(-1), { layer: i, seconds });
      }
    });
    step(r, 'loop', rebuilt.length ? `${rebuilt.length} of ${after.length} layers rebuilt in ${seconds}s (a cold build takes ${full}s)` : `Everything cached: 0s instead of ${full}s`, view(-1), { rebuilt: rebuilt.length, seconds });
    return { frames: r.frames, result: { rebuilt, seconds } };
  },
  reference(input) {
    const before = input.before.map((l) => l.trim().replace(/\s+/g, ' '));
    const after = input.after.map((l) => l.trim().replace(/\s+/g, ' '));
    const changed = input.changed.map((c) => c.trim()).filter(Boolean);
    // First layer that no longer matches the cache, then everything above it.
    let firstDiff = after.length;
    for (let i = 0; i < after.length; i++) if (i >= before.length || before[i] !== after[i]) { firstDiff = i; break; }
    let firstTouch = after.length;
    for (let i = 0; i < after.length; i++) if (touches(after[i], changed)) { firstTouch = i; break; }
    const start = Math.min(firstDiff, firstTouch);
    const rebuilt = Array.from({ length: after.length - start }, (_, k) => start + k);
    return { rebuilt, seconds: rebuilt.reduce((a, i) => a + secondsOf(after[i]), 0) };
  },
};

const FILES_HARNESS = `
def copied_files(line, files):
    parts = line.split()
    if parts[0] not in ("COPY", "ADD"):
        return []
    srcs = [p for p in parts[1:] if not p.startswith("--")][:-1]
    out = []
    for f in sorted(files):
        for s in srcs:
            if s in (".", "./") or f == s or f.startswith(s.rstrip("/") + "/"):
                out.append(f)
                break
    return out

def touches(line, changed):
    return len(copied_files(line, changed)) > 0
`;

const OLD = ['FROM python:3.12', 'WORKDIR /app', 'COPY requirements.txt .', 'RUN pip install -r requirements.txt', 'COPY . .', 'CMD python app.py'];

const unit: Unit = {
  id: 'docker-layers',
  hook: '"Why is my image build slow?" is a favourite question. The answer is layer caching: one changed line invalidates every layer after it, so instruction order decides your build time.',
  predict: {
    prompt: 'A Dockerfile copies the whole source (COPY . .) and then runs pip install. You change one line of app code. What gets rebuilt?',
    options: ['Only the COPY layer', 'The COPY layer and everything after it, including pip install', 'Nothing; app code is not part of the image', 'Only the final CMD layer'],
    answer: 1,
    explain: 'A layer is cached only if its instruction, its inputs and every parent layer are unchanged. The copied files changed, so that layer and all later ones (pip install!) rebuild. Copy requirements.txt first and install before copying the code.',
  },
  viz,
  deeper: {
    points: [
      'Each instruction that changes the filesystem creates a **layer**. Layers are content-addressed and shared between images.',
      'The cache key of a layer includes the **parent layer**, the instruction text and, for `COPY`/`ADD`, a checksum of the copied files. A miss at layer N forces a miss for N+1, N+2, and so on.',
      'Order from least to most frequently changing: base image, system packages, dependency manifest, dependency install, application code.',
      'Layers are immutable: deleting a file in a later `RUN` hides it but the bytes stay in the earlier layer. Clean up in the same `RUN` that created the mess.',
      '`.dockerignore` keeps `.git`, `node_modules` and logs out of the build context so they do not invalidate `COPY . .`.',
    ],
    pitfalls: ['`COPY . .` before installing dependencies', '`RUN apt-get update` in its own line (stale cached package lists)', 'Secrets copied into an early layer stay in the image history', 'Forgetting that a changed ARG or ENV also invalidates the layers below it'],
  },
  practice: {
    language: 'python',
    fnName: 'rebuilt_layers',
    harness: FILES_HARNESS,
    statement: 'Implement `rebuilt_layers(old, new, changed)`. `old` and `new` are lists of Dockerfile instructions; `changed` lists files modified since the cached build. Return the indices of the layers in `new` that must be rebuilt: the first layer that differs from `old`, is new, or is a COPY/ADD reading a changed file (helper `touches(line, changed)` is provided), plus every layer after it.',
    signature: 'def rebuilt_layers(old, new, changed):',
    solution: `def rebuilt_layers(old, new, changed):
    rebuilt = []
    miss = False
    for i, line in enumerate(new):
        if not miss and @@(i >= len(old) or old[i] != line)@@:
            miss = True
        elif not miss and @@touches(line, changed)@@:
            miss = True
        if miss:
            @@rebuilt.append(i)@@
    return rebuilt`,
    tests: [
      { args: [OLD, OLD, []], expected: [], name: 'nothing changed' },
      { args: [OLD, OLD, ['app.py']], expected: [4, 5], name: 'app code changed' },
      { args: [OLD, OLD, ['requirements.txt']], expected: [2, 3, 4, 5], name: 'requirements changed' },
      { args: [OLD, [...OLD.slice(0, 3), 'RUN pip install -r requirements.txt flask', ...OLD.slice(4)], []], expected: [3, 4, 5], name: 'edited RUN line cascades' },
      { args: [OLD, [OLD[0], 'ENV MODE=prod', ...OLD.slice(1)], []], expected: [1, 2, 3, 4, 5, 6], name: 'inserted line shifts everything' },
      { args: [OLD, [...OLD, 'EXPOSE 8000'], []], expected: [6], name: 'appended line' },
      { args: [OLD, OLD.slice(0, 3), []], expected: [], name: 'shorter Dockerfile reuses the cache' },
      { args: [['FROM a', 'COPY src/ /app/', 'CMD x'], ['FROM a', 'COPY src/ /app/', 'CMD x'], ['src/main.py']], expected: [1, 2], name: 'directory copy' },
      { args: [['FROM a', 'COPY src/ /app/', 'CMD x'], ['FROM a', 'COPY src/ /app/', 'CMD x'], ['docs/readme.md']], expected: [], name: 'unrelated file' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'rebuilt_layers',
    harness: FILES_HARNESS,
    statement: 'After editing one RUN line, the tool reports that only that layer rebuilds, but Docker rebuilt everything above it too. Fix the report.',
    buggy: `def rebuilt_layers(old, new, changed):
    rebuilt = []
    for i, line in enumerate(new):
        if i >= len(old) or old[i] != line or touches(line, changed):
            rebuilt.append(i)
    return rebuilt`,
    fixed: `def rebuilt_layers(old, new, changed):
    rebuilt = []
    miss = False
    for i, line in enumerate(new):
        if i >= len(old) or old[i] != line or touches(line, changed):
            miss = True
        if miss:
            rebuilt.append(i)
    return rebuilt`,
    tests: [
      { args: [OLD, [...OLD.slice(0, 3), 'RUN pip install -r requirements.txt flask', ...OLD.slice(4)], []], expected: [3, 4, 5], name: 'edit RUN' },
      { args: [OLD, OLD, ['requirements.txt']], expected: [2, 3, 4, 5], name: 'requirements changed' },
      { args: [OLD, OLD, ['app.py']], expected: [4, 5], name: 'app code changed' },
      { args: [OLD, OLD, []], expected: [], name: 'nothing changed' },
    ],
    bugType: 'cache invalidation does not cascade',
    hint: 'Each layer is judged on its own. What should a miss at layer N mean for layer N+1?',
    explanation: 'A layer\'s cache key includes its parent, so one miss invalidates everything above it. Remember the miss in a flag (`miss = True`) and rebuild every later layer.',
  },
  boss: {
    title: 'Content-addressed build cache over many builds',
    statement:
      'Implement `total_build_time(builds, costs)`. `builds` is a list of `{"lines": [...], "files": {name: version}}` run in order against ONE persistent cache. A layer\'s cache key is its parent\'s key, its line, and the (file, version) pairs it copies (use the provided `copied_files(line, files)`). A key seen before is a hit and costs 0; otherwise it is built, added to the cache, and costs `costs.get(first_word_of_line, 1)` seconds. Return the total seconds.',
    language: 'python',
    fnName: 'total_build_time',
    harness: FILES_HARNESS,
    starter: `def total_build_time(builds, costs):
    pass
`,
    solution: `def total_build_time(builds, costs):
    cache = set()
    total = 0
    for b in builds:
        key = ""
        for line in b["lines"]:
            files = [(f, b["files"][f]) for f in copied_files(line, b["files"])]
            key = repr((key, line, files))
            if key not in cache:
                cache.add(key)
                total += costs.get(line.split()[0], 1)
    return total`,
    tests: [
      { args: [[{ lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } }], { RUN: 10, COPY: 2, FROM: 3 }], expected: 18, name: 'cold build' },
      {
        args: [
          [
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
          ],
          { RUN: 10, COPY: 2, FROM: 3 },
        ],
        expected: 18,
        name: 'identical rebuild is free',
      },
      {
        args: [
          [
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 2 } },
          ],
          { RUN: 10, COPY: 2, FROM: 3 },
        ],
        expected: 21,
        name: 'app change rebuilds only the tail',
      },
      {
        args: [
          [
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 2, 'app.py': 1 } },
          ],
          { RUN: 10, COPY: 2, FROM: 3 },
        ],
        expected: 33,
        name: 'dependency change reinstalls',
      },
      {
        args: [
          [
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 2 } },
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
          ],
          { RUN: 10, COPY: 2, FROM: 3 },
        ],
        expected: 21,
        name: 'reverting hits the old cache entry',
      },
      {
        args: [
          [
            { lines: ['FROM py', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
            { lines: ['FROM py', 'ENV A=1', 'COPY req.txt .', 'RUN pip install', 'COPY . .', 'CMD run'], files: { 'req.txt': 1, 'app.py': 1 } },
          ],
          { RUN: 10, COPY: 2, FROM: 3 },
        ],
        expected: 34,
        name: 'inserted ENV invalidates all above',
      },
    ],
    hints: ['Make the cache key a chain: new_key = repr((parent_key, line, copied_files_with_versions)). Because the parent is part of the key, invalidation cascades for free.', 'Use one `cache` set for all builds. A key already in the set costs 0; otherwise add it and add `costs.get(line.split()[0], 1)`.'],
    combines: ['devops-cicd'],
  },
  quiz: [
    {
      prompt: 'Which Dockerfile order gives the fastest rebuilds when only application code changes?',
      options: ['COPY . . then RUN pip install -r requirements.txt', 'COPY requirements.txt . then RUN pip install -r requirements.txt then COPY . .', 'RUN pip install first, then FROM', 'Any order; Docker caches by file name'],
      answer: 1,
      explain: 'Dependencies change rarely, so install them in a layer that depends only on the manifest. Code changes then only invalidate the final COPY layer.',
    },
  ],
  simulationNote: 'Build times are made-up constants (RUN 10s, COPY 2s, FROM 3s, others 1s) and cache keys are simplified. Real BuildKit also hashes ARGs, platforms and mounts.',
};

export default unit;
