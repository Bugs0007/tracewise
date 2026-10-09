import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, globMatch, globRegex, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
from fnmatch import fnmatchcase as match

def is_allowed(policies, action, resource):
    allowed = False
    for effect, act, res in policies:                  #@loop
        if not (match(action, act) and match(resource, res)):
            continue                                   #@skip
        if effect == "Deny":
            return False                               #@deny
        allowed = True                                 #@allow
    return allowed                                     #@result

def request(user, role, trusts, who, action, resource):
    if who == "user":
        return is_allowed(user, action, resource)      #@user
    if not trusts or not is_allowed(user, "sts:AssumeRole", "role/deployer"):
        return False                                   #@assume
    return is_allowed(role, action, resource)          #@role
`;

interface In {
  user: string[];
  role: string[];
  trust: string;
  requests: string[];
}

const TRUST = ['role trusts alice', 'role trusts nobody'];
const ROLE_ARN = 'role/deployer';

interface Stmt {
  effect: string;
  act: string;
  res: string;
  text: string;
}
interface Req {
  who: 'user' | 'role';
  action: string;
  resource: string;
  text: string;
}

function parseStmt(s: string): Stmt {
  const p = s.trim().split(/\s+/);
  if (p.length !== 3 || !['Allow', 'Deny'].includes(p[0])) throw new Error(`Statement "${s}" should look like: Allow s3:GetObject logs/*`);
  return { effect: p[0], act: p[1], res: p[2], text: s.trim() };
}
function parseReq(s: string): Req {
  const p = s.trim().split(/\s+/);
  if (p.length !== 3 || !['user', 'role'].includes(p[0])) throw new Error(`Request "${s}" should look like: user s3:GetObject logs/a.txt  (or "role ...")`);
  return { who: p[0] as 'user' | 'role', action: p[1], resource: p[2], text: s.trim() };
}

function allowedRef(stmts: Stmt[], action: string, resource: string): boolean {
  const hits = stmts.filter((s) => globRegex(s.act, action) && globRegex(s.res, resource));
  return hits.length > 0 && hits.every((s) => s.effect === 'Allow');
}

const NODES: ArchNode[] = [
  { id: 'user', label: 'User alice', x: 55, y: 60, shape: 'actor' },
  { id: 'eval', label: 'Policy evaluation', x: 250, y: 60 },
  { id: 'res', label: 'Resource', x: 450, y: 60, shape: 'cylinder' },
  { id: 'sts', label: 'STS', x: 150, y: 150, shape: 'pill' },
  { id: 'role', label: 'Role deployer', x: 340, y: 150 },
];
const EDGES: ArchEdge[] = [
  { from: 'user', to: 'eval' },
  { from: 'eval', to: 'res' },
  { from: 'user', to: 'sts', dashed: true, label: 'AssumeRole' },
  { from: 'sts', to: 'role', dashed: true },
  { from: 'role', to: 'eval' },
];

const viz: VizDef<In> = {
  id: 'aws-iam',
  title: 'IAM policy evaluation and assuming a role',
  code,
  language: 'python',
  inputs: [
    { key: 'user', label: "alice's policies (Effect Action Resource)", kind: 'strings', default: ['Allow s3:* logs/*', 'Deny s3:Delete* logs/prod/*', 'Allow sts:AssumeRole role/deployer'], maxItems: 5, help: '* matches any run of characters, ? exactly one.' },
    { key: 'role', label: "Role deployer's policies", kind: 'strings', default: ['Allow s3:* *', 'Allow ec2:Describe* *'], maxItems: 4 },
    { key: 'trust', label: 'Trust policy of the role', kind: 'select', default: TRUST[0], options: TRUST },
    { key: 'requests', label: 'Requests (who action resource)', kind: 'strings', default: ['user s3:GetObject logs/app.txt', 'user s3:DeleteObject logs/prod/x', 'user ec2:DescribeInstances i-1', 'role s3:DeleteObject logs/prod/x', 'role ec2:StartInstances i-1'], maxItems: 5 },
  ],
  presets: [
    { label: 'Allow, deny and assume a role', input: {} },
    { label: 'Explicit deny beats allow', input: { user: ['Allow s3:* *', 'Deny s3:DeleteObject *'], requests: ['user s3:GetObject a', 'user s3:DeleteObject a', 'user s3:PutObject a'] } },
    { label: 'Role does not trust alice', input: { trust: TRUST[1], requests: ['role s3:GetObject logs/a', 'user s3:GetObject logs/a'] } },
    { label: 'No policies: implicit deny', input: { user: [], role: [], requests: ['user s3:GetObject a', 'role s3:GetObject a'] } },
  ],
  run(input) {
    const user = input.user.map(parseStmt);
    const role = input.role.map(parseStmt);
    const reqs = input.requests.map(parseReq);
    if (!reqs.length) throw new Error('Add at least one request');
    const trusts = input.trust === TRUST[0];
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const out: boolean[] = [];
    const view = (tones: Record<string, Tone>, flow: string | null, ut: Record<number, Tone>, rt: Record<number, Tone>): Panel[] => [
      arch('Who is asking, and with which permissions', 640, 195, NODES, EDGES, { tones, flow }),
      listPanel("alice's policies", user.map((x) => x.text), ut, {}, '(none): everything is implicitly denied'),
      listPanel("Role deployer's policies", role.map((x) => x.text), rt, {}, '(none)'),
      logPanel('Decisions', log),
    ];
    /** Evaluate a policy list, recording one frame per statement. Returns the decision. */
    const evaluate = (list: Stmt[], which: 'u' | 'r', action: string, resource: string, tones: Record<string, Tone>): boolean => {
      const rows: Record<number, Tone> = {};
      const show = (nt: Record<string, Tone>, flow: string | null) => (which === 'u' ? view(nt, flow, { ...rows }, {}) : view(nt, flow, {}, { ...rows }));
      let allowed = false;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        r.op();
        rows[i] = 'compare';
        if (!(globMatch(s.act, action) && globMatch(s.res, resource))) {
          frame(r, 'skip', `Statement ${i + 1} (${s.act} on ${s.res}) does not cover ${action} on ${resource}`, show({ eval: 'compare', ...tones }, null), { statement: i + 1 });
          rows[i] = 'muted';
          continue;
        }
        if (s.effect === 'Deny') {
          rows[i] = 'error';
          frame(r, 'deny', `Statement ${i + 1} is a matching Deny: explicit deny always wins`, show({ eval: 'error', ...tones }, null), { allowed: false });
          return false;
        }
        rows[i] = 'found';
        allowed = true;
        frame(r, 'allow', `Statement ${i + 1} allows it. Keep scanning for a Deny`, show({ eval: 'found', ...tones }, null), { allowed: true });
      }
      frame(r, 'result', allowed ? 'No Deny and at least one Allow: allowed' : 'Nothing allows it: implicit deny', show({ eval: allowed ? 'done' : 'error', ...tones }, null), { allowed });
      return allowed;
    };
    frame(r, 'loop', `${user.length} user statements, ${role.length} role statements, ${reqs.length} requests`, view({}, null, {}, {}), { requests: reqs.length });
    for (const q of reqs) {
      let ok: boolean;
      if (q.who === 'user') {
        frame(r, 'user', `alice calls ${q.action} on ${q.resource} with her own permissions`, view({ user: 'active', eval: 'compare' }, 'user>eval', {}, {}), { who: 'user' });
        ok = evaluate(user, 'u', q.action, q.resource, { user: 'active' });
      } else {
        frame(r, 'assume', `alice asks STS to assume ${ROLE_ARN}`, view({ user: 'active', sts: 'compare' }, 'user>sts', {}, {}), { who: 'role' });
        const mayAssume = trusts && evaluate(user, 'u', 'sts:AssumeRole', ROLE_ARN, { sts: 'compare' });
        if (!trusts) {
          frame(r, 'assume', 'The role trust policy does not name alice: STS refuses', view({ sts: 'error', role: 'error' }, null, {}, {}), { trusts: false });
          ok = false;
        } else if (!mayAssume) {
          frame(r, 'assume', 'alice has no Allow for sts:AssumeRole on the role: refused', view({ sts: 'error', role: 'error' }, null, {}, {}), { may_assume: false });
          ok = false;
        } else {
          frame(r, 'role', 'Assumed. Her own permissions are set aside; only the role\'s apply', view({ sts: 'found', role: 'active' }, 'sts>role', {}, {}), { assumed: true });
          ok = evaluate(role, 'r', q.action, q.resource, { role: 'active' });
        }
      }
      out.push(ok);
      log.push({ text: `${q.text}: ${ok ? 'ALLOWED' : 'DENIED'}`, tone: ok ? 'found' : 'error' });
      frame(r, 'result', `${q.who} ${q.action} on ${q.resource}: ${ok ? 'allowed' : 'denied'}`, view({ [q.who === 'user' ? 'user' : 'role']: ok ? 'found' : 'error', res: ok ? 'active' : 'default' }, ok ? 'eval>res' : null, {}, {}), { allowed: ok });
    }
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const user = input.user.map(parseStmt);
    const role = input.role.map(parseStmt);
    const trusts = input.trust === TRUST[0];
    return input.requests.map(parseReq).map((q) => {
      if (q.who === 'user') return allowedRef(user, q.action, q.resource);
      return trusts && allowedRef(user, 'sts:AssumeRole', ROLE_ARN) && allowedRef(role, q.action, q.resource);
    });
  },
};

