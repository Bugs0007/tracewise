import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel } from '@/content/lib/backend-rest';

const code = `
def page_offset(rows, offset, limit):
    return rows[offset:offset + limit]                              #@offset

def page_cursor(rows, after_id, limit):
    older = [r for r in rows if after_id is None or r < after_id]   #@filter
    page = older[:limit]                                            #@slice
    next_id = page[-1] if page else None                            #@next
    return page, next_id
`;

const CHANGES = ['insert 2 new rows', 'delete a row already seen'];
const MODES = ['offset', 'cursor'];

interface In {
  mode: string;
  change: string;
  size: number;
}

const clampSize = (n: number) => Math.max(2, Math.min(4, Math.round(n) || 3));

/** Rows are ids, newest first. */
function initialRows(): number[] {
  return [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
}

function applyChange(rows: number[], change: string, seen: number[]): { rows: number[]; fresh: number[]; note: string } {
  if (change === CHANGES[0]) {
    const top = rows[0];
    const fresh = [top + 2, top + 1];
    return { rows: [...fresh, ...rows], fresh, note: `Between loads, ${fresh.join(' and ')} are inserted at the top` };
  }
  const victim = seen[1] ?? seen[0];
  return { rows: rows.filter((x) => x !== victim), fresh: [], note: `Between loads, row ${victim} (already seen) is deleted` };
}

const viz: VizDef<In> = {
  id: 'be-pagination',
  title: 'Offset vs cursor pagination on a changing table',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'Pagination style', kind: 'select', default: 'offset', options: MODES },
    { key: 'change', label: 'Change after page 1', kind: 'select', default: CHANGES[0], options: CHANGES },
    { key: 'size', label: 'Page size (2-4)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Offset + insert', input: { mode: 'offset', change: CHANGES[0] } },
    { label: 'Cursor + insert', input: { mode: 'cursor', change: CHANGES[0] } },
    { label: 'Offset + delete', input: { mode: 'offset', change: CHANGES[1] } },
    { label: 'Cursor + delete', input: { mode: 'cursor', change: CHANGES[1] } },
  ],
  run({ mode, change, size: rawSize }) {
    const r = new Recorder(code);
    const size = clampSize(rawSize);
    const cursorMode = mode === 'cursor';
    let rows = initialRows();
    let fresh: number[] = [];
    const seen: number[] = [];
    let offset = 0;
    let cursor: number | null = null;
    let current: number[] = [];
    const dup = new Set<number>();
    const table = (): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      rows.forEach((id, i) => {
        if (current.includes(id)) tones[i] = 'active';
        else if (fresh.includes(id)) tones[i] = 'new';
        else if (seen.includes(id)) tones[i] = 'visited';
      });
      return { type: 'array', title: 'Table, newest first (the server)', values: rows, tones, hideIndex: !cursorMode ? false : true, pointers: cursorMode ? (cursor !== null && rows.includes(cursor) ? { after: rows.indexOf(cursor) } : {}) : { offset: Math.min(offset, rows.length) } };
    };
    const reader = (): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      const used = new Set<number>();
      seen.forEach((id, i) => {
        if (used.has(id)) tones[i] = 'error';
        used.add(id);
      });
      return { type: 'array', title: 'What the reader has collected', values: seen, tones, hideIndex: true };
    };
    const kv = () => kvPanel('Request state', cursorMode ? { 'after_id': cursor ?? 'none', limit: size } : { offset, limit: size });
    const load = (n: number) => {
      if (cursorMode) {
        const older = rows.filter((x) => cursor === null || x < cursor);
        r.step('filter', `Load ${n}: rows with id < ${cursor ?? '∞'} → ${older.length} candidates`, [table(), reader(), kv()], { page: n });
        current = older.slice(0, size);
        r.step('slice', `Take the first ${size}: ${current.join(', ')}`, [table(), reader(), kv()], { page: n });
        cursor = current.length ? current[current.length - 1] : cursor;
        r.step('next', `Next cursor = last id on the page = ${cursor}`, [table(), reader(), kv()], { page: n, next_id: cursor ?? 'none' });
      } else {
        current = rows.slice(offset, offset + size);
        r.step('offset', `Load ${n}: rows[${offset}:${offset + size}] → ${current.join(', ')}`, [table(), reader(), kv()], { page: n, offset });
        offset += size;
      }
      for (const id of current) {
        if (seen.includes(id)) dup.add(id);
        seen.push(id);
      }
      r.op();
      const d = current.filter((id) => dup.has(id));
      r.step(cursorMode ? 'next' : 'offset', d.length ? `Reader receives ${current.join(', ')}: ${d.join(', ')} seen before (duplicates!)` : `Reader receives ${current.join(', ')}`, [table(), reader(), kv()], { page: n, dups: dup.size });
    };
    r.step(cursorMode ? 'filter' : 'offset', `Table has ${rows.length} rows. A feed shows ${size} per page`, [table(), reader(), kv()], { size });
    load(1);
    const ch = applyChange(rows, change, seen);
    rows = ch.rows;
    fresh = ch.fresh;
    current = [];
    r.step(cursorMode ? 'filter' : 'offset', ch.note, [table(), reader(), kv()], { rows: rows.length });
    load(2);
    fresh = [];
    load(3);
    const uniq = new Set(seen);
    const maxInitial = 10;
    const skipped = rows.filter((x) => x <= maxInitial && !uniq.has(x) && x >= Math.min(...seen));
    r.step(cursorMode ? 'next' : 'offset', `Result: ${seen.length} items, ${dup.size} duplicate${dup.size === 1 ? '' : 's'}, ${skipped.length} skipped${skipped.length ? ' (' + skipped.join(', ') + ')' : ''}`, [table(), reader(), kv()], { duplicates: dup.size, skipped: skipped.length });
    return { frames: r.frames, result: seen };
  },
  reference({ mode, change, size: rawSize }) {
    const size = clampSize(rawSize);
    let rows = initialRows();
    const out: number[] = [];
    let pos = 0;
    let after = Infinity;
    for (let n = 1; n <= 3; n++) {
      const page = mode === 'cursor' ? rows.filter((x) => x < after).slice(0, size) : rows.slice(pos, pos + size);
      out.push(...page);
      pos += size;
      if (page.length) after = page[page.length - 1];
      if (n === 1) {
        if (change === CHANGES[0]) rows = [rows[0] + 2, rows[0] + 1, ...rows];
        else rows = rows.filter((x) => x !== out[1]);
      }
    }
    return out;
  },
};

