// Optional Google sign-in and cross-device progress sync (Supabase). Everything here is a no-op unless
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time, so a fork stays local-only by default.
// Local storage remains the source of truth: the cloud copy is merged in (never blindly overwrites), and the
// app works fully offline and as a guest.
import { create } from 'zustand';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { migrate, SaveError, type SaveData } from '@/store/save';
import { persistNow, snapshot, useApp } from '@/store/store';
import { mergeSaves, stable } from './merge';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const accountsConfigured = Boolean(URL && KEY);

const TABLE = 'tracewise_progress';
const RETURN_KEY = 'tracewise:return-hash';
const PUSH_DELAY_MS = 4000;
const MAX_BYTES = 900_000;

export type AccountStatus = 'unconfigured' | 'loading' | 'signed-out' | 'signed-in';
export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface AccountState {
  status: AccountStatus;
  email: string | null;
  name: string | null;
  avatar: string | null;
  sync: SyncState;
  lastSynced: string | null;
  error: string | null;
}

export const useAccount = create<AccountState>(() => ({
  status: accountsConfigured ? 'loading' : 'unconfigured',
  email: null,
  name: null,
  avatar: null,
  sync: 'idle',
  lastSynced: null,
  error: null,
}));

let clientPromise: Promise<SupabaseClient> | null = null;
function client(): Promise<SupabaseClient> {
  // loaded on demand so people who never configure accounts never download the library
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL as string, KEY as string, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  );
  return clientPromise;
}

let userId: string | null = null;
let ready = false; // true once the first pull/merge for this sign-in has finished; pushes wait for it
let lastPushed = '';
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> = Promise.resolve();

/** Run sync steps one at a time so a push never races a pull. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

function payload(data: SaveData): SaveData {
  // keep the row small: drop code drafts if the save is huge (progress matters more than drafts)
  return JSON.stringify(data).length > MAX_BYTES ? { ...data, drafts: {} } : data;
}

async function runSync(): Promise<void> {
  if (!userId) return;
  const uid = userId;
  const sb = await client();
  useAccount.setState({ sync: 'syncing', error: null });
  try {
    const { data: row, error } = await sb.from(TABLE).select('data').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    let remote: SaveData | null = null;
    if (row?.data) {
      try {
        remote = migrate(row.data);
      } catch (e) {
        // a cloud copy we cannot read (e.g. from a newer app version): never overwrite it
        const msg = e instanceof SaveError ? e.message : 'The cloud copy could not be read.';
        useAccount.setState({ sync: 'error', error: msg });
        return;
      }
    }
    if (userId !== uid) return; // signed out or switched account while we waited
    const local = snapshot();
    const merged = remote ? mergeSaves(local, remote) : local;
    if (stable(merged) !== stable(local)) {
      useApp.getState().replaceAll(merged);
      persistNow();
    }
    const out = payload(merged);
    const body = stable(out);
    if (!remote || stable(payload(remote)) !== body) {
      const { error: upErr } = await sb.from(TABLE).upsert({ user_id: uid, data: out, schema: out.schema, updated_at: new Date().toISOString() });
      if (upErr) throw upErr;
    }
    lastPushed = body;
    ready = true;
    useAccount.setState({ sync: 'synced', lastSynced: new Date().toISOString(), error: null });
  } catch {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    useAccount.setState({ sync: offline ? 'offline' : 'error', error: offline ? null : 'Could not sync. Your progress is safe on this device; it will retry.' });
  }
}

/** Pull the cloud copy, merge it with this device, and push the result. Safe to call any time. */
export function syncNow(): Promise<void> {
  return serial(runSync);
}

function schedulePush() {
  if (!userId || !ready) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (isDirty()) void syncNow();
  }, PUSH_DELAY_MS);
}

/** True when this device has changes the cloud copy has not seen (ignores ephemeral UI state like toasts). */
function isDirty(): boolean {
  return stable(payload(snapshot())) !== lastPushed;
}

function applySession(session: Session | null) {
  if (!session) {
    userId = null;
    ready = false;
    lastPushed = '';
    useAccount.setState({ status: 'signed-out', email: null, name: null, avatar: null, sync: 'idle', lastSynced: null, error: null });
    return;
  }
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' && x ? x : null);
  const same = userId === u.id;
  userId = u.id;
  useAccount.setState({ status: 'signed-in', email: u.email ?? null, name: str(meta.full_name) ?? str(meta.name), avatar: str(meta.avatar_url) ?? str(meta.picture) });
  if (!same) {
    ready = false;
    void syncNow();
  }
  try {
    const back = sessionStorage.getItem(RETURN_KEY);
    if (back) {
      sessionStorage.removeItem(RETURN_KEY);
      window.location.hash = back;
    }
  } catch {}
}

let started = false;
/** Call once at startup. Restores a saved session, finishes a Google redirect, and keeps progress syncing. */
export async function initAccount(): Promise<void> {
  if (!accountsConfigured || started || typeof window === 'undefined') return;
  started = true;
  try {
    const sb = await client();
    sb.auth.onAuthStateChange((_event, session) => {
      // never call back into supabase from inside this handler; defer a tick
      setTimeout(() => applySession(session), 0);
    });
    const { data } = await sb.auth.getSession();
    applySession(data.session);
  } catch {
    useAccount.setState({ status: 'signed-out' });
  }
  useApp.subscribe(schedulePush);
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!userId || !ready) return;
    if (document.visibilityState === 'hidden') {
      // flush pending changes before the tab goes away
      if (timer) clearTimeout(timer);
      if (isDirty()) void syncNow();
    } else {
      void syncNow(); // coming back: pick up anything another device did
    }
  });
}

export async function signInWithGoogle(): Promise<string | null> {
  if (!accountsConfigured) return 'Accounts are not set up on this build.';
  try {
    sessionStorage.setItem(RETURN_KEY, window.location.hash || '#/settings');
  } catch {}
  const sb = await client();
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    // the app uses hash routing, so return to the bare page and restore the hash afterwards
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  return error ? 'Could not start Google sign-in. Try again in a moment.' : null;
}

export async function signOut(): Promise<void> {
  if (timer) clearTimeout(timer);
  await serial(async () => undefined);
  const sb = await client();
  await sb.auth.signOut();
  applySession(null);
}

/** Delete this account's cloud copy. Local progress is untouched. Returns an error message, or null. */
export async function deleteCloudCopy(): Promise<string | null> {
  if (!userId) return null;
  if (timer) clearTimeout(timer);
  const uid = userId;
  return serial(async () => {
    const sb = await client();
    const { error } = await sb.from(TABLE).delete().eq('user_id', uid);
    if (error) return 'Could not delete the cloud copy. Try again.';
    lastPushed = '';
    useAccount.setState({ sync: 'idle', lastSynced: null, error: null });
    return null;
  });
}
