import { useEffect, useState } from 'react';

/** Live result of a CSS media query. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return on;
}

/** A boolean remembered in localStorage on this device (private mode: just for this visit). */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : raw === '1';
    } catch {
      return initial;
    }
  });
  const set = (next: boolean) => {
    setV(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // ignore
    }
  };
  return [v, set];
}