const R9 = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const unit: Unit = {
  id: 'be-pagination',
  hook: 'Offset pagination is what everyone writes first; cursor pagination is what survives production. Explaining why a feed shows duplicates is a classic API-design question.',
  predict: {
    prompt: 'A feed lists newest first, 3 per page. You load page 1 (ids 10, 9, 8). Two new posts arrive. You then load page 2 with `?offset=3`. What do you see?',
    options: ['7, 6, 5 (nothing changes)', '9, 8, 7 (two repeats)', '12, 11, 10 (the new posts)', 'An error: offset out of range'],
    answer: 1,
    explain: 'The new rows push everything down by two places, so rows[3:6] is now 9, 8, 7. The reader sees 9 and 8 twice. A cursor ("ids below 8") would have returned 7, 6, 5 regardless of inserts.',
  },
  viz,
  deeper: {
    points: [
      'Offset pagination (`LIMIT 3 OFFSET 3`) addresses rows by position. Any insert or delete before that position shifts the window: duplicates or skipped rows.',
      'Cursor (keyset) pagination addresses rows by value: "give me rows after the last one I saw". It is stable under writes.',
      'It is also faster: the database seeks straight to the cursor via an index, while a large OFFSET still scans and discards every skipped row.',
      'The cursor must be built from a total order. If sorting by `created`, add the id as a tiebreaker: `(created, id)`.',
      'Return an opaque `next_cursor` (often base64) and `null` when there is no more data, so clients never build page numbers themselves.',
    ],
    complexity: { time: 'O(limit) with an index (cursor) vs O(offset + limit) (offset)', space: 'O(limit)' },
    pitfalls: ['Using `>=` so the cursor row repeats on the next page', 'Cursor on a non-unique column without a tiebreaker', 'Using offset for infinite scroll over live data', 'Jumping to "page 50" is easy with offset and impossible with a cursor: pick by product need'],
  },
  practice: {
    language: 'python',
    fnName: 'paginate',
    statement: '`rows` is a list of integer ids, newest (largest) first. Return `{"items": [...], "next_cursor": ...}`: up to `limit` ids that come strictly after `cursor` (smaller than it; `None` means start). `next_cursor` is the last id returned, or `None` when no rows remain after this page.',
    signature: 'def paginate(rows, cursor, limit):',
    solution: `def paginate(rows, cursor, limit):
    remaining = [r for r in rows if cursor is None or r @@<@@ cursor]
    page = remaining[:@@limit@@]
    has_more = len(remaining) @@>@@ limit
    next_cursor = @@page[-1]@@ if has_more else None
    return {"items": page, "next_cursor": next_cursor}`,
    tests: [
      { args: [R9, null, 3], expected: { items: [9, 8, 7], next_cursor: 7 }, name: 'first page' },
      { args: [R9, 7, 3], expected: { items: [6, 5, 4], next_cursor: 4 }, name: 'second page' },
      { args: [R9, 4, 3], expected: { items: [3, 2, 1], next_cursor: null }, name: 'exact last page' },
      { args: [R9, 3, 3], expected: { items: [2, 1], next_cursor: null }, name: 'short last page' },
      { args: [[9, 8, 6, 5], 7, 2], expected: { items: [6, 5], next_cursor: null }, name: 'cursor row was deleted' },
      { args: [[], null, 5], expected: { items: [], next_cursor: null }, name: 'empty table' },
      { args: [[3, 2, 1], null, 10], expected: { items: [3, 2, 1], next_cursor: null }, name: 'limit larger than data' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'paginate',
    statement: 'Clients that follow `next_cursor` page by page are missing one item at every page boundary. Find the bug.',
    buggy: `def paginate(rows, cursor, limit):
    remaining = [r for r in rows if cursor is None or r < cursor]
    page = remaining[:limit]
    has_more = len(remaining) > limit
    next_cursor = remaining[limit] if has_more else None
    return {"items": page, "next_cursor": next_cursor}`,
    fixed: `def paginate(rows, cursor, limit):
    remaining = [r for r in rows if cursor is None or r < cursor]
    page = remaining[:limit]
    has_more = len(remaining) > limit
    next_cursor = page[-1] if has_more else None
    return {"items": page, "next_cursor": next_cursor}`,
    tests: [
      { args: [R9, null, 3], expected: { items: [9, 8, 7], next_cursor: 7 }, name: 'first page' },
      { args: [R9, 7, 3], expected: { items: [6, 5, 4], next_cursor: 4 }, name: 'second page' },
      { args: [R9, 4, 3], expected: { items: [3, 2, 1], next_cursor: null }, name: 'last page' },
      { args: [[5, 4, 3], 5, 1], expected: { items: [4], next_cursor: 4 }, name: 'limit 1' },
    ],
    bugType: 'cursor points past the page (skipped row)',
    hint: 'The next request returns rows strictly below the cursor. Which row should the cursor be so nothing is lost?',
    explanation: 'The cursor must be the last item the client received. Using the first item of the next page (`remaining[limit]`) makes the next request start after that item, so it is never delivered.',
  },
  boss: {
    title: 'Keyset pages with ties',
    statement:
      '`rows` are dicts `{"id", "created"}` in any order; several can share a `created` value. Order newest first by `(created, id)` descending. Implement `page_after(rows, cursor, limit)`: `cursor` is `None` or `[created, id]` of the last row seen; return rows strictly after it. Clamp `limit` into 1..5. Return `{"ids": [...], "next": [created, id] or None}` where `next` is the last returned row\'s key and is `None` when nothing remains.',
    language: 'python',
    fnName: 'page_after',
    starter: `def page_after(rows, cursor, limit):
    # your code here
    pass
`,
    solution: `def page_after(rows, cursor, limit):
    limit = max(1, min(5, limit))
    ordered = sorted(rows, key=lambda r: (r["created"], r["id"]), reverse=True)
    if cursor is not None:
        key = tuple(cursor)
        ordered = [r for r in ordered if (r["created"], r["id"]) < key]
    page = ordered[:limit]
    has_more = len(ordered) > limit
    last = page[-1] if page else None
    nxt = [last["created"], last["id"]] if has_more and last else None
    return {"ids": [r["id"] for r in page], "next": nxt}`,
    tests: [
      { args: [[{ id: 1, created: 5 }, { id: 2, created: 5 }, { id: 3, created: 5 }, { id: 4, created: 9 }], null, 2], expected: { ids: [4, 3], next: [5, 3] }, name: 'ties broken by id' },
      { args: [[{ id: 1, created: 5 }, { id: 2, created: 5 }, { id: 3, created: 5 }, { id: 4, created: 9 }], [5, 3], 2], expected: { ids: [2, 1], next: null }, name: 'continue inside a tie' },
      { args: [[{ id: 1, created: 1 }, { id: 2, created: 2 }], null, 0], expected: { ids: [2], next: [2, 2] }, name: 'limit clamps up to 1' },
      { args: [[{ id: 1, created: 1 }, { id: 2, created: 2 }], null, 99], expected: { ids: [2, 1], next: null }, name: 'limit clamps down' },
      { args: [[], null, 3], expected: { ids: [], next: null }, name: 'empty' },
      { args: [[{ id: 7, created: 3 }, { id: 8, created: 3 }], [3, 7], 2], expected: { ids: [], next: null }, name: 'cursor at the end' },
    ],
    hints: ['Compare `(created, id)` tuples, not just `created`: that is what makes the order total.', 'Sort descending, drop rows not strictly below `tuple(cursor)`, take `limit`, and set `next` only when more rows remain.'],
    combines: ['be-filtering'],
  },
  quiz: [
    {
      prompt: 'Why is cursor pagination faster than a large OFFSET?',
      options: ['It uses less memory on the client', 'The database can seek to the cursor with an index instead of scanning and discarding skipped rows', 'It caches pages', 'It avoids sorting'],
      answer: 1,
      explain: 'OFFSET N still reads N rows and throws them away. A keyset condition (`WHERE id < ?`) jumps straight to the right place using the index.',
    },
  ],
};

export default unit;
