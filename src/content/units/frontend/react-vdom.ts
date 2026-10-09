import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { treePanel, type CNode } from '@/content/lib/frontend-react';

const code = `
function diff(oldEl, newEl) {
  if (oldEl.type !== newEl.type) {                   //@type
    return replace(oldEl, newEl);                    //@replace
  }
  updateProps(oldEl.props, newEl.props);             //@props
  diffChildren(oldEl.children, newEl.children);      //@children
}

function diffChildren(oldKids, newKids) {
  for (const kid of newKids) {
    const old = matchByKeyOrIndex(oldKids, kid);     //@match
    if (!old) {
      insert(kid);                                   //@insert
    } else {
      diff(old, kid);                                //@recurse
      if (movedRight(old)) move(old);                //@move
    }
  }
  for (const old of unmatched(oldKids)) remove(old); //@remove
}
`;

interface El {
  type: string;
  props?: Record<string, string | number>;
  key?: string;
  children?: El[] | string;
}

interface In {
  before: El;
  after: El;
}

type Kind = 'replace' | 'set' | 'unset' | 'text' | 'insert' | 'remove' | 'move';

interface Hooks {
  visit(a: El, b: El, path: string): void;
  patch(kind: Kind, text: string, a?: El, b?: El): void;
  children(a: El, b: El, path: string, mode: 'keyed' | 'by position'): void;
  leave(a: El, b: El): void;
}

const label = (el: El, i: number) => (el.key !== undefined ? `${el.type}(${el.key})` : `${el.type}[${i}]`);

/** Tiny reconciler over a JSON element tree. Emits patches through hooks. */
function diffEl(a: El, b: El, path: string, h: Hooks): void {
  h.visit(a, b, path);
  if (a.type !== b.type) {
    h.patch('replace', `REPLACE ${path}: <${a.type}> → <${b.type}> (subtree remounts)`, a, b);
    h.leave(a, b);
    return;
  }
  const ap = a.props ?? {};
  const bp = b.props ?? {};
  for (const k of Object.keys(bp)) if (ap[k] !== bp[k]) h.patch('set', `SET ${path}.${k} = ${JSON.stringify(bp[k])}`, a, b);
  for (const k of Object.keys(ap)) if (!(k in bp)) h.patch('unset', `UNSET ${path}.${k}`, a, b);
  const ac = a.children;
  const bc = b.children;
  if (typeof ac === 'string' || typeof bc === 'string') {
    if (ac !== bc) {
      if (typeof ac === 'string' && typeof bc === 'string') h.patch('text', `TEXT ${path}: ${JSON.stringify(ac)} → ${JSON.stringify(bc)}`, a, b);
      else h.patch('replace', `REPLACE ${path} children (text ↔ elements)`, a, b);
    }
  } else {
    const ok = ac ?? [];
    const nk = bc ?? [];
    const keyed = ok.length + nk.length > 0 && [...ok, ...nk].every((c) => c.key !== undefined);
    if (ok.length + nk.length) h.children(a, b, path, keyed ? 'keyed' : 'by position');
    if (keyed) {
      const oldIndex = new Map(ok.map((c, i) => [c.key as string, i]));
      const seen = new Set<string>();
      let last = 0;
      nk.forEach((kid, i) => {
        const p = `${path}/${label(kid, i)}`;
        const oi = oldIndex.get(kid.key as string);
        if (oi === undefined) {
          h.patch('insert', `INSERT ${p}`, undefined, kid);
          return;
        }
        seen.add(kid.key as string);
        diffEl(ok[oi], kid, p, h);
        if (oi < last) h.patch('move', `MOVE ${p} (was index ${oi})`, ok[oi], kid);
        else last = oi;
      });
      ok.forEach((c, i) => {
        if (!seen.has(c.key as string)) h.patch('remove', `REMOVE ${path}/${label(c, i)}`, c, undefined);
      });
    } else {
      for (let i = 0; i < Math.max(ok.length, nk.length); i++) {
        if (i >= ok.length) h.patch('insert', `INSERT ${path}/${label(nk[i], i)}`, undefined, nk[i]);
        else if (i >= nk.length) h.patch('remove', `REMOVE ${path}/${label(ok[i], i)}`, ok[i], undefined);
        else diffEl(ok[i], nk[i], `${path}/${label(nk[i], i)}`, h);
      }
    }
  }
  h.leave(a, b);
}

