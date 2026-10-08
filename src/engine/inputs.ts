import type { EdgeSpec } from './layout';
import type { InputField } from './types';

/** Convert a field value to the editable text shown in the input box. */
export function formatInput(field: InputField, value: unknown): string {
  switch (field.kind) {
    case 'numbers':
      return (value as (number | null)[]).map((v) => (v === null ? 'null' : String(v))).join(', ');
    case 'strings':
      return (value as string[]).join(', ');
    case 'number':
    case 'string':
    case 'select':
      return String(value);
    case 'edges':
      return (value as EdgeSpec[]).map((e) => `${e.from}-${e.to}${e.w !== undefined ? ':' + e.w : ''}`).join(', ');
    case 'grid':
      return (value as (number | string)[][]).map((r) => r.join(' ')).join('\n');
    case 'json':
      return JSON.stringify(value);
  }
}

export class InputError extends Error {}

/** Parse the text from an input box back to a value. Throws InputError with a friendly message. */
export function parseInput(field: InputField, text: string): unknown {
  const t = text.trim();
  switch (field.kind) {
    case 'numbers': {
      const body = t.replace(/^\[|\]$/g, '').trim();
      if (!body) return [];
      const parts = body.split(/[\s,]+/).filter(Boolean);
      const out = parts.map((p) => {
        if (p === 'null' || p === 'None' || p === '_') return null;
        const n = Number(p);
        if (!Number.isFinite(n)) throw new InputError(`"${p}" is not a number`);
        return n;
      });
      if (field.maxItems && out.length > field.maxItems) throw new InputError(`Use at most ${field.maxItems} values`);
      return out;
    }
    case 'strings': {
      const out = t ? t.split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (field.maxItems && out.length > field.maxItems) throw new InputError(`Use at most ${field.maxItems} items`);
      return out;
    }
    case 'number': {
      const n = Number(t);
      if (!t || !Number.isFinite(n)) throw new InputError('Enter a number');
      return n;
    }
    case 'string':
      if (field.maxItems && t.length > field.maxItems) throw new InputError(`Use at most ${field.maxItems} characters`);
      return t;
    case 'select':
      if (field.options && !field.options.includes(t)) throw new InputError(`Pick one of ${field.options.join(', ')}`);
      return t;
    case 'edges': {
      if (!t) return [];
      const out: EdgeSpec[] = t.split(/[,\n]+/).map((raw) => {
        const s = raw.trim();
        const m = s.match(/^([\w]+)\s*(?:-|->|>)\s*([\w]+)(?:\s*:\s*(-?\d+(?:\.\d+)?))?$/);
        if (!m) throw new InputError(`Can't read edge "${s}" (use A-B or A-B:4)`);
        return m[3] !== undefined ? { from: m[1], to: m[2], w: Number(m[3]) } : { from: m[1], to: m[2] };
      });
      if (field.maxItems && out.length > field.maxItems) throw new InputError(`Use at most ${field.maxItems} edges`);
      return out;
    }
    case 'grid': {
      const rows = t.split(/\n|\//).map((r) => r.trim()).filter(Boolean);
      const grid = rows.map((r) => r.split(/[\s,]+/).map((c) => (/^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c)));
      if (!grid.length) throw new InputError('Grid is empty');
      const w = grid[0].length;
      if (grid.some((r) => r.length !== w)) throw new InputError('Every row needs the same number of cells');
      if (field.maxItems && grid.length * w > field.maxItems) throw new InputError(`Use at most ${field.maxItems} cells`);
      return grid;
    }
    case 'json':
      try {
        return JSON.parse(t);
      } catch {
        throw new InputError('Invalid JSON');
      }
  }
}

export function defaultInput(fields: InputField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f.key, structuredClone(f.default)]));
}
