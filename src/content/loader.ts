import { CATALOG_BY_ID } from './catalog';
import type { Unit } from './types';

// Units are code-split: each file becomes its own chunk, loaded on demand.
const loaders = import.meta.glob<{ default: Unit }>('./units/*/*.ts');

function pathFor(id: string): string | null {
  const meta = CATALOG_BY_ID[id];
  return meta ? `./units/${meta.module}/${id}.ts` : null;
}

export function hasUnit(id: string): boolean {
  const p = pathFor(id);
  return !!p && p in loaders;
}

export const AVAILABLE_UNITS: Set<string> = new Set(
  Object.keys(loaders)
    .map((p) => p.match(/\/([\w-]+)\.ts$/)?.[1])
    .filter((x): x is string => !!x && x in CATALOG_BY_ID),
);

const cache = new Map<string, Promise<Unit | null>>();

export function loadUnit(id: string): Promise<Unit | null> {
  if (!cache.has(id)) {
    const p = pathFor(id);
    const loader = p ? loaders[p] : undefined;
    cache.set(id, loader ? loader().then((m) => m.default) : Promise.resolve(null));
  }
  return cache.get(id)!;
}