function indexIds(el: El, prefix: string, map: Map<El, string>): CNode {
  const id = prefix;
  map.set(el, id);
  const kids = Array.isArray(el.children) ? el.children : [];
  return { id, name: el.type, children: kids.map((c, i) => indexIds(c, `${prefix}.${i}`, map)) };
}

function decorate(el: El, ids: Map<El, string>, badges: Record<string, string>, subs: Record<string, string>) {
  const id = ids.get(el)!;
  const bits: string[] = [];
  if (el.key !== undefined) bits.push(`key=${el.key}`);
  if (typeof el.children === 'string') bits.push(el.children);
  if (bits.length) badges[id] = bits.join(' · ');
  if (el.props && Object.keys(el.props).length) subs[id] = Object.entries(el.props).map(([k, v]) => `${k}=${v}`).join(' ');
  if (Array.isArray(el.children)) el.children.forEach((c) => decorate(c, ids, badges, subs));
}

const li = (text: string, key?: string): El => ({ type: 'li', ...(key ? { key } : {}), children: text });
const ul = (kids: El[], props?: Record<string, string>): El => ({ type: 'ul', ...(props ? { props } : {}), children: kids });

const viz: VizDef<In> = {
  id: 'react-vdom',
  title: 'Virtual DOM diff',
  code,
  language: 'javascript',
  inputs: [
    { key: 'before', label: 'Previous render (type, props, key, children)', kind: 'json', default: ul([li('Apple', 'a'), li('Banana', 'b')], { class: 'list' }) },
    { key: 'after', label: 'Next render', kind: 'json', default: ul([li('Cherry', 'c'), li('Apple', 'a'), li('Banana (ripe)', 'b')], { class: 'list active' }) },
  ],
  presets: [
    { label: 'Props change', input: { before: { type: 'button', props: { class: 'btn', disabled: 'true' }, children: 'Save' }, after: { type: 'button', props: { class: 'btn primary' }, children: 'Save' } } },
    { label: 'Type change', input: { before: { type: 'div', children: [{ type: 'p', children: 'Hello' }, { type: 'span', children: 'x' }] }, after: { type: 'section', children: [{ type: 'p', children: 'Hello' }, { type: 'span', children: 'x' }] } } },
    { label: 'Prepend, no keys', input: { before: ul([li('A'), li('B'), li('C')]), after: ul([li('New'), li('A'), li('B'), li('C')]) } },
    { label: 'Prepend, with keys', input: { before: ul([li('A', 'a'), li('B', 'b'), li('C', 'c')]), after: ul([li('New', 'n'), li('A', 'a'), li('B', 'b'), li('C', 'c')]) } },
    { label: 'Reorder keyed', input: { before: ul([li('A', 'a'), li('B', 'b'), li('C', 'c')]), after: ul([li('C', 'c'), li('A', 'a'), li('B', 'b')]) } },
  ],
  run({ before, after }) {
    if (!before?.type || !after?.type) throw new Error('Each tree needs a "type" (e.g. "div")');
    const r = new Recorder(code);
    const idsB = new Map<El, string>();
    const idsA = new Map<El, string>();
    const treeB = indexIds(before, 'b', idsB);
    const treeA = indexIds(after, 'a', idsA);
    const badgesB: Record<string, string> = {};
    const badgesA: Record<string, string> = {};
    const subsB: Record<string, string> = {};
    const subsA: Record<string, string> = {};
    decorate(before, idsB, badgesB, subsB);
    decorate(after, idsA, badgesA, subsA);
    const tonesB: Record<string, Tone> = {};
    const tonesA: Record<string, Tone> = {};
    const patches: string[] = [];
    const panels = () => [
      treePanel(treeB, { tones: tonesB, badges: badgesB, subs: subsB, title: 'Before' }, { gapX: 84, gapY: 62 }),
      treePanel(treeA, { tones: tonesA, badges: badgesA, subs: subsA, title: 'After' }, { gapX: 84, gapY: 62 }),
      { type: 'log' as const, title: 'Patch list (what React would apply to the DOM)', lines: patches.length ? patches.map((p, i) => ({ text: p, tone: i === patches.length - 1 ? ('swap' as Tone) : undefined })) : [{ text: '(empty so far)', tone: 'muted' as Tone }] },
    ];
    const tone = (a: El | undefined, b: El | undefined, ta: Tone | undefined, tb: Tone | undefined) => {
      if (a && ta) tonesB[idsB.get(a)!] = ta;
      if (b && tb) tonesA[idsA.get(b)!] = tb;
    };
    const anchorFor: Record<Kind, string> = { replace: 'replace', set: 'props', unset: 'props', text: 'props', insert: 'insert', remove: 'remove', move: 'move' };
    const capFor: Record<Kind, string> = {
      replace: 'Different type: throw away the old subtree and build the new one',
      set: 'Same type, prop changed: update just that attribute',
      unset: 'Same type, prop gone: remove just that attribute',
      text: 'Same type, text changed: update the text node only',
      insert: 'No old element matches: create and insert a new one',
      remove: 'Old element has no match in the new list: remove it',
      move: 'Matched element sits earlier than one already placed: move it',
    };
    const hooks: Hooks = {
      visit(a, b, path) {
        r.op();
        tone(a, b, 'compare', 'compare');
        r.step('type', a.type === b.type ? `Compare ${path}: same type <${a.type}> → keep the DOM node` : `Compare ${path}: <${a.type}> vs <${b.type}> — types differ`, panels(), { path, patches: patches.length });
      },
      patch(kind, text, a, b) {
        patches.push(text);
        const t: Tone = kind === 'insert' ? 'new' : kind === 'remove' ? 'error' : 'swap';
        if (kind === 'replace') tone(a, b, 'error', 'new');
        else tone(a, b, kind === 'insert' ? undefined : t, kind === 'remove' ? undefined : t);
        r.step(anchorFor[kind], capFor[kind], panels(), { patches: patches.length });
      },
      children(_a, _b, path, mode) {
        r.step('children', `Diff children of ${path}: matched ${mode === 'keyed' ? 'by key' : 'by position (no keys)'}`, panels(), { path, mode });
      },
      leave(a, b) {
        if (tonesB[idsB.get(a)!] === 'compare') tonesB[idsB.get(a)!] = 'done';
        if (tonesA[idsA.get(b)!] === 'compare') tonesA[idsA.get(b)!] = 'done';
      },
    };
    r.step('type', 'Two render outputs: the previous one and the next one. React diffs them top-down.', panels(), {});
    diffEl(before, after, before.type, hooks);
    r.step('children', patches.length ? `Diff finished: ${patches.length} patch(es) to apply` : 'Diff finished: nothing to change in the DOM', panels(), { patches: patches.length });
    return { frames: r.frames, result: patches };
  },
  reference({ before, after }) {
    const out: string[] = [];
    diffEl(before, after, before.type, { visit() {}, children() {}, leave() {}, patch: (_k, text) => out.push(text) });
    return out;
  },
};

