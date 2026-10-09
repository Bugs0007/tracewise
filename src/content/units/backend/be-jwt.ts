import { Recorder } from '@/engine/recorder';
import type { GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { b64url, hmacSha256, short, step, toHex } from '@/content/lib/backend-db-auth';

const code = `
def sign(payload, secret):
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}))      #@header
    body = b64(json.dumps(payload, sort_keys=True))                #@body
    signing_input = f"{header}.{body}"                             #@input
    sig = b64(hmac.new(secret, signing_input.encode(), sha256).digest())   #@sign
    return f"{signing_input}.{sig}"                                #@token

def verify(token, secret, now):
    header, body, sig = token.split(".")                           #@split
    if json.loads(unb64(header))["alg"] != "HS256":                #@alg
        raise InvalidToken("unexpected alg")
    expected = b64(hmac.new(secret, f"{header}.{body}".encode(), sha256).digest())   #@recompute
    if not hmac.compare_digest(expected, sig):                     #@compare
        raise InvalidToken("bad signature")
    payload = json.loads(unb64(body))
    if payload["exp"] <= now:                                      #@exp
        raise InvalidToken("expired")
    return payload                                                 #@ok
`;

const SCENARIOS = ['valid', 'tampered payload', 'wrong secret', 'alg=none forged'];
const SECRET = 's3cret';

interface In {
  sub: string;
  exp: number;
  now: number;
  scenario: string;
}

const json = (o: Record<string, unknown>) => JSON.stringify(o);
const sign = (secret: string, input: string) => b64url(hmacSha256(secret, input));

const viz: VizDef<In> = {
  id: 'be-jwt',
  title: 'Building and verifying a JWT',
  code,
  language: 'python',
  inputs: [
    { key: 'sub', label: 'Subject (user)', kind: 'string', default: 'alice', maxItems: 12 },
    { key: 'exp', label: 'exp (expiry, seconds)', kind: 'number', default: 3600 },
    { key: 'now', label: 'Server clock now', kind: 'number', default: 1200 },
    { key: 'scenario', label: 'Token that arrives', kind: 'select', options: SCENARIOS, default: 'valid' },
  ],
  presets: [
    { label: 'Valid token', input: { scenario: 'valid', exp: 3600, now: 1200 } },
    { label: 'Expired token', input: { scenario: 'valid', exp: 3600, now: 5000 } },
    { label: 'Tampered payload', input: { scenario: 'tampered payload' } },
    { label: 'Wrong secret', input: { scenario: 'wrong secret' } },
    { label: 'alg=none forged', input: { scenario: 'alg=none forged' } },
  ],
  run({ sub, exp, now, scenario }) {
    const r = new Recorder(code);
    const user = sub || 'alice';
    const payload = { exp, role: 'user', sub: user };
    const hdr = json({ alg: 'HS256', typ: 'JWT' });
    const pl = json(payload);

    const parts = (p: { h?: string; b?: string; s?: string }, tones: { h?: Tone; b?: Tone; s?: Tone }, meaning: { h?: string; b?: string; s?: string }): GraphPanel => ({
      type: 'graph',
      title: 'token = header . payload . signature',
      width: 640,
      height: 110,
      nodes: [
        { id: 'h', label: p.h ? short(p.h, 16) : 'header', x: 110, y: 40, shape: 'pill', w: 180, h: 36, tone: tones.h ?? 'muted', sub: meaning.h },
        { id: 'b', label: p.b ? short(p.b, 16) : 'payload', x: 320, y: 40, shape: 'pill', w: 180, h: 36, tone: tones.b ?? 'muted', sub: meaning.b },
        { id: 's', label: p.s !== undefined ? (p.s ? short(p.s, 16) : '(empty)') : 'signature', x: 530, y: 40, shape: 'pill', w: 180, h: 36, tone: tones.s ?? 'muted', sub: meaning.s },
      ],
      edges: [
        { from: 'h', to: 'b', label: '.', tone: 'muted' },
        { from: 'b', to: 's', label: '.', tone: 'muted' },
      ],
    });

    // ── build ──
    const h64 = b64url(hdr);
    step(r, 'header', 'Header says which algorithm signs this token: HS256', [parts({ h: h64 }, { h: 'new' }, { h: hdr })], { alg: 'HS256' });
    const p64 = b64url(pl);
    step(r, 'body', `Payload carries claims: who (sub), expiry (exp), role`, [parts({ h: h64, b: p64 }, { h: 'visited', b: 'new' }, { h: hdr, b: pl })], { sub: user, exp });
    const input = `${h64}.${p64}`;
    step(r, 'input', 'Signing input is the two base64url parts joined by a dot', [parts({ h: h64, b: p64 }, { h: 'visited', b: 'visited' }, {}), { type: 'kv', title: 'signing input', entries: [{ k: 'length', v: `${input.length} chars` }] }], { signing_input: short(input, 20) });
    const sig = sign(SECRET, input);
    step(r, 'sign', `HMAC-SHA256(secret, signing input) = ${short(toHex(hmacSha256(SECRET, input)), 12)} (hex)`, [parts({ h: h64, b: p64, s: sig }, { h: 'visited', b: 'visited', s: 'new' }, {})], { sig: short(sig, 16) });
    step(r, 'token', 'Token issued. Anyone can read the payload, only the server can sign it', [parts({ h: h64, b: p64, s: sig }, { h: 'done', b: 'done', s: 'done' }, {})], { token_len: input.length + 1 + sig.length });

    // ── what arrives ──
    let tH = h64;
    let tB = p64;
    let tS = sig;
    const verifySecret = SECRET;
    let note = 'The client sends the token back unchanged.';
    if (scenario === 'tampered payload') {
      tB = b64url(json({ exp, role: 'admin', sub: user }));
      note = 'Attacker edits the payload to role=admin but cannot re-sign it.';
    } else if (scenario === 'wrong secret') {
      tS = sign('guess', `${tH}.${tB}`);
      note = 'Attacker signs a token with their own secret.';
    } else if (scenario === 'alg=none forged') {
      tH = b64url(json({ alg: 'none', typ: 'JWT' }));
      tB = b64url(json({ exp, role: 'admin', sub: user }));
      tS = '';
      note = 'Attacker sets alg to "none" and drops the signature.';
    }
    const arrived = (tones: { h?: Tone; b?: Tone; s?: Tone }): Panel => parts({ h: tH, b: tB, s: tS }, tones, {});
    step(r, 'split', `${note}`, [arrived({ h: 'compare', b: 'compare', s: 'compare' })], { scenario });

    let verdict = 'valid';
    const algOk = scenario !== 'alg=none forged';
    step(r, 'alg', algOk ? 'alg is HS256, the only algorithm this server accepts' : 'alg is "none": the server must reject it, never trust the header', [arrived({ h: algOk ? 'found' : 'error', b: 'compare', s: 'compare' })], { alg: algOk ? 'HS256' : 'none' });
    if (!algOk) {
      verdict = 'rejected alg';
    } else {
      const expected = sign(verifySecret, `${tH}.${tB}`);
      step(r, 'recompute', `Server recomputes the signature over header.payload: ${short(expected, 12)}`, [arrived({ h: 'visited', b: 'visited', s: 'compare' }), { type: 'kv', title: 'signatures', entries: [{ k: 'expected', v: short(expected, 20) }, { k: 'received', v: tS ? short(tS, 20) : '(empty)' }] }], { expected: short(expected, 12) });
      const same = expected === tS;
      step(r, 'compare', same ? 'Signatures match: payload is exactly what the server signed' : 'Signatures differ: reject the token before reading any claim', [arrived({ h: 'visited', b: same ? 'found' : 'error', s: same ? 'found' : 'error' })], { match: same });
      if (!same) verdict = 'invalid signature';
      else {
        const expired = exp <= now;
        step(r, 'exp', expired ? `exp ${exp} <= now ${now}: token expired` : `exp ${exp} > now ${now}: still within its lifetime`, [arrived({ h: 'visited', b: expired ? 'error' : 'found', s: 'visited' })], { exp, now });
        verdict = expired ? 'expired' : 'valid';
      }
    }
    step(r, verdict === 'valid' ? 'ok' : 'split', verdict === 'valid' ? `Accepted: request runs as ${user}, no database lookup needed` : `Rejected (${verdict}): 401 Unauthorized`, [arrived({ h: verdict === 'valid' ? 'done' : 'error', b: verdict === 'valid' ? 'done' : 'error', s: verdict === 'valid' ? 'done' : 'error' })], { verdict });
    return { frames: r.frames, result: verdict };
  },
  reference({ exp, now, scenario }) {
    if (scenario === 'alg=none forged') return 'rejected alg';
    if (scenario === 'tampered payload' || scenario === 'wrong secret') return 'invalid signature';
    return exp <= now ? 'expired' : 'valid';
  },
};

const HARNESS = `
from minidjango.auth import jwt_encode, jwt_decode, InvalidToken

def run_verify(fn, claims, sign_secret, verify_secret, now):
    token = jwt_encode(claims, sign_secret)
    try:
        return ["ok", fn(token, verify_secret, now)]
    except InvalidToken as e:
        return ["error", str(e)]

def run_auth(fn, headers, claims, sign_secret, secret, now):
    h = dict(headers)
    if claims is not None:
        h["Authorization"] = h["Authorization"].replace("{token}", jwt_encode(claims, sign_secret))
    return fn(h, secret, now)
`;

const verifyTests = [
  { args: [{ sub: 'alice', exp: 100 }, 'k', 'k', 50], expected: ['ok', { exp: 100, sub: 'alice' }], name: 'fresh token' },
  { args: [{ sub: 'alice', exp: 100 }, 'k', 'k', 100], expected: ['error', 'Token expired'], name: 'expired exactly now' },
  { args: [{ sub: 'alice', exp: 100 }, 'k', 'k', 5000], expected: ['error', 'Token expired'], name: 'long expired' },
  { args: [{ sub: 'alice', exp: 100 }, 'attacker', 'k', 50], expected: ['error', 'Bad signature'], name: 'wrong secret' },
  { args: [{ sub: 'alice' }, 'k', 'k', 50], expected: ['ok', { sub: 'alice' }], name: 'no exp claim' },
];

const unit: Unit = {
  id: 'be-jwt',
  hook: 'JWTs are everywhere and so are the mistakes: trusting the alg header, forgetting expiry, storing secrets in the payload. Explaining what is signed, what is merely encoded and why the server stays stateless is a standard backend question.',
  predict: {
    prompt: 'A JWT payload says {"role": "user"}. An attacker base64-decodes it, changes it to "admin", re-encodes it and sends the token with the ORIGINAL signature. What happens on a correct server?',
    options: ['Accepted: the signature only protects the header', 'Rejected: the recomputed signature no longer matches', 'Accepted until the token expires', 'Rejected only if the secret is longer than 32 bytes'],
    answer: 1,
    explain: 'The signature covers header.payload. Changing a single byte changes the HMAC the server recomputes, so the comparison fails and the token is rejected before any claim is trusted.',
  },
  viz,
  deeper: {
    points: [
      'A JWT is three base64url parts: header, payload, signature. The first two are only encoded, not encrypted: anyone can read them, so never put secrets in them.',
      'HS256 signs header.payload with a shared secret using HMAC-SHA256. The server verifies by recomputing and comparing in constant time.',
      'Stateless: the token carries the identity and expiry, so any server holding the secret can verify it with no session store.',
      'The price of stateless is revocation: you cannot delete a token. Keep access tokens short-lived (minutes) and pair them with a refresh token you can revoke.',
      'Pin the allowed algorithm on the server. Trusting the token\'s own alg header enables the "none" and RS256-to-HS256 confusion attacks.',
    ],
    pitfalls: ['Not checking exp (tokens live forever)', 'Accepting whatever alg the header declares', 'Storing sensitive data in the payload', 'Long-lived access tokens with no revocation plan', 'Keeping the token in localStorage where XSS can read it'],
  },
  practice: {
    language: 'python',
    fnName: 'sign_token',
    statement: 'Implement HS256 signing with hmac and hashlib. header is {"alg": "HS256", "typ": "JWT"} and the payload is JSON, both dumped with separators=(",", ":") (payload also with sort_keys=True), base64url-encoded without "=" padding. The signature is HMAC-SHA256 of "header.payload" with the secret, encoded the same way. Return "header.payload.signature".',
    signature: 'import base64, hashlib, hmac, json\n\ndef sign_token(payload, secret):',
    solution: `import base64, hashlib, hmac, json

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(@@b"="@@).decode()

def sign_token(payload, secret):
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(payload, @@separators=(",", ":"), sort_keys=True@@).encode())
    signing_input = @@f"{header}.{body}"@@
    digest = hmac.new(secret.encode(), signing_input.encode(), @@hashlib.sha256@@).digest()
    return signing_input + "." + @@b64url(digest)@@`,
    tests: [
      { args: [{ sub: 'alice', exp: 3600 }, 's3cret'], expected: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjM2MDAsInN1YiI6ImFsaWNlIn0.HKW9QnI9MwfULPMgZzUykXP2GZOI4Adx2z086m5RoXs', name: 'basic token' },
      { args: [{ sub: 'bob', admin: true, exp: 10 }, 'k'], expected: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbiI6dHJ1ZSwiZXhwIjoxMCwic3ViIjoiYm9iIn0.VtNwnw7Nf5JUF8mH6qgp-mH3wJg0yT0HYJRBx4RffRU', name: 'bool claim' },
      { args: [{}, 'x'], expected: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.CNtjEvFCY3oEKoVULG8G2-eZgrNp5SN5aTVtlGBTUzo', name: 'empty payload' },
      { args: [{ b: 1, a: 2 }, 's3cret'], expected: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhIjoyLCJiIjoxfQ.2hhrRS_EMqcxBqOnHPD5A1DkSh_etmPmRje3A-biMw8', name: 'keys are sorted' },
      { args: [{ name: 'Zoë' }, 's3cret'], expected: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiWm9cdTAwZWIifQ.3hq1sUzlMh9roYkuhqO84p1r-R1hXc4V3FlRgwacHW8', name: 'non-ASCII is escaped' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'verify_token',
    statement: 'verify_token(token, secret, now) should return the claims of a valid token. jwt_decode and InvalidToken are imported. Users report that old tokens still work after their exp time. Fix it.',
    buggy: `def verify_token(token, secret, now):
    return jwt_decode(token, secret)`,
    fixed: `def verify_token(token, secret, now):
    return jwt_decode(token, secret, now=now)`,
    harness: HARNESS,
    adapter: 'run_verify',
    tests: verifyTests,
    bugType: 'expiry never checked',
    hint: 'Look at jwt_decode\'s third parameter. What can it check if you never tell it the time?',
    explanation: 'jwt_decode only compares exp with a clock when you pass now. Without it the signature is verified but expiry is silently skipped, so a leaked token is valid forever. Always pass the current time (and inject it in tests).',
  },
  boss: {
    title: 'Bearer authentication',
    statement: 'Write authenticate(headers, secret, now). Read the Authorization header ("Bearer <token>", scheme case-insensitive). Missing header, other scheme or empty token: [401, "missing token"]. Decode with jwt_decode(token, secret, now=now); if it raises InvalidToken return [401, str(error)]. If the claims have no "sub", return [401, "invalid claims"]. Otherwise return [200, sub]. jwt_decode and InvalidToken are imported.',
    language: 'python',
    fnName: 'authenticate',
    starter: `def authenticate(headers, secret, now):
    # your code here
    pass
`,
    solution: `def authenticate(headers, secret, now):
    scheme, _, token = headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return [401, "missing token"]
    try:
        claims = jwt_decode(token, secret, now=now)
    except InvalidToken as e:
        return [401, str(e)]
    if "sub" not in claims:
        return [401, "invalid claims"]
    return [200, claims["sub"]]`,
    harness: HARNESS,
    adapter: 'run_auth',
    tests: [
      { args: [{ Authorization: 'Bearer {token}' }, { sub: 'alice', exp: 100 }, 'k', 'k', 50], expected: [200, 'alice'], name: 'valid token' },
      { args: [{}, null, 'k', 'k', 50], expected: [401, 'missing token'], name: 'no header' },
      { args: [{ Authorization: 'Basic {token}' }, { sub: 'alice', exp: 100 }, 'k', 'k', 50], expected: [401, 'missing token'], name: 'wrong scheme' },
      { args: [{ Authorization: 'Bearer {token}' }, { sub: 'alice', exp: 100 }, 'k', 'k', 100], expected: [401, 'Token expired'], name: 'expired' },
      { args: [{ Authorization: 'Bearer {token}' }, { sub: 'alice', exp: 100 }, 'evil', 'k', 50], expected: [401, 'Bad signature'], name: 'forged' },
      { args: [{ Authorization: 'Bearer abc.def' }, null, 'k', 'k', 50], expected: [401, 'Malformed token'], name: 'malformed' },
      { args: [{ Authorization: 'bearer {token}' }, { sub: 'alice', exp: 100 }, 'k', 'k', 50], expected: [200, 'alice'], name: 'scheme is case-insensitive' },
      { args: [{ Authorization: 'Bearer {token}' }, { exp: 100 }, 'k', 'k', 50], expected: [401, 'invalid claims'], name: 'no subject' },
    ],
    hints: ['str.partition(" ") splits the header into scheme and token in one go.', 'jwt_decode raises InvalidToken for bad signature, malformed and expired tokens; its message is what you return.'],
    combines: ['be-sessions', 'be-password-hashing'],
  },
  quiz: [
    {
      prompt: 'Why can a stateless JWT not be "logged out" instantly?',
      options: ['The signature cannot be changed', 'The server keeps no record of it, so there is nothing to delete', 'Browsers cache tokens', 'HS256 forbids revocation'],
      answer: 1,
      explain: 'Verification needs only the secret and the token. To revoke early you must add state back (a denylist) or keep access tokens short-lived.',
    },
  ],
  simulationNote: 'The signature in the visualizer is a real HMAC-SHA256. Python tasks run against minidjango.auth.jwt_encode / jwt_decode, a small HS256-only teaching implementation.',
};

export default unit;
