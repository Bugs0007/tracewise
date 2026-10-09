import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { specTokens, type Spec, type SpecToken } from '@/content/lib/frontend-css-web';

const code = `
function specificity(selector) {
  let a = 0, b = 0, c = 0;
  for (const tok of tokenize(selector)) {
    if (tok.kind === 'id') a++;                                               //@id
    else if (['class', 'attribute', 'pseudo-class'].includes(tok.kind)) b++;    //@class
    else if (['type', 'pseudo-element'].includes(tok.kind)) c++;                //@type
    // combinators, * and :where() add nothing                                //@zero
  }
  return [a, b, c];                                                           //@ret
}

function winner(rules) {
  // order of importance: !important, inline style, specificity, source order
  return rules.reduce((best, r) => (beats(r, best) ? r : best));              //@cascade
}
`;

interface In {
  sel1: string;
  sel2: string;
  sel3: string;
  important: string;
  inline: string;
}

interface Cand {
  label: string;
  key: number[];
  spec: Spec;
}

const KIND_TONE: Record<SpecToken['kind'], Tone> = {
  id: 'swap',
  class: 'compare',
  attribute: 'compare',
  'pseudo-class': 'compare',
  functional: 'path',
  type: 'new',
  'pseudo-element': 'new',
  universal: 'muted',
  combinator: 'muted',
};

const ANCHOR: Record<SpecToken['kind'], string> = { id: 'id', class: 'class', attribute: 'class', 'pseudo-class': 'class', functional: 'class', type: 'type', 'pseudo-element': 'type', universal: 'zero', combinator: 'zero' };

const KIND_NOTE: Record<SpecToken['kind'], string> = {
  id: 'id selector: counts in column A',
  class: 'class selector: counts in column B',
  attribute: 'attribute selector: counts in column B',
  'pseudo-class': 'pseudo-class: counts in column B',
  functional: 'selector-taking pseudo-class: counts as its argument',
  type: 'element selector: counts in column C',
  'pseudo-element': 'pseudo-element: counts in column C',
  universal: '* adds nothing',
  combinator: 'combinators add nothing',
};

const cmp = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

