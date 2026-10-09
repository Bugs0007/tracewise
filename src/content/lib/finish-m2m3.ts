// Shared helpers for the finishing batch of M2 (backend) and M3 (frontend) units:
// a deterministic virtual-time asyncio loop for Pyodide, the endpoint-testing
// playground app, and a few small TypeScript models reused by several visualizers.
import type { GraphPanel, Tone } from '@/engine/types';
import { nTreePanel, type NTreeNode } from '@/engine/layout';

/** Keep captions within the 90 character budget. */
export const clip = (s: string, n = 90): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');

export const SIM_MINIDJANGO = "Exercises run on minidjango, a small in-browser library that mirrors Django's API. It is a faithful simulation of the concepts, not Django itself.";
export const SIM_NEXT = 'Next.js-style simulation: real Next.js cannot run in the browser. The visualizer and exercises model the behaviour with plain JavaScript, not Next.js itself.';

// ───────────────────────── asyncio on a virtual clock ─────────────────────────

/**
 * Python (hidden harness). `run_virtual(coro)` drives a coroutine on a tiny event loop whose
 * clock is virtual: asyncio.sleep(3) takes no real time but advances `loop.time()` by 3.
 * Real asyncio.run() cannot block inside Pyodide, so the tests use this loop instead.
 * Everything built on futures (gather, create_task, Semaphore, timeout, Queue) works unchanged.
 */
export const ASYNC_HARNESS = `
import asyncio, collections, heapq, itertools

class _VirtualLoop(asyncio.AbstractEventLoop):
    def __init__(self):
        self._ready = collections.deque()
        self._timers = []
        self._order = itertools.count()
        self._now = 0.0

    def time(self):
        return self._now

    def get_debug(self):
        return False

    def is_running(self):
        return True

    def is_closed(self):
        return False

    def call_soon(self, callback, *args, context=None):
        handle = asyncio.Handle(callback, args, self, context)
        self._ready.append(handle)
        return handle

    def call_at(self, when, callback, *args, context=None):
        timer = asyncio.TimerHandle(when, callback, args, self, context)
        heapq.heappush(self._timers, (when, next(self._order), timer))
        return timer

    def call_later(self, delay, callback, *args, context=None):
        return self.call_at(self._now + max(delay, 0), callback, *args, context=context)

    def _timer_handle_cancelled(self, handle):
        pass

    def create_future(self):
        return asyncio.Future(loop=self)

    def create_task(self, coro, *, name=None, context=None):
        return asyncio.Task(coro, loop=self, name=name, context=context)

    def call_exception_handler(self, context):
        pass

def run_virtual(coro):
    """Run coro to completion. Returns (result, virtual seconds elapsed)."""
    loop = _VirtualLoop()
    asyncio.events._set_running_loop(loop)
    try:
        main = loop.create_task(coro)
        while not main.done():
            for _ in range(len(loop._ready)):
                handle = loop._ready.popleft()
                if not handle.cancelled():
                    handle._run()
            if main.done() or loop._ready:
                continue
            while loop._timers and loop._timers[0][2].cancelled():
                heapq.heappop(loop._timers)
            if not loop._timers:
                main.cancel()
                raise RuntimeError("deadlock: nothing is ready to run and no timer is pending")
            loop._now = max(loop._now, loop._timers[0][0])
            while loop._timers and loop._timers[0][0] <= loop._now:
                timer = heapq.heappop(loop._timers)[2]
                if not timer.cancelled():
                    loop._ready.append(timer)
        return main.result(), round(loop.time(), 3)
    finally:
        asyncio.events._set_running_loop(None)
`;

// ───────────────────────── endpoint under test (be-testing) ─────────────────────────