const unit: Unit = {
  id: 'aws-iam',
  hook: 'Every AWS permission question reduces to one rule: an explicit Deny beats any Allow, and without an Allow the answer is no. Roles, and "why can I still not do it?", are variations on that evaluation.',
  predict: {
    prompt: 'A user has one policy that allows s3:* on everything and another that denies s3:DeleteObject on one bucket. Can the user delete an object in that bucket?',
    options: ['Yes: the broader Allow wins', 'No: an explicit Deny always overrides any Allow', 'Whichever policy was attached last wins', 'Only if the Deny is removed and re-added'],
    answer: 1,
    explain: 'Evaluation: start from implicit deny; an Allow flips it to allowed; but any matching explicit Deny in any applicable policy ends the evaluation with deny. Order and breadth do not matter.',
  },
  viz,
  deeper: {
    points: [
      'Default is **implicit deny**. A request is allowed only if some policy **Allows** it and **no** applicable policy **Denies** it. Explicit deny wins over everything.',
      'Policy statements have an effect, actions (`s3:GetObject`, wildcards like `s3:*`), resources (ARNs, wildcards) and optional conditions. Wildcards are string matching, not regular expressions.',
      'A **role** has no credentials of its own. A principal calls `sts:AssumeRole`, which needs an Allow on the caller **and** a matching **trust policy** on the role; the temporary credentials then carry only the role\'s permissions.',
      '**Permission boundaries** and organisation **SCPs** cap what identities can do: the effective permission is the intersection, with explicit denies still winning.',
      'Resource policies (S3 bucket policy, SQS queue policy) are evaluated together with identity policies; for the same account either can grant access.',
    ],
    pitfalls: ['Granting `*:*` to make an error go away', 'Forgetting the trust policy when "AccessDenied" appears on AssumeRole', 'Believing assuming a role adds to your own permissions: it replaces them for that session'],
  },
  practice: {
    language: 'python',
    fnName: 'is_allowed',
    statement: 'Policies are `[effect, action_pattern, resource_pattern]` lists (effect "Allow" or "Deny", patterns use `*` wildcards; use `fnmatch.fnmatchcase`). Return True only if at least one matching statement allows the request and no matching statement denies it.',
    signature: 'def is_allowed(policies, action, resource):',
    solution: `from fnmatch import fnmatchcase

def is_allowed(policies, action, resource):
    allowed = False
    for effect, act, res in policies:
        if not (fnmatchcase(action, act) and fnmatchcase(resource, res)):
            continue
        if effect == @@"Deny"@@:
            return @@False@@
        allowed = @@True@@
    return allowed`,
    tests: [
      { args: [[['Allow', 's3:*', '*']], 's3:GetObject', 'b/k'], expected: true, name: 'wildcard allow' },
      { args: [[['Allow', 's3:*', '*'], ['Deny', 's3:Delete*', 'b/*']], 's3:DeleteObject', 'b/k'], expected: false, name: 'deny after allow' },
      { args: [[['Deny', 's3:Delete*', 'b/*'], ['Allow', 's3:*', '*']], 's3:DeleteObject', 'b/k'], expected: false, name: 'deny before allow' },
      { args: [[['Allow', 's3:Get*', 'a/*']], 's3:GetObject', 'b/k'], expected: false, name: 'resource not covered' },
      { args: [[], 's3:GetObject', 'b/k'], expected: false, name: 'no policies: implicit deny' },
      { args: [[['Allow', 's3:*', 'b/*'], ['Deny', 'ec2:*', '*']], 's3:GetObject', 'b/k'], expected: true, name: 'unrelated deny' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'is_allowed',
    statement: 'A user with `Allow s3:*` listed first can still delete objects that another policy explicitly denies. Fix `is_allowed`.',
    buggy: `from fnmatch import fnmatchcase

def is_allowed(policies, action, resource):
    for effect, act, res in policies:
        if fnmatchcase(action, act) and fnmatchcase(resource, res):
            return effect == "Allow"
    return False`,
    fixed: `from fnmatch import fnmatchcase

def is_allowed(policies, action, resource):
    allowed = False
    for effect, act, res in policies:
        if fnmatchcase(action, act) and fnmatchcase(resource, res):
            if effect == "Deny":
                return False
            allowed = True
    return allowed`,
    tests: [
      { args: [[['Allow', 's3:*', '*'], ['Deny', 's3:Delete*', 'b/*']], 's3:DeleteObject', 'b/k'], expected: false, name: 'later deny must win' },
      { args: [[['Allow', 's3:*', '*'], ['Deny', 's3:Delete*', 'b/*']], 's3:GetObject', 'b/k'], expected: true, name: 'deny does not cover Get' },
      { args: [[['Deny', 's3:*', '*'], ['Allow', 's3:*', '*']], 's3:GetObject', 'b/k'], expected: false, name: 'deny listed first' },
      { args: [[], 's3:GetObject', 'x'], expected: false, name: 'implicit deny' },
    ],
    bugType: 'deny not overriding allow',
    hint: 'The loop returns on the first matching statement. What if the matching Deny comes after an Allow?',
    explanation: 'Statement order is irrelevant in IAM. Remember that an Allow matched, but keep scanning, and return False immediately when any Deny matches.',
  },
  boss: {
    title: 'Assume a role, then evaluate',
    statement: 'Write `session_allowed(user_policies, role_policies, trusts, who, action, resource)`. Policies are `[effect, action_pattern, resource_pattern]` (wildcards via `fnmatch.fnmatchcase`; a matching Deny beats any Allow; no Allow means no). If `who == "user"` evaluate the user\'s policies. If `who == "role"` the caller must first be permitted to `sts:AssumeRole` on resource `role/deployer` by the USER policies and `trusts` must be true; if so evaluate ONLY the role\'s policies (the user\'s own permissions do not carry over), otherwise return False.',
    language: 'python',
    fnName: 'session_allowed',
    starter: `def session_allowed(user_policies, role_policies, trusts, who, action, resource):
    pass
`,
    solution: `from fnmatch import fnmatchcase

def session_allowed(user_policies, role_policies, trusts, who, action, resource):
    def check(policies, act, res):
        allowed = False
        for effect, a, r in policies:
            if fnmatchcase(act, a) and fnmatchcase(res, r):
                if effect == "Deny":
                    return False
                allowed = True
        return allowed

    if who == "user":
        return check(user_policies, action, resource)
    if not trusts or not check(user_policies, "sts:AssumeRole", "role/deployer"):
        return False
    return check(role_policies, action, resource)`,
    tests: [
      { args: [[['Allow', 's3:*', 'logs/*'], ['Allow', 'sts:AssumeRole', 'role/deployer']], [['Allow', 'ec2:*', '*']], true, 'role', 'ec2:StartInstances', 'i-1'], expected: true, name: 'role grants what the user lacks' },
      { args: [[['Allow', 's3:*', 'logs/*'], ['Allow', 'sts:AssumeRole', 'role/deployer']], [['Allow', 'ec2:*', '*']], true, 'role', 's3:GetObject', 'logs/a'], expected: false, name: 'user permissions do not carry over' },
      { args: [[['Allow', 's3:*', '*']], [['Allow', '*', '*']], true, 'role', 's3:GetObject', 'a'], expected: false, name: 'user may not assume the role' },
      { args: [[['Allow', 'sts:AssumeRole', 'role/deployer']], [['Allow', '*', '*']], false, 'role', 's3:GetObject', 'a'], expected: false, name: 'trust policy missing' },
      { args: [[['Allow', 'sts:*', '*'], ['Deny', 'sts:AssumeRole', 'role/*']], [['Allow', '*', '*']], true, 'role', 's3:GetObject', 'a'], expected: false, name: 'explicit deny on AssumeRole' },
      { args: [[['Allow', 's3:*', '*'], ['Deny', 's3:Delete*', '*']], [], true, 'user', 's3:DeleteObject', 'k'], expected: false, name: 'user deny' },
      { args: [[['Allow', 'sts:AssumeRole', 'role/deployer']], [['Allow', 's3:*', '*'], ['Deny', 's3:Delete*', 'prod/*']], true, 'role', 's3:DeleteObject', 'prod/x'], expected: false, name: 'role deny' },
    ],
    hints: ['Write one inner `check(policies, action, resource)` that does the Allow/Deny scan, then call it for the user, for the AssumeRole step and for the role.', 'The role path is: `trusts` must be true AND `check(user_policies, "sts:AssumeRole", "role/deployer")`; only then `return check(role_policies, action, resource)`.'],
    combines: ['aws-s3', 'aws-ec2'],
  },
  quiz: [
    {
      prompt: 'You can assume a role, but calls still fail with AccessDenied for AssumeRole. Which two things must both be true?',
      options: ['MFA enabled and a VPC endpoint', 'Your identity policy allows sts:AssumeRole and the role trust policy names you', 'The role has AdministratorAccess and you are in the same region', 'A resource policy on the target and a permission boundary'],
      answer: 1,
      explain: 'AssumeRole needs permission on both sides: the caller must be allowed to call it, and the role must trust the caller.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