const viz: VizDef<In> = {
  id: 'css-specificity',
  title: 'Specificity and the cascade',
  code,
  language: 'javascript',
  inputs: [
    { key: 'sel1', label: 'Rule 1 selector', kind: 'string', default: '#nav a', maxItems: 60 },
    { key: 'sel2', label: 'Rule 2 selector', kind: 'string', default: '.menu .item.active a:hover', maxItems: 60 },
    { key: 'sel3', label: 'Rule 3 selector', kind: 'string', default: 'ul li a', maxItems: 60 },
    { key: 'important', label: '!important on', kind: 'select', default: 'none', options: ['none', 'rule 1', 'rule 2', 'rule 3'] },
    { key: 'inline', label: 'Inline style="" also sets the property', kind: 'select', default: 'no', options: ['no', 'yes'] },
  ],
  presets: [
    { label: 'ID beats classes', input: { sel1: '#nav a', sel2: '.menu .item.active a:hover', sel3: 'ul li a', important: 'none', inline: 'no' } },
    { label: '!important flips it', input: { sel1: '#nav a', sel2: '.menu .item.active a:hover', sel3: 'ul li a', important: 'rule 3', inline: 'no' } },
    { label: 'Tie: later rule wins', input: { sel1: '.a .b', sel2: '.c.d', sel3: 'ul li', important: 'none', inline: 'no' } },
    { label: 'Pseudo-elements, :not and :where', input: { sel1: 'p::first-line', sel2: 'p:first-child', sel3: ':where(#a) p:not(#b)', important: 'none', inline: 'no' } },
    { label: 'Inline style', input: { sel1: '#nav a', sel2: 'a.link', sel3: 'a', important: 'none', inline: 'yes' } },
  ],
  run(input) {
    const r = new Recorder(code);
    const sels = [input.sel1, input.sel2, input.sel3];
    const rules = sels.map((s, i) => ({ n: i + 1, sel: s.trim() })).filter((x) => x.sel);
    if (!rules.length) throw new Error('Enter at least one selector');
    const impN = input.important === 'none' ? 0 : Number(input.important.replace('rule ', ''));
    const specs: Record<number, Spec> = {};
    const cands: Cand[] = [];
    for (const rule of rules) {
      const toks = specTokens(rule.sel);
      let a = 0;
      let b = 0;
      let c = 0;
      const view = (cur: number) => ({
        type: 'array' as const,
        title: `Rule ${rule.n}: ${rule.sel}`,
        values: toks.map((t) => t.text),
        tones: Object.fromEntries(toks.map((t, i) => [i, i === cur ? KIND_TONE[t.kind] : i < cur ? ('done' as Tone) : ('default' as Tone)])),
        hideIndex: true,
      });
      const tally = (): { type: 'kv'; entries: { k: string; v: number }[] } => ({ type: 'kv', entries: [{ k: 'ids (A)', v: a }, { k: 'classes, attrs, pseudo-classes (B)', v: b }, { k: 'elements, pseudo-elements (C)', v: c }] });
      r.step(ANCHOR[toks[0]?.kind ?? 'zero'], `Rule ${rule.n}: read ${toks.length} token${toks.length === 1 ? '' : 's'} left to right`, [view(-1), tally()], { rule: rule.n, a, b, c });
      toks.forEach((t, i) => {
        a += t.spec[0];
        b += t.spec[1];
        c += t.spec[2];
        r.op();
        r.step(ANCHOR[t.kind], `"${t.text.trim() || 'space'}": ${KIND_NOTE[t.kind]}`, [view(i), tally()], { rule: rule.n, a, b, c });
      });
      specs[rule.n] = [a, b, c];
      r.step('ret', `Rule ${rule.n} specificity = (${a}, ${b}, ${c})`, [view(toks.length), tally()], { rule: rule.n, a, b, c });
      cands.push({ label: `rule ${rule.n}`, key: [impN === rule.n ? 1 : 0, 0, a, b, c, rule.n], spec: [a, b, c] });
    }
    if (input.inline === 'yes') cands.push({ label: 'inline', key: [0, 1, 0, 0, 0, 99], spec: [0, 0, 0] });
    const table = (best: Cand, ch: Cand | null, upTo: number) => ({
      type: 'grid' as const,
      title: 'Cascade keys (compare left to right)',
      cells: cands.slice(0, upTo).map((cd) => [cd.key[0] ? 'yes' : 'no', cd.key[1] ? 'yes' : 'no', cd.key[2], cd.key[3], cd.key[4], cd.label === 'inline' ? 'last' : cd.key[5]]),
      colLabels: ['!important', 'inline', 'A', 'B', 'C', 'order'],
      rowLabels: cands.slice(0, upTo).map((cd) => cd.label),
      tones: Object.fromEntries(cands.slice(0, upTo).flatMap((cd, i) => [0, 1, 2, 3, 4, 5].map((c) => [`${i},${c}`, cd === best ? ('found' as Tone) : cd === ch ? ('compare' as Tone) : ('default' as Tone)]))),
    });
    let best = cands[0];
    r.step('cascade', `Start with ${best.label} as the current winner`, [table(best, null, 1)], { winner: best.label });
    for (let i = 1; i < cands.length; i++) {
      const ch = cands[i];
      r.op();
      const col = ch.key.findIndex((v, k) => v !== best.key[k] && k < 5);
      const names = ['!important', 'inline style', 'ids', 'classes/attributes/pseudo-classes', 'elements'];
      const beats = cmp(ch.key, best.key) > 0;
      const why = col === -1 ? 'all columns tie, so the later rule wins' : `${names[col]} differ (${ch.key[col]} vs ${best.key[col]})`;
      r.step('cascade', `${ch.label} vs ${best.label}: ${why} - ${beats ? ch.label : best.label} wins`, [table(beats ? ch : best, beats ? best : ch, i + 1)], { challenger: ch.label, current: best.label });
      if (beats) best = ch;
    }
    r.step('cascade', `${best.label} wins and its declaration is the one applied`, [table(best, null, cands.length)], { winner: best.label });
    return { frames: r.frames, result: { specs: rules.map((x) => specs[x.n]), winner: best.label } };
  },
  reference(i) {
    const refSpec = (sel: string): Spec => {
      let s = sel;
      let a = 0;
      let b = 0;
      let c = 0;
      s = s.replace(/:(not|is|matches|has|where)\(((?:[^()]|\([^()]*\))*)\)/g, (_m, name: string, arg: string) => {
        if (name !== 'where') {
          const best = arg.split(',').map((p) => refSpec(p.trim())).sort((x, y) => cmp(x, y)).pop()!;
          a += best[0];
          b += best[1];
          c += best[2];
        }
        return ' ';
      });
      s = s.replace(/\[[^\]]*\]/g, () => (b++, ' '));
      s = s.replace(/::[\w-]+(\([^)]*\))?|:(before|after|first-line|first-letter)\b/g, () => (c++, ' '));
      s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => (b++, ' '));
      s = s.replace(/#[\w-]+/g, () => (a++, ' '));
      s = s.replace(/\.[\w-]+/g, () => (b++, ' '));
      c += (s.match(/[a-zA-Z][\w-]*/g) ?? []).length;
      return [a, b, c];
    };
    const sels = [i.sel1, i.sel2, i.sel3].map((s, k) => ({ n: k + 1, s: s.trim() })).filter((x) => x.s);
    const imp = i.important === 'none' ? 0 : Number(i.important.slice(5));
    const rows = sels.map((x) => ({ label: `rule ${x.n}`, sp: refSpec(x.s), imp: imp === x.n ? 1 : 0, inline: 0, ord: x.n }));
    if (i.inline === 'yes') rows.push({ label: 'inline', sp: [0, 0, 0], imp: 0, inline: 1, ord: 99 });
    rows.sort((p, q) => q.imp - p.imp || q.inline - p.inline || q.sp[0] - p.sp[0] || q.sp[1] - p.sp[1] || q.sp[2] - p.sp[2] || q.ord - p.ord);
    return { specs: sels.map((x) => refSpec(x.s)), winner: rows[0].label };
  },
};

