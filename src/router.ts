// Tiny hash router: works on any static host (GitHub Pages sub-paths included).
import { useSyncExternalStore } from 'react';

function current(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/' + h;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const full = useSyncExternalStore(subscribe, current, () => '/');
  const [path, qs] = full.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

export function navigate(to: string): void {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export function href(to: string): string {
  return `#${to}`;
}
