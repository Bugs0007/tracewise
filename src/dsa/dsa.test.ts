// NeetCode 150 track: catalog integrity, content shape, trace well-formedness, and
// "the trace generator gives the same answer as the Python solution" (the Python is actually run).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAnchors } from '@/engine/recorder';
import { defaultInput } from '@/engine/inputs';
import { matches, toPlain } from '@/runner/compare';
import { python } from '@/content/validate.node';
import { PATTERNS } from './patterns';
import { PROBLEMS, PROBLEM_BY_ID, TOPICS, problemsOf } from './catalog';
import { checkFrame } from './viz/check';
import { MAX_CHECKPOINTS } from './viz/trace';
import type { ProblemContent, TopicContent } from './types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const problemFiles = import.meta.glob<{ default: ProblemContent }>('./problems/*/*.ts', { eager: true });
const topicFiles = import.meta.glob<{ default: TopicContent }>('./topics/*.ts', { eager: true });

const NEETCODE_COUNTS = [9, 5, 6, 7, 7, 11, 15, 3, 7, 9, 13, 6, 12, 11, 8, 6, 8, 7];
const PREMIUM = ['encode-and-decode-strings', 'walls-and-gates', 'graph-valid-tree', 'number-of-connected-components-in-an-undirected-graph', 'alien-dictionary', 'meeting-rooms', 'meeting-rooms-ii'];

describe('catalog', () => {
  it('is exactly the NeetCode 150 in order', () => {
    expect(PROBLEMS).toHaveLength(150);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(150);
    expect(TOPICS.map((t) => problemsOf(t.id).length)).toEqual(NEETCODE_COUNTS);
    PROBLEMS.forEach((p, i) => expect(p.n, p.id).toBe(i + 1));
  });
  it('uses known topics and patterns, and valid links', () => {
    for (const p of PROBLEMS) {
      expect(TOPICS.some((t) => t.id === p.topic), p.id).toBe(true);
      expect(p.patterns.length, p.id).toBeGreaterThan(0);
      for (const pat of p.patterns) expect(PATTERNS[pat], `${p.id}: pattern ${pat}`).toBeDefined();
      expect(p.leetcode, p.id).toBe(`https://leetcode.com/problems/${p.id}/`);
    }
  });
  it('links a free equivalent for every premium problem', () => {
    for (const id of PREMIUM) expect(PROBLEM_BY_ID[id].free?.url, id).toMatch(/^https:\/\/www\.lintcode\.com\/problem\/\d+\/$/);
    expect(PROBLEMS.filter((p) => p.free).map((p) => p.id).sort()).toEqual([...PREMIUM].sort());
  });
});

const oracleCache = new Map<string, Record<string, ({ ok: true; value: unknown } | { ok: false; error: string })[]>>();
function oracle(topic: string) {
  if (!oracleCache.has(topic)) oracleCache.set(topic, JSON.parse(execFileSync(python(), [join(root, 'tests/dsa/oracle.py'), topic], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })));
  return oracleCache.get(topic)!;
}

const entries = Object.entries(problemFiles).map(([path, m]) => {
  const [, , topic, file] = path.split('/');
  return { topic, slug: file.replace(/\.ts$/, ''), content: m.default };
});

describe('problems', () => {
  it('has content only for catalogued problems, in the right topic folder', () => {
    for (const e of entries) {
      expect(PROBLEM_BY_ID[e.slug], e.slug).toBeDefined();
      expect(PROBLEM_BY_ID[e.slug].topic, e.slug).toBe(e.topic);
    }
  });

  for (const e of entries) {
    const meta = PROBLEM_BY_ID[e.slug];
    const c = e.content;
    describe(e.slug, () => {
      it('ships its solution and cases files', () => {
        for (const ext of ['py', 'cases.json']) expect(existsSync(join(root, 'src/dsa/problems', e.topic, `${e.slug}.${ext}`)), ext).toBe(true);
        expect(c.task.tests.length).toBeGreaterThanOrEqual(5);
        expect(c.solution).toBe(readFileSync(join(root, 'src/dsa/problems', e.topic, `${e.slug}.py`), 'utf8'));
      });

      it('has complete, well-formed content', () => {
        expect(c.summary.length).toBeGreaterThan(40);
        expect(c.hints.length).toBeGreaterThanOrEqual(2);
        expect(c.hints.length).toBeLessThanOrEqual(3);
        expect(c.pattern.options).toContain(c.pattern.answer);
        expect(c.pattern.options.length).toBeGreaterThanOrEqual(3);
        expect(c.pattern.options.length).toBeLessThanOrEqual(4);
        expect(new Set(c.pattern.options).size).toBe(c.pattern.options.length);
        for (const o of c.pattern.options) expect(PATTERNS[o], `${e.slug}: option ${o}`).toBeDefined();
        expect(c.pattern.options.some((o) => meta.patterns.includes(o)), 'a catalogued pattern is offered').toBe(true);
        expect(c.explanation.walkthrough.length).toBeGreaterThan(0);
        expect(c.explanation.edgeCases.length).toBeGreaterThan(0);
        expect(c.explanation.whyItWorks.length).toBeGreaterThan(0);
        expect(c.complexity.time.big).toMatch(/^O\(/);
        expect(c.complexity.space.big).toMatch(/^O\(/);
        expect(c.task.signature).toContain(`def ${c.task.fnName}(`);
        // the visualizer's code is the solution itself
        expect(c.viz.code).toBe(c.solution);
        expect(Object.keys(parseAnchors(c.solution).anchors).length).toBeGreaterThan(3);
      });

      it('traces the default input and every preset with well-formed frames and 2-3 checkpoints', () => {
        const lines = parseAnchors(c.viz.code).clean.split('\n').length;
        const inputs = [{ label: 'default', input: defaultInput(c.viz.inputs) }, ...(c.viz.presets ?? []).map((p) => ({ label: p.label, input: { ...defaultInput(c.viz.inputs), ...p.input } }))];
        for (const { label, input } of inputs) {
          const res = c.viz.run(structuredClone(input));
          expect(res.frames.length, label).toBeGreaterThanOrEqual(label === 'default' ? 3 : 2);
          const problems = res.frames.flatMap((f, i) => checkFrame(f, lines, `[${label}] frame ${i}`));
          expect(problems, problems.join('\n')).toEqual([]);
          const marks = res.frames.filter((f) => f.predict).length;
          expect(marks, `[${label}] checkpoints`).toBeLessThanOrEqual(MAX_CHECKPOINTS);
          if (label === 'default') expect(marks, 'default input has 2-3 checkpoints').toBeGreaterThanOrEqual(2);
          if (c.viz.reference) expect(matches(toPlain(res.result), toPlain(c.viz.reference(structuredClone(input))), c.task.compare), `[${label}] result vs reference`).toBe(true);
        }
      });

      it('gets the same answer as the Python solution on every test input', () => {
        const py = oracle(e.topic)[e.slug];
        expect(py, 'oracle output').toBeDefined();
        c.task.tests.forEach((t, i) => {
          const run = py[i];
          expect(run.ok, `python case ${i}: ${run.ok ? '' : run.error}`).toBe(true);
          if (!run.ok) return;
          const out = c.viz.run(structuredClone(c.fromArgs(structuredClone(t.args))));
          const mode = c.task.compare;
          expect(matches(toPlain(out.result), run.value, mode), `case ${i} (${t.name}): trace ${JSON.stringify(out.result)} vs python ${JSON.stringify(run.value)}`).toBe(true);
          // and Python agrees with the stored expectation, so the cases file can be trusted too
          expect(matches(run.value, t.expected, mode), `case ${i}: python ${JSON.stringify(run.value)} vs expected ${JSON.stringify(t.expected)}`).toBe(true);
        });
      });
    });
  }
});

describe('topics', () => {
  it('registers at least the topics written so far', () => {
    for (const path of Object.keys(topicFiles)) expect(TOPICS.some((t) => path.endsWith(`/${t.id}.ts`)), path).toBe(true);
  });
  for (const [path, m] of Object.entries(topicFiles)) {
    const id = path.match(/\/([\w-]+)\.ts$/)![1];
    it(`${id}: intro, template, checklist and boss fight`, () => {
      const t = m.default;
      expect(TOPICS.some((x) => x.id === id)).toBe(true);
      expect(t.intro.length).toBeGreaterThan(0);
      expect(t.template.length).toBeGreaterThan(0);
      expect(t.checklist.length).toBeGreaterThanOrEqual(3);
      expect(t.boss.quiz.length).toBeGreaterThanOrEqual(5);
      for (const q of t.boss.quiz) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
      }
      expect(PROBLEM_BY_ID[t.boss.problem]?.topic, 'boss problem belongs to the topic').toBe(id);
    });
  }
});
