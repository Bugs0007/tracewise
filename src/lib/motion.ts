import { useEffect, useState } from 'react';
import { useApp } from '@/store/store';

function systemReduced(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when the learner (or their OS, if set to "system") asked for reduced motion. */
export function useReducedMotion(): boolean {
  const pref = useApp((s) => s.settings.motion);
  const [sys, setSys] = useState(systemReduced);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'reduced' || (pref === 'system' && sys);
}

export function isReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduced';
}