/** Python (hidden harness): a notes API in several variants, one correct and the rest each broken in exactly one way. */
export const NOTES_HARNESS = `
import minidjango
from minidjango import models
from minidjango.http import App, path, JsonResponse, HttpResponse
from minidjango.test import Client

class Note(models.Model):
    title = models.CharField(max_length=40)
    owner = models.CharField(max_length=20)

def make_app(variant):
    def whoami(request):
        user = request.headers.get("x-user")
        if user is None and variant == "no_auth":
            return "anonymous"
        return user

    def notes(request):
        user = whoami(request)
        if user is None:
            return JsonResponse({"detail": "login required"}, status=401)
        if request.method == "GET":
            return JsonResponse({"notes": [n.title for n in Note.objects.filter(owner=user)]})
        title = str(request.data.get("title") or "").strip()
        if not title and variant != "no_validation":
            return JsonResponse({"title": ["This field is required."]}, status=400)
        note = Note.objects.create(title=title, owner=user)
        return JsonResponse({"id": note.pk, "title": note.title}, status=201)

    def note_detail(request, pk):
        user = whoami(request)
        if user is None:
            return JsonResponse({"detail": "login required"}, status=401)
        found = Note.objects.filter(pk=pk).first()
        if found is None:
            if variant == "bad_404":
                return JsonResponse({"detail": "no such note"}, status=200)
            return JsonResponse({"detail": "Not found."}, status=404)
        if found.owner != user and variant != "wrong_owner":
            return JsonResponse({"detail": "Forbidden"}, status=403)
        if request.method == "DELETE":
            if variant != "delete_noop":
                found.delete()
            return HttpResponse("", status=204)
        return JsonResponse({"id": found.pk, "title": found.title, "owner": found.owner})

    return App([path("notes/", notes), path("notes/<int:pk>/", note_detail)])

def run_check(check_fn, variant):
    minidjango.reset()
    return check_fn(Client(make_app(variant)))
`;

// ───────────────────────── render trees and diffing (next-hydration) ─────────────────────────

export type HNode = string | { tag: string; props?: Record<string, string>; children?: HNode[] };

export interface Mismatch {
  path: string;
  kind: string;
}

const isEl = (n: HNode): n is Exclude<HNode, string> => typeof n !== 'string';

/** Walk two trees and list where the server HTML and the first client render disagree. */
export function diffTrees(server: HNode | undefined, client: HNode | undefined, path = ''): Mismatch[] {
  if (server === undefined && client === undefined) return [];
  if (server === undefined) return [{ path, kind: 'extra-client' }];
  if (client === undefined) return [{ path, kind: 'extra-server' }];
  if (!isEl(server) || !isEl(client)) {
    if (isEl(server) !== isEl(client)) return [{ path, kind: 'type' }];
    return server === client ? [] : [{ path, kind: 'text' }];
  }
  if (server.tag !== client.tag) return [{ path, kind: 'tag' }];
  const out: Mismatch[] = [];
  const sp = server.props ?? {};
  const cp = client.props ?? {};
  for (const key of [...new Set([...Object.keys(sp), ...Object.keys(cp)])]) if (sp[key] !== cp[key]) out.push({ path, kind: 'attr:' + key });
  const sk = server.children ?? [];
  const ck = client.children ?? [];
  for (let i = 0; i < Math.max(sk.length, ck.length); i++) out.push(...diffTrees(sk[i], ck[i], path ? `${path}.${i}` : String(i)));
  return out;
}

/** Lay a render tree out as a graph panel; `bad` marks paths that mismatch, `ok` paths already attached. */
export function renderTreePanel(root: HNode, title: string, bad: Set<string>, ok?: Set<string>): GraphPanel {
  const nodes: Record<string, NTreeNode> = {};
  const build = (n: HNode, path: string): string => {
    const id = 'n' + (path || 'root');
    const tone: Tone | undefined = bad.has(path) ? 'error' : ok?.has(path) ? 'done' : undefined;
    if (!isEl(n)) {
      nodes[id] = { id, label: n.length > 14 ? n.slice(0, 13) + '…' : n || '(empty)', children: [], tone };
      return id;
    }
    const attrs = Object.entries(n.props ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    nodes[id] = { id, label: `<${n.tag}>`, children: [], tone, badge: attrs ? clip(attrs, 22) : undefined };
    (n.children ?? []).forEach((c, i) => nodes[id].children.push(build(c, path ? `${path}.${i}` : String(i))));
    return id;
  };
  const rootId = build(root, '');
  return nTreePanel(nodes, rootId, { title, gapX: 90, gapY: 58 });
}