const nodeDebugFixed = `function diffNode(a, b, path = 'root') {
  if (a.type !== b.type) return ['replace ' + path];
  const patches = [];
  const ap = a.props || {};
  const bp = b.props || {};
  for (const k of new Set([...Object.keys(ap), ...Object.keys(bp)])) {
    if (ap[k] !== bp[k]) patches.push((k in bp ? 'set ' : 'unset ') + path + '.' + k);
  }
  const ac = a.children || [];
  const bc = b.children || [];
  for (let i = 0; i < Math.max(ac.length, bc.length); i++) {
    const p = path + '/' + i;
    if (i >= ac.length) patches.push('insert ' + p);
    else if (i >= bc.length) patches.push('remove ' + p);
    else patches.push(...diffNode(ac[i], bc[i], p));
  }
  return patches;
}`;

const unit: Unit = {
  id: 'react-vdom',
  hook: 'Interviewers ask "how does React know what to update?" to see whether you understand reconciliation: compare by type, then props, then children, with keys deciding identity in lists. It explains keys, remounting bugs and why components must be pure.',
  predict: {
    prompt: 'After a state change, React compares the old output `<div><Counter /></div>` with the new `<section><Counter /></section>`. What happens to the `Counter` component and its state?',
    options: ['Counter keeps its state; only the wrapper element is renamed', 'Counter is unmounted and mounted again; its state resets', 'React throws an error about changing element types', 'Counter re-renders but keeps its state because it has the same name'],
    answer: 1,
    explain: 'When the type at a position changes (`div` → `section`), React discards the old subtree entirely and builds the new one, so every component below loses its state. Same type at the same position means the DOM node and component instance are reused.',
  },
  viz,
  simulationNote: 'A miniature reconciler over JSON elements, following the same rules as React (type check, prop diff, keyed vs positional children, last-placed-index moves). Real React diffs fibers and batches commits, but the decisions match.',
  deeper: {
    points: [
      'Diffing is O(n) because of two heuristics: elements of different types produce different trees, and keys hint which children are stable across renders.',
      'Same type at the same position: keep the DOM node / component instance, update changed props, then recurse into children.',
      'Different type: unmount the whole old subtree (state and DOM lost) and mount the new one.',
      'Children without keys are matched by index, so inserting at the top shifts every row and rewrites each one\'s props.',
      'With keys, React finds the old element by key, reuses it, and only moves or inserts where needed. A stable, unique key is identity.',
    ],
    pitfalls: ['Wrapping content conditionally in a different tag (e.g. `div` vs `section`), which remounts all children', 'Using random keys such as `Math.random()`, which remount every row on every render', 'Treating the virtual DOM as "faster than the DOM" instead of a way to compute minimal updates'],
  },
  practice: {
    language: 'javascript',
    fnName: 'diffProps',
    statement: 'Compare two props objects. Return patches `{ op: "set", name, value }` for every prop that is new or changed (in the order of `newProps`), followed by `{ op: "remove", name }` for every prop that disappeared (in the order of `oldProps`).',
    signature: 'function diffProps(oldProps, newProps) {',
    solution: `function diffProps(oldProps, newProps) {
  const patches = [];
  for (const name of @@Object.keys(newProps)@@) {
    if (@@oldProps[name] !== newProps[name]@@) {
      patches.push({ op: 'set', name, value: newProps[name] });
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (@@!(name in newProps)@@) {
      @@patches.push({ op: 'remove', name })@@;
    }
  }
  return patches;
}`,
    tests: [
      { args: [{ a: 1 }, { a: 2 }], expected: [{ op: 'set', name: 'a', value: 2 }], name: 'changed prop' },
      { args: [{ a: 1, b: 2 }, { a: 1 }], expected: [{ op: 'remove', name: 'b' }], name: 'removed prop' },
      { args: [{ a: 1 }, { a: 1 }], expected: [], name: 'identical' },
      { args: [{ class: 'x' }, { class: 'x', id: 'main' }], expected: [{ op: 'set', name: 'id', value: 'main' }], name: 'added prop' },
      { args: [{ a: 1, b: 2 }, { a: 3 }], expected: [{ op: 'set', name: 'a', value: 3 }, { op: 'remove', name: 'b' }], name: 'set before remove' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'diffNode',
    statement: 'This mini differ returns patch strings. Replacing a `<div>` with a `<span>` (or a child `li` with a `p`) should produce a single `replace` patch, but it returns nothing when the props match.',
    buggy: nodeDebugFixed.replace("  if (a.type !== b.type) return ['replace ' + path];\n", ''),
    fixed: nodeDebugFixed,
    tests: [
      { args: [{ type: 'div', props: { class: 'a' } }, { type: 'div', props: { class: 'b' } }], expected: ['set root.class'], name: 'prop change' },
      { args: [{ type: 'div', props: { class: 'a' } }, { type: 'span', props: { class: 'a' } }], expected: ['replace root'], name: 'root type change' },
      { args: [{ type: 'ul', children: [{ type: 'li' }] }, { type: 'ul', children: [{ type: 'p' }] }], expected: ['replace root/0'], name: 'child type change' },
      { args: [{ type: 'ul', children: [{ type: 'li' }] }, { type: 'ul', children: [{ type: 'li' }, { type: 'li' }] }], expected: ['insert root/1'], name: 'append child' },
      { args: [{ type: 'a', props: { id: 'x' } }, { type: 'a' }], expected: ['unset root.id'], name: 'removed prop' },
    ],
    bugType: 'missing type check',
    hint: 'What should happen first when the two elements are not the same type, before looking at props or children?',
    explanation: 'Elements of different types are never patched in place — React replaces the subtree. Without that early return the function compares props and children of unrelated elements and may report no change at all.',
  },
  boss: {
    title: 'Keyed tree differ',
    statement:
      'Write `diffTree(a, b, path = "root")` for elements `{ type, props?, key?, children? }` (children is an array). Return patch strings: different type → `["replace <path>"]` and stop; otherwise `set <path>.<prop>` for new/changed props, then `unset <path>.<prop>` for removed ones, then the children. If every child (old and new) has a key, match by key: process new children in order — `insert <path>/<key>` if unseen, else recurse with path `<path>/<key>` and add `move <path>/<key>` when its old index is lower than the highest old index placed so far; afterwards `remove <path>/<key>` for unmatched old children. Without keys match by index (`<path>/<i>`) with `insert` / `remove` for the extras.',
    language: 'javascript',
    fnName: 'diffTree',
    starter: `function diffTree(a, b, path = 'root') {
  return [];
}`,
    solution: `function diffTree(a, b, path = 'root') {
  if (a.type !== b.type) return ['replace ' + path];
  const out = [];
  const ap = a.props || {};
  const bp = b.props || {};
  for (const k of Object.keys(bp)) if (ap[k] !== bp[k]) out.push('set ' + path + '.' + k);
  for (const k of Object.keys(ap)) if (!(k in bp)) out.push('unset ' + path + '.' + k);
  const ac = a.children || [];
  const bc = b.children || [];
  const keyed = ac.length + bc.length > 0 && ac.concat(bc).every((c) => c.key !== undefined);
  if (keyed) {
    const oldIndex = new Map(ac.map((c, i) => [c.key, i]));
    const seen = new Set();
    let last = 0;
    for (const kid of bc) {
      const p = path + '/' + kid.key;
      if (!oldIndex.has(kid.key)) {
        out.push('insert ' + p);
        continue;
      }
      seen.add(kid.key);
      const oi = oldIndex.get(kid.key);
      out.push(...diffTree(ac[oi], kid, p));
      if (oi < last) out.push('move ' + p);
      else last = oi;
    }
    for (const c of ac) if (!seen.has(c.key)) out.push('remove ' + path + '/' + c.key);
  } else {
    for (let i = 0; i < Math.max(ac.length, bc.length); i++) {
      const p = path + '/' + i;
      if (i >= ac.length) out.push('insert ' + p);
      else if (i >= bc.length) out.push('remove ' + p);
      else out.push(...diffTree(ac[i], bc[i], p));
    }
  }
  return out;
}`,
    tests: [
      { args: [{ type: 'p' }, { type: 'p' }], expected: [], name: 'identical' },
      { args: [{ type: 'div', props: { id: 'a', x: 1 } }, { type: 'div', props: { id: 'b' } }], expected: ['set root.id', 'unset root.x'], name: 'props' },
      { args: [{ type: 'div', children: [{ type: 'p' }] }, { type: 'div', children: [{ type: 'span' }] }], expected: ['replace root/0'], name: 'child type change' },
      { args: [{ type: 'ul', children: [{ type: 'li', key: 'a' }, { type: 'li', key: 'b' }] }, { type: 'ul', children: [{ type: 'li', key: 'c' }, { type: 'li', key: 'a' }, { type: 'li', key: 'b' }] }], expected: ['insert root/c'], name: 'keyed prepend' },
      { args: [{ type: 'ul', children: [{ type: 'li', key: 'a' }, { type: 'li', key: 'b' }, { type: 'li', key: 'c' }] }, { type: 'ul', children: [{ type: 'li', key: 'c' }, { type: 'li', key: 'a' }, { type: 'li', key: 'b' }] }], expected: ['move root/a', 'move root/b'], name: 'keyed reorder' },
      { args: [{ type: 'ul', children: [{ type: 'li', key: 'a' }, { type: 'li', key: 'b' }] }, { type: 'ul', children: [{ type: 'li', key: 'b', props: { class: 'x' } }] }], expected: ['set root/b.class', 'remove root/a'], name: 'keyed remove and update' },
      { args: [{ type: 'ul', children: [{ type: 'li' }, { type: 'li' }] }, { type: 'ul', children: [{ type: 'li' }, { type: 'li' }, { type: 'li' }] }], expected: ['insert root/2'], name: 'unkeyed append' },
    ],
    hints: ['Handle the type check first, then props, then children. Decide "keyed" only when there is at least one child and all of them have a key.', 'For keyed lists keep `oldIndex = new Map(ac.map((c, i) => [c.key, i]))` and a `last` index: if the matched old index is less than `last`, push a move; otherwise set `last` to it.'],
    combines: ['react-tree'],
  },
};

export default unit;
