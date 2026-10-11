// "Wrap long lines" preference for every code view and editor. A per-device display choice, so it lives in
// localStorage rather than in the synced save. Wrapping is the default: no sideways scrolling, which matters most on a phone.
import { useSyncExternalStore } from 'react';

const KEY = 'tracewise:code-wrap';
const subs = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
let current = read();

export function useCodeWrap(): [boolean, (v: boolean) => void] {
  const wrap = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    () => current,
    () => true,
  );
  const set = (v: boolean) => {
    current = v;
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      // private mode: the choice lasts for this session only
    }
    subs.forEach((f) => f());
  };
  return [wrap, set];
}
