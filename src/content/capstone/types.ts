// Capstone: a small full-stack app built by hand, milestone by milestone.
// Backend = one Python file using minidjango (runs in Pyodide); frontend = one
// React component `App` (runs in the sandbox) whose fetch() calls are answered
// by the learner's own backend through an in-browser mock network.
import type { ReactTest, TestCase } from '@/content/types';

export interface MockReq {
  method: string;
  url: string;
  body?: string | null;
  headers?: Record<string, string>;
}

export interface Milestone {
  id: string;
  title: string;
  part: 'backend' | 'frontend';
  /** what to build (supports `code` and **bold**) */
  brief: string;
  /** backend checks: args = [steps], expected = [[status, body], ...] (see CAPSTONE_HARNESS) */
  tests?: TestCase[];
  /** frontend checks run against the learner's backend */
  reactTests?: ReactTest[];
  /** requests replayed into the backend before frontend checks (seed data) */
  seed?: MockReq[];
  hints: [string, string];
  /** the reference file for this part at the end of this milestone (shown only on final reveal) */
  reveal: string;
}

export interface CapstoneProject {
  id: string;
  title: string;
  blurb: string;
  backendStarter: string;
  frontendStarter: string;
  milestones: Milestone[];
}

/** Hidden helpers for backend milestone tests: fnName 'app', adapter 'run_requests'. */
export const CAPSTONE_HARNESS = `
import json as _json

def run_requests(app, steps):
    """Each step: {method, url, body?, headers?, only?: "status", auth?: true}.
    auth=true sends "Authorization: Bearer <token>" using the last "token" any response returned."""
    from minidjango.test import Client
    from minidjango import db as _db
    import copy as _copy
    # every script starts from the database as it was right after the backend loaded
    base = globals().setdefault("_CAPSTONE_BASE", {})
    if id(app) not in base:
        base[id(app)] = _copy.deepcopy(_db.connection.tables)
    else:
        _db.connection.tables = _copy.deepcopy(base[id(app)])
    client = Client(app)
    out = []
    token = None
    for s in steps:
        headers = dict(s.get("headers") or {})
        if s.get("auth") and token:
            headers["Authorization"] = "Bearer " + token
        r = client.request(s.get("method", "GET"), s["url"], s.get("body"), headers)
        try:
            body = r.json()
        except Exception:
            body = r.content
        if isinstance(body, dict) and isinstance(body.get("token"), str):
            token = body["token"]
        out.append(r.status_code if s.get("only") == "status" else [r.status_code, body])
    return out
`;

export const req = (method: string, url: string, body?: unknown, headers?: Record<string, string>): { method: string; url: string; body?: any; headers?: Record<string, string> } => ({ method, url, ...(body !== undefined ? { body } : {}), ...(headers ? { headers } : {}) });