const SPEC_FN = String.raw`function specificity(selector) {
  let rest = selector;
  const take = (re) => {
    const found = rest.match(re) || [];
    rest = rest.replace(re, ' ');
    return found.length;
  };
  const attrs = take(/\[[^\]]*\]/g);
  const pseudoElements = take(/::[\w-]+|:(?:before|after|first-line|first-letter)\b/g);
  const pseudoClasses = take(/:[\w-]+(?:\([^)]*\))?/g);
  const ids = take(/#[\w-]+/g);
  const classes = take(/\.[\w-]+/g);
  const types = (rest.match(/[a-zA-Z][\w-]*/g) || []).length;
  return [ids, classes + attrs + pseudoClasses, types + pseudoElements];
}`;

const specTests = [
  { args: ['a'], expected: [0, 0, 1], name: 'element' },
  { args: ['#nav'], expected: [1, 0, 0], name: 'id' },
  { args: ['ul li a'], expected: [0, 0, 3], name: 'descendants' },
  { args: ['.btn.primary'], expected: [0, 2, 0], name: 'two classes' },
  { args: ['a:hover'], expected: [0, 1, 1], name: 'pseudo-class' },
  { args: ['input[type="text"]'], expected: [0, 1, 1], name: 'attribute' },
  { args: ['p::first-line'], expected: [0, 0, 2], name: 'pseudo-element is an element' },
  { args: ['a > b + c ~ d'], expected: [0, 0, 4], name: 'combinators add nothing' },
  { args: ['*'], expected: [0, 0, 0], name: 'universal' },
  { args: ['ul#main li.item.active a:hover::after'], expected: [1, 3, 4], name: 'mixed' },
];

