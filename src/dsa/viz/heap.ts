// A faithful copy of CPython's heapq (a binary min-heap in a list), so a trace shows exactly the array the
// Python solution would hold. Items can be numbers or tuples (arrays); tuples compare lexicographically.
export type Item = number | string | readonly (number | string)[];

export function less(a: Item, b: Item): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const x = a as readonly (number | string)[];
    const y = b as readonly (number | string)[];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] < y[i]) return true;
      if (x[i] > y[i]) return false;
    }
    return x.length < y.length;
  }
  return (a as number | string) < (b as number | string);
}

/** Called at the moments worth showing: a copy of the array and the indices that just moved. */
export type Watch<T> = (what: string, heap: T[], at: number[]) => void;

function siftdown<T extends Item>(heap: T[], start: number, pos: number, cmp: (a: T, b: T) => boolean, watch?: Watch<T>): number {
  const item = heap[pos];
  while (pos > start) {
    const parent = (pos - 1) >> 1;
    if (cmp(item, heap[parent])) {
      // show it as a swap so each hop is a frame
      heap[pos] = heap[parent];
      heap[parent] = item;
      watch?.('up', [...heap], [parent]);
      pos = parent;
      continue;
    }
    break;
  }
  heap[pos] = item;
  return pos;
}

function siftup<T extends Item>(heap: T[], pos: number, cmp: (a: T, b: T) => boolean): number {
  const end = heap.length;
  const start = pos;
  const item = heap[pos];
  let child = 2 * pos + 1;
  while (child < end) {
    const right = child + 1;
    if (right < end && !cmp(heap[child], heap[right])) child = right;
    heap[pos] = heap[child];
    pos = child;
    child = 2 * pos + 1;
  }
  heap[pos] = item;
  return siftdown(heap, start, pos, cmp);
}

export class MinHeap<T extends Item = number> {
  items: T[];
  constructor(items: T[] = [], private cmp: (a: T, b: T) => boolean = (a, b) => less(a, b)) {
    this.items = items;
  }

  get size(): number {
    return this.items.length;
  }

  get top(): T | undefined {
    return this.items[0];
  }

  heapify(watch?: Watch<T>): void {
    for (let i = (this.items.length >> 1) - 1; i >= 0; i--) {
      siftup(this.items, i, this.cmp);
      watch?.('heapify', [...this.items], [i]);
    }
  }

  push(x: T, watch?: Watch<T>): void {
    this.items.push(x);
    const last = this.items.length - 1;
    watch?.('append', [...this.items], [last]);
    siftdown(this.items, 0, last, this.cmp, watch);
  }

  pop(watch?: Watch<T>): T {
    const lastItem = this.items.pop() as T;
    if (!this.items.length) return lastItem;
    const out = this.items[0];
    this.items[0] = lastItem;
    watch?.('root', [...this.items], [0]);
    siftup(this.items, 0, this.cmp);
    return out;
  }
}
