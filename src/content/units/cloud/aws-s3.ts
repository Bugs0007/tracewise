import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, globMatch, globRegex, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def decide(statements, block_public, principal, action, key):
    allowed = False                                               #@init
    for effect, who, act, res in statements:                      #@loop
        if who not in ("*", principal):                           #@who
            continue
        if not (glob(act, action) and glob(res, key)):            #@match
            continue
        if effect == "Deny":
            return "EXPLICIT_DENY"                                #@deny
        if block_public and who == "*":
            continue                                              #@bpa
        allowed = True                                            #@allow
    return "ALLOW" if allowed else "IMPLICIT_DENY"                #@result

def presigned_status(signed_at, ttl, now, signer_allowed):
    if now < signed_at:
        return "NOT_YET_VALID"                                    #@early
    if now >= signed_at + ttl:
        return "EXPIRED"                                          #@expired
    if not signer_allowed:
        return "FORBIDDEN"                                        #@forbidden
    return "OK"                                                   #@ok
`;

interface In {
  statements: string[];
  requests: string[];
  blockPublic: string;
  presign: number[];
  signer: string;
}

interface Stmt {
  effect: string;
  who: string;
  act: string;
  res: string;
  text: string;
}

function parseStmt(s: string): Stmt {
  const p = s.trim().split(/\s+/);
  if (p.length !== 4 || !['Allow', 'Deny'].includes(p[0])) throw new Error(`Statement "${s}" should look like: Allow * GetObject public/*`);
  return { effect: p[0], who: p[1], act: p[2], res: p[3], text: s.trim() };
}
function parseReq(s: string): { who: string; act: string; key: string } {
  const p = s.trim().split(/\s+/);
  if (p.length !== 3) throw new Error(`Request "${s}" should look like: alice GetObject private/a.csv`);
  return { who: p[0], act: p[1], key: p[2] };
}

type Decision = 'ALLOW' | 'EXPLICIT_DENY' | 'IMPLICIT_DENY';

function decideRef(stmts: Stmt[], bp: boolean, who: string, act: string, key: string): Decision {
  const hits = stmts.filter((s) => (s.who === '*' || s.who === who) && globRegex(s.act, act) && globRegex(s.res, key));
  if (hits.some((s) => s.effect === 'Deny')) return 'EXPLICIT_DENY';
  return hits.some((s) => !(bp && s.who === '*')) ? 'ALLOW' : 'IMPLICIT_DENY';
}
function presignRef(signedAt: number, ttl: number, now: number, ok: boolean): string {
  if (now < signedAt) return 'NOT_YET_VALID';
  if (now - signedAt >= ttl) return 'EXPIRED';
  return ok ? 'OK' : 'FORBIDDEN';
}

const KEY = 'private/report.pdf';
const NODES: ArchNode[] = [
  { id: 'signer', label: 'Signer', x: 60, y: 30, shape: 'actor' },
  { id: 'client', label: 'Client', x: 60, y: 125, shape: 'actor' },
  { id: 'policy', label: 'Bucket policy', x: 235, y: 125 },
  { id: 'bucket', label: 'Bucket', x: 405, y: 125, shape: 'cylinder' },
  { id: 'std', label: 'STANDARD', x: 570, y: 35, shape: 'pill' },
  { id: 'ia', label: 'STANDARD_IA', x: 570, y: 100, shape: 'pill' },
  { id: 'gl', label: 'GLACIER', x: 570, y: 165, shape: 'pill' },
];
const EDGES: ArchEdge[] = [
  { from: 'signer', to: 'client', label: 'presigned URL' },
  { from: 'client', to: 'policy' },
  { from: 'policy', to: 'bucket' },
  { from: 'bucket', to: 'std', dashed: true, label: 'new objects' },
  { from: 'std', to: 'ia', dashed: true, label: '30 days' },
  { from: 'ia', to: 'gl', dashed: true, label: '90 days' },
];

const viz: VizDef<In> = {
  id: 'aws-s3',
  title: 'S3 bucket policy and presigned URL',
  code,
  language: 'python',
  inputs: [
    { key: 'statements', label: 'Bucket policy (Effect Principal Action Resource)', kind: 'strings', default: ['Allow * GetObject public/*', 'Allow alice * private/*', 'Deny * DeleteObject *'], maxItems: 6, help: 'Principal is * or a name. * in Action/Resource matches any run of characters.' },
    { key: 'requests', label: 'Requests (principal Action key)', kind: 'strings', default: ['anon GetObject public/logo.png', 'anon GetObject private/report.pdf', 'alice PutObject private/q3.csv', 'alice DeleteObject private/q3.csv'], maxItems: 6 },
    { key: 'blockPublic', label: 'Block Public Access', kind: 'select', default: 'off', options: ['off', 'on'] },
    { key: 'presign', label: 'Presigned URL: [signed at, valid for, used at] (seconds)', kind: 'numbers', default: [100, 300, 350], maxItems: 3 },
    { key: 'signer', label: 'Who signed the URL', kind: 'string', default: 'alice', maxItems: 12 },
  ],
  presets: [
    { label: 'Public prefix + private prefix', input: {} },
    { label: 'Block Public Access on', input: { blockPublic: 'on', presign: [100, 300, 200] } },
    { label: 'Deny overrides Allow', input: { statements: ['Allow * * *', 'Deny * GetObject secret/*'], requests: ['bob GetObject docs/a.txt', 'bob GetObject secret/key.pem', 'bob PutObject secret/key.pem'], presign: [0, 60, 30] } },
    { label: 'URL used before it was signed', input: { presign: [500, 60, 400] } },
  ],
  run(input) {
    const stmts = input.statements.map(parseStmt);
    const reqs = input.requests.map(parseReq);
    if (input.presign.length !== 3) throw new Error('Presign needs three numbers: signed at, valid for, used at');
    const [signedAt, ttl, now] = input.presign;
    if (ttl <= 0) throw new Error('A presigned URL must be valid for more than 0 seconds');
    const bp = input.blockPublic === 'on';
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const result: string[] = [];
    const view = (tones: Record<string, Tone>, flow: string | null, rows: Record<number, Tone>, badge: Record<string, string> = {}): Panel[] => [
      arch('Request path', 640, 200, NODES, EDGES, { tones, flow, badges: { policy: bp ? 'Block Public Access ON' : '', ...badge } }),
      listPanel('Bucket policy', stmts.map((s) => s.text), rows, {}, 'empty policy: everything is implicitly denied'),
      logPanel('Results', log),
    ];
    frame(r, 'init', `${stmts.length} policy statements, ${reqs.length} requests, Block Public Access ${input.blockPublic}`, view({}, null, {}), { statements: stmts.length });
    for (const q of reqs) {
      r.op();
      const rows: Record<number, Tone> = {};
      frame(r, 'loop', `${q.who} wants ${q.act} on ${q.key}`, view({ client: 'active', policy: 'compare' }, 'client>policy', rows), { who: q.who, action: q.act, key: q.key });
      let allowed = false;
      let outcome: Decision | null = null;
      for (let i = 0; i < stmts.length; i++) {
        const s = stmts[i];
        rows[i] = 'compare';
        if (s.who !== '*' && s.who !== q.who) {
          frame(r, 'who', `Statement ${i + 1} is for ${s.who}, not ${q.who}: skip`, view({ policy: 'compare' }, null, { ...rows }), { statement: i + 1 });
          rows[i] = 'muted';
          continue;
        }
        if (!(globMatch(s.act, q.act) && globMatch(s.res, q.key))) {
          frame(r, 'match', `Statement ${i + 1}: ${s.act} on ${s.res} does not cover this request`, view({ policy: 'compare' }, null, { ...rows }), { statement: i + 1 });
          rows[i] = 'muted';
          continue;
        }
        if (s.effect === 'Deny') {
          rows[i] = 'error';
          outcome = 'EXPLICIT_DENY';
          frame(r, 'deny', `Statement ${i + 1} is a Deny that matches: explicit deny beats any Allow`, view({ policy: 'error', client: 'error' }, null, { ...rows }), { decision: outcome });
          break;
        }
        if (bp && s.who === '*') {
          rows[i] = 'muted';
          frame(r, 'bpa', `Statement ${i + 1} allows everyone, but Block Public Access ignores it`, view({ policy: 'compare' }, null, { ...rows }), { statement: i + 1 });
          continue;
        }
        rows[i] = 'found';
        allowed = true;
        frame(r, 'allow', `Statement ${i + 1} allows it. Keep looking for a Deny`, view({ policy: 'found' }, null, { ...rows }), { allowed: true });
      }
      const d: Decision = outcome ?? (allowed ? 'ALLOW' : 'IMPLICIT_DENY');
      result.push(d);
      log.push({ text: `${q.who} ${q.act} ${q.key}: ${d}`, tone: d === 'ALLOW' ? 'found' : 'error' });
      frame(r, 'result', d === 'ALLOW' ? 'No Deny and at least one Allow: request served from the bucket' : d === 'EXPLICIT_DENY' ? 'Result: EXPLICIT_DENY, 403 Access Denied' : 'No statement allows it: IMPLICIT_DENY, 403', view(d === 'ALLOW' ? { policy: 'found', bucket: 'active' } : { policy: 'error' }, d === 'ALLOW' ? 'policy>bucket' : null, rows), { decision: d });
    }
    // Presigned URL phase
    const signerAllowed = decideRef(stmts, false, input.signer, 'GetObject', KEY) === 'ALLOW';
    frame(r, 'early', `${input.signer} signs a URL for ${KEY} at t=${signedAt}, valid ${ttl}s (until t=${signedAt + ttl})`, view({ signer: 'active', client: 'new' }, 'signer>client', {}), { signed_at: signedAt, ttl });
    frame(r, 'early', `Client uses the URL at t=${now}. S3 checks the clock first`, view({ client: 'active', policy: 'compare' }, 'client>policy', {}), { now });
    let status: string;
    if (now < signedAt) {
      status = 'NOT_YET_VALID';
      frame(r, 'early', `t=${now} is before the signing time ${signedAt}: rejected`, view({ client: 'error', policy: 'error' }, null, {}), { status });
    } else if (now >= signedAt + ttl) {
      status = 'EXPIRED';
      frame(r, 'expired', `t=${now} >= ${signedAt}+${ttl}: the URL has expired, 403`, view({ client: 'error', policy: 'error' }, null, {}), { status });
    } else if (!signerAllowed) {
      status = 'FORBIDDEN';
      frame(r, 'forbidden', `${input.signer} may not GetObject ${KEY}, so neither can the URL`, view({ client: 'error', policy: 'error' }, null, {}), { status });
    } else {
      status = 'OK';
      frame(r, 'ok', 'Signature valid, not expired, signer allowed: object served', view({ client: 'found', policy: 'found', bucket: 'active' }, 'policy>bucket', {}), { status });
    }
    result.push(status);
    return { frames: r.frames, result };
  },
  reference(input) {
    const stmts = input.statements.map(parseStmt);
    const bp = input.blockPublic === 'on';
    const out: string[] = input.requests.map(parseReq).map((q) => decideRef(stmts, bp, q.who, q.act, q.key));
    const [signedAt, ttl, now] = input.presign;
    out.push(presignRef(signedAt, ttl, now, decideRef(stmts, false, input.signer, 'GetObject', KEY) === 'ALLOW'));
    return out;
  },
};

const FS = [
  ['Allow', '*', 'GetObject', 'public/*'],
  ['Allow', 'alice', '*', 'private/*'],
  ['Deny', '*', 'DeleteObject', '*'],
];

const unit: Unit = {
  id: 'aws-s3',
  hook: 'S3 shows up everywhere: storage classes, access control and "how do I share a private file?". The access rules are the same explicit-deny-first logic as IAM, and presigned URLs are the standard answer to temporary sharing.',
  predict: {
    prompt: 'You email a presigned GET URL valid for 1 hour. After 10 minutes you remove the signing user\'s S3 permissions. Someone opens the link at minute 20. What happens?',
    options: ['It works: the URL carries its own permission', 'It fails with 403: S3 checks the signer\'s permissions when the request arrives', 'It works until the hour is up, then fails', 'It redirects to a login page'],
    answer: 1,
    explain: 'A presigned URL borrows the signer\'s identity. Both the signature/expiry and the signer\'s current permissions are checked on every use, so revoking access kills outstanding URLs.',
  },
  viz,
  deeper: {
    points: [
      'A bucket is a flat namespace: "folders" are just **key prefixes** like `reports/2024/`. Listing by prefix and delimiter is what makes it feel hierarchical.',
      'Access = identity policies + bucket policy + (optional) ACLs + Block Public Access. An **explicit Deny** wins, otherwise any Allow wins, otherwise implicit deny.',
      '**Storage classes** trade access cost for storage cost: Standard, Standard-IA, Glacier tiers. Lifecycle rules move or expire objects by age.',
      'Presigned URLs are computed locally with the signer\'s credentials; expiry is part of the signature and cannot be extended.',
      'Strong read-after-write consistency applies to all operations; versioning plus MFA delete protects against accidental overwrites.',
    ],
    pitfalls: ['Making a bucket public to "fix" a permissions error', 'Forgetting that role-based temporary credentials expire sooner than the URL\'s stated lifetime', 'Treating prefixes as real directories (no atomic rename)'],
  },
  practice: {
    language: 'python',
    fnName: 'presigned_status',
    statement: 'Return the status of a presigned URL: "NOT_YET_VALID" if `now < signed_at`, "EXPIRED" once `now >= signed_at + ttl`, "FORBIDDEN" if the signer no longer has permission, otherwise "OK". Check them in that order.',
    signature: 'def presigned_status(signed_at, ttl, now, signer_allowed):',
    solution: `def presigned_status(signed_at, ttl, now, signer_allowed):
    if now @@<@@ signed_at:
        return "NOT_YET_VALID"
    if now @@>=@@ signed_at + ttl:
        return "EXPIRED"
    if @@not signer_allowed@@:
        return "FORBIDDEN"
    return "OK"`,
    tests: [
      { args: [100, 300, 350, true], expected: 'OK', name: 'inside the window' },
      { args: [100, 300, 400, true], expected: 'EXPIRED', name: 'exactly at expiry is expired' },
      { args: [100, 300, 399, true], expected: 'OK', name: 'last valid second' },
      { args: [100, 300, 99, true], expected: 'NOT_YET_VALID', name: 'clock earlier than signing time' },
      { args: [100, 300, 150, false], expected: 'FORBIDDEN', name: 'signer lost access' },
      { args: [100, 300, 500, false], expected: 'EXPIRED', name: 'expiry reported before permissions' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'decide',
    statement: 'A bucket has `Allow * GetObject *` and `Deny * GetObject secret/*`, yet anonymous users can download `secret/keys.txt`. Fix `decide` so a matching Deny always wins.',
    buggy: `from fnmatch import fnmatchcase

def decide(statements, principal, action, key):
    for effect, who, act, res in statements:
        if who in ("*", principal) and fnmatchcase(action, act) and fnmatchcase(key, res):
            return "ALLOW" if effect == "Allow" else "EXPLICIT_DENY"
    return "IMPLICIT_DENY"`,
    fixed: `from fnmatch import fnmatchcase

def decide(statements, principal, action, key):
    allowed = False
    for effect, who, act, res in statements:
        if who in ("*", principal) and fnmatchcase(action, act) and fnmatchcase(key, res):
            if effect == "Deny":
                return "EXPLICIT_DENY"
            allowed = True
    return "ALLOW" if allowed else "IMPLICIT_DENY"`,
    tests: [
      { args: [FS, 'anon', 'GetObject', 'public/a.png'], expected: 'ALLOW', name: 'public prefix' },
      { args: [[['Allow', '*', 'GetObject', '*'], ['Deny', '*', 'GetObject', 'secret/*']], 'anon', 'GetObject', 'secret/keys.txt'], expected: 'EXPLICIT_DENY', name: 'later deny beats earlier allow' },
      { args: [[['Allow', '*', 'GetObject', '*'], ['Deny', '*', 'GetObject', 'secret/*']], 'anon', 'GetObject', 'docs/a.txt'], expected: 'ALLOW', name: 'deny only covers its prefix' },
      { args: [FS, 'bob', 'PutObject', 'private/a.csv'], expected: 'IMPLICIT_DENY', name: 'no matching allow' },
      { args: [FS, 'alice', 'DeleteObject', 'private/a.csv'], expected: 'EXPLICIT_DENY', name: 'deny on delete' },
    ],
    bugType: 'deny not overriding allow',
    hint: 'The function returns on the first statement that matches. What if an Allow comes before the Deny?',
    explanation: 'Evaluation must look at every matching statement: remember that an Allow was seen, but return immediately when a Deny matches. Returning the first match makes statement order decide the outcome, which is not how S3 or IAM work.',
  },
  boss: {
    title: 'Bucket policy with Block Public Access',
    statement: 'Write `s3_decision(statements, block_public, principal, action, key)`. Statements are `[effect, who, action_pattern, key_pattern]`; `who` is `*` or a name, patterns use `*` wildcards (use `fnmatch.fnmatchcase`). A statement applies if `who` is `*` or equals `principal`, and both patterns match. Any applying Deny gives "EXPLICIT_DENY". Otherwise an applying Allow gives "ALLOW", except that when `block_public` is true an Allow whose `who` is `*` is ignored. With nothing left: "IMPLICIT_DENY".',
    language: 'python',
    fnName: 's3_decision',
    starter: `def s3_decision(statements, block_public, principal, action, key):
    pass
`,
    solution: `from fnmatch import fnmatchcase

def s3_decision(statements, block_public, principal, action, key):
    allowed = False
    for effect, who, act, res in statements:
        if who not in ("*", principal):
            continue
        if not (fnmatchcase(action, act) and fnmatchcase(key, res)):
            continue
        if effect == "Deny":
            return "EXPLICIT_DENY"
        if block_public and who == "*":
            continue
        allowed = True
    return "ALLOW" if allowed else "IMPLICIT_DENY"`,
    tests: [
      { args: [FS, false, 'anon', 'GetObject', 'public/a.png'], expected: 'ALLOW', name: 'public read' },
      { args: [FS, true, 'anon', 'GetObject', 'public/a.png'], expected: 'IMPLICIT_DENY', name: 'Block Public Access ignores the public Allow' },
      { args: [FS, true, 'alice', 'GetObject', 'private/a.csv'], expected: 'ALLOW', name: 'named principal still allowed' },
      { args: [FS, true, 'alice', 'DeleteObject', 'private/a.csv'], expected: 'EXPLICIT_DENY', name: 'deny stays active' },
      { args: [[['Allow', '*', 'Get*', 'logs/*'], ['Deny', 'bob', '*', 'logs/secret*']], false, 'bob', 'GetObject', 'logs/secret.txt'], expected: 'EXPLICIT_DENY', name: 'wildcard action and key' },
      { args: [[['Allow', '*', 'Get*', 'logs/*'], ['Deny', 'bob', '*', 'logs/secret*']], false, 'carol', 'GetObject', 'logs/secret.txt'], expected: 'ALLOW', name: 'deny is scoped to bob' },
      { args: [[], false, 'alice', 'GetObject', 'a'], expected: 'IMPLICIT_DENY', name: 'empty policy' },
    ],
    hints: ['Loop over every statement: skip it unless the principal and both patterns match; a Deny returns immediately.', 'For an Allow, check `block_public and who == "*"` before setting `allowed = True`; return ALLOW only if `allowed` ended up true.'],
    combines: ['aws-iam'],
  },
  quiz: [
    {
      prompt: 'Which feature moves objects to cheaper storage as they age?',
      options: ['Versioning', 'Lifecycle rules', 'Presigned URLs', 'Bucket policies'],
      answer: 1,
      explain: 'Lifecycle rules transition objects between storage classes (for example Standard to Standard-IA to Glacier) or expire them after a number of days.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