const unit: Unit = {
  id: 'css-specificity',
  hook: '"Why is my CSS not applying?" is the most common front-end debugging question. Interviewers expect you to compute (ids, classes, elements) by hand and know that `!important` and inline styles sit above it.',
  predict: {
    prompt: 'Inside `#nav`, a link matches both `#nav a { color: red }` and `.menu .item.active a:hover { color: blue }` (it is hovered). Which colour wins?',
    options: ['Blue: it has far more selectors', 'Red: one id outranks any number of classes', 'Blue: it comes later in the file', 'They tie, so the browser picks randomly'],
    answer: 1,
    explain: '`#nav a` is (1, 0, 1). The other selector is (0, 4, 1): three classes plus :hover. Columns are compared left to right and never carry over, so the id wins.',
  },
  viz,
  simulationNote: 'The tokenizer follows the Selectors Level 4 counting rules for ids, classes, attributes, pseudo-classes/-elements, :not/:is/:has (argument) and :where (zero). Origins and cascade layers are left out.',
  deeper: {
    points: [
      'Specificity is a triple (A, B, C) compared column by column: ids, then classes + attributes + pseudo-classes, then elements + pseudo-elements. 11 classes never beat 1 id.',
      '`:not()`, `:is()` and `:has()` take the specificity of their most specific argument; `:where()` is always zero, which makes it good for resets.',
      'The cascade order is: `!important` declarations, then inline styles, then specificity, then source order. A tie goes to the later declaration.',
      '`*`, combinators and the `:not` wrapper itself add nothing.',
      'Prefer low, flat specificity (single classes) so overrides stay predictable; reach for `!important` only to beat inline styles you do not control.',
    ],
    pitfalls: ['Counting pseudo-elements (`::before`) as classes: they are element-level (column C)', 'Thinking a longer selector always wins instead of comparing columns', 'Fighting a specificity war with `!important` and then needing `!important` to override that'],
  },
  practice: {
    language: 'javascript',
    fnName: 'specificity',
    statement: 'Return the specificity [ids, classes + attributes + pseudo-classes, elements + pseudo-elements] of one CSS selector (no commas, no :not/:is). Combinators and `*` add nothing.',
    signature: 'function specificity(selector) {',
    solution: String.raw`function specificity(selector) {
  let rest = selector;
  const take = (re) => {
    const found = rest.match(re) || [];
    rest = rest.replace(re, ' ');
    return found.length;
  };
  const attrs = take(@@/\[[^\]]*\]/g@@);
  const pseudoElements = take(@@/::[\w-]+|:(?:before|after|first-line|first-letter)\b/g@@);
  const pseudoClasses = take(@@/:[\w-]+(?:\([^)]*\))?/g@@);
  const ids = take(/#[\w-]+/g);
  const classes = take(/\.[\w-]+/g);
  const types = (rest.match(/[a-zA-Z][\w-]*/g) || []).length;
  return [@@ids@@, @@classes + attrs + pseudoClasses@@, @@types + pseudoElements@@];
}`,
    tests: specTests,
  },
  debug: {
    language: 'javascript',
    fnName: 'specificity',
    statement: 'This calculator ranks `a::before` the same as `a.active`. Some overrides in the stylesheet go wrong. Fix the counting.',
    buggy: String.raw`function specificity(selector) {
  let rest = selector;
  const take = (re) => {
    const found = rest.match(re) || [];
    rest = rest.replace(re, ' ');
    return found.length;
  };
  const attrs = take(/\[[^\]]*\]/g);
  const pseudoElements = take(/::[\w-]+|:(?:before|after|first-line|first-letter)\b/g);
  const pseudoClasses = take(/:[\w-]+(?:\([^)]*\))?/g);
  const ids = take(/#[\w-]+/g);
  const classes = take(/\.[\w-]+/g);
  const types = (rest.match(/[a-zA-Z][\w-]*/g) || []).length;
  return [ids, classes + attrs + pseudoClasses + pseudoElements, types];
}`,
    fixed: SPEC_FN,
    tests: specTests,
    bugType: 'wrong column',
    hint: 'Look at which array slot the pseudo-element count lands in.',
    explanation: 'Pseudo-elements such as ::before and ::first-line are counted with ELEMENTS (column C), not with classes. Adding them to the middle column inflates the selector and makes it beat rules it should lose to.',
  },
  boss: {
    title: 'Which declaration wins?',
    language: 'javascript',
    fnName: 'winner',
    harness: SPEC_FN,
    statement:
      'A helper `specificity(selector)` returning [a, b, c] is already defined. Given rules in source order, [{selector, important?, inline?}], return the INDEX of the declaration that wins for one property. Priority: important beats normal; then an inline style (inline: true, ignore its selector) beats selectors; then higher specificity (compare a, then b, then c); on a full tie the later rule wins.',
    starter: `function winner(rules) {
  // your code here
}
`,
    solution: `function winner(rules) {
  const key = (r, i) => [r.important ? 1 : 0, r.inline ? 1 : 0, ...(r.inline ? [0, 0, 0] : specificity(r.selector)), i];
  let best = 0;
  for (let i = 1; i < rules.length; i++) {
    const a = key(rules[i], i);
    const b = key(rules[best], best);
    for (let k = 0; k < a.length; k++) {
      if (a[k] !== b[k]) {
        if (a[k] > b[k]) best = i;
        break;
      }
    }
  }
  return best;
}`,
    tests: [
      { args: [[{ selector: '#a' }, { selector: '.b.c' }]], expected: 0, name: 'id beats classes' },
      { args: [[{ selector: '.a .b' }, { selector: '.c.d' }]], expected: 1, name: 'tie: later wins' },
      { args: [[{ selector: '#a' }, { selector: '.b', important: true }]], expected: 1, name: '!important beats id' },
      { args: [[{ selector: 'p' }, { inline: true }]], expected: 1, name: 'inline beats selectors' },
      { args: [[{ inline: true }, { selector: '#x #y', important: true }]], expected: 1, name: '!important beats inline' },
      { args: [[{ selector: 'ul li a:hover' }, { selector: '.nav a' }, { selector: 'a' }]], expected: 0, name: 'three rules' },
      { args: [[{ selector: 'a', important: true }, { selector: '#a', important: true }]], expected: 1, name: 'both important: specificity decides' },
      { args: [[{ selector: 'div' }]], expected: 0, name: 'single rule' },
    ],
    hints: ['Build a sortable key per rule: [important, inline, a, b, c, index] and compare keys left to right.', 'Because the index is the last element of the key, ties on everything else are resolved in favour of the later rule automatically.'],
  },
  quiz: [
    {
      prompt: 'What is the specificity of `a:not(.x)::before`?',
      options: ['(0, 1, 1)', '(0, 1, 2)', '(0, 2, 2)', '(0, 0, 3)'],
      answer: 1,
      explain: '`a` is an element (C), `:not(.x)` counts as its argument `.x` (B), and `::before` is a pseudo-element (C): (0, 1, 2).',
    },
  ],
};

export default unit;
