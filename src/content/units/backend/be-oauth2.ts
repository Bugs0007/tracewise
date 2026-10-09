import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq, b64url, sha256, short, step, toHex } from '@/content/lib/backend-db-auth';

const code = `
def start_login(session):
    session["state"] = secrets.token_urlsafe(16)                       #@state
    session["verifier"] = secrets.token_urlsafe(32)                    #@verifier
    challenge = pkce_challenge(session["verifier"])                    #@challenge
    return authorize_url(CLIENT_ID, REDIRECT_URI, session["state"], challenge)   #@url

def pkce_challenge(verifier):
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()     #@s256

def on_callback(params, session):
    if params.get("state") != session.get("state"):                   #@check
        raise PermissionError("state mismatch")
    return exchange(params["code"], session["verifier"])               #@exchange

def token_endpoint(code, verifier):
    grant = CODES.pop(code, None)                                      #@pop
    if grant is None or pkce_challenge(verifier) != grant["challenge"]:   #@verify
        return {"error": "invalid_grant"}                              #@reject
    return {"access_token": mint_token(grant["user"])}                 #@issue

def api_me(request):
    claims = verify_access_token(request.headers["Authorization"])     #@resource
    return JsonResponse({"user": claims["sub"]})
`;

const SCENARIOS = ['happy path (PKCE)', 'state mismatch', 'wrong code_verifier', 'code reused'];

interface In {
  scenario: string;
}

const pkce = (v: string) => b64url(sha256(v));

const viz: VizDef<In> = {
  id: 'be-oauth2',
  title: 'OAuth2 authorization code + PKCE',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Scenario', kind: 'select', options: SCENARIOS, default: 'happy path (PKCE)' }],
  presets: SCENARIOS.map((s) => ({ label: s, input: { scenario: s } })),
  run({ scenario }) {
    const r = new Recorder(code);
    const seq = new Seq(['User', 'Client app', 'Auth server', 'Resource server'], 'Authorization code flow');
    const state = 'st_' + toHex(sha256('state-seed')).slice(0, 8);
    const verifier = b64url(sha256('verifier-seed'));
    const challenge = pkce(verifier);
    const code1 = 'code_' + toHex(sha256('code-seed')).slice(0, 6);
    const codes = new Map<string, string>();
    const responses: string[] = [];
    let stateOk = true;
    let token = '';

    const client = (extra: { k: string; v: string; tone?: 'error' | 'found' }[] = []): KVPanel => ({
      type: 'kv',
      title: 'Client app session',
      entries: [{ k: 'state', v: state }, { k: 'code_verifier', v: short(verifier, 16) }, { k: 'code_challenge', v: short(challenge, 16) }, ...extra],
    });
    const server = (): KVPanel => ({
      type: 'kv',
      title: 'Auth server: unused codes',
      entries: codes.size ? [...codes.entries()].map(([c, ch]) => ({ k: c, v: 'challenge ' + short(ch, 10), tone: 'active' as const })) : [{ k: '(none)', v: '-' }],
    });
    const panels = (extra?: Parameters<typeof client>[0]): Panel[] => [seq.panel(), client(extra), server()];

    step(r, 'state', `Client creates a random state (${state}) to tie the callback to this login`, [seq.panel(), { ...client(), entries: [{ k: 'state', v: state }] }], { state });
    step(r, 'verifier', 'Client creates a secret code_verifier that never leaves the app yet', [seq.panel(), { ...client(), entries: [{ k: 'state', v: state }, { k: 'code_verifier', v: short(verifier, 16) }] }], { verifier: short(verifier, 12) });
    step(r, 'challenge', `code_challenge = base64url(SHA-256(verifier)) = ${short(challenge, 10)}`, panels(), { challenge: short(challenge, 12) });

    seq.send('Client app', 'User', '302 /authorize?state, code_challenge');
    seq.send('User', 'Auth server', 'GET /authorize (S256 challenge)');
    step(r, 'url', 'User\'s browser is sent to the auth server with state and the challenge', panels(), { state });
    seq.send('Auth server', 'User', 'login + consent screen', undefined, true);
    seq.send('User', 'Auth server', 'sign in, approve scopes');
    codes.set(code1, challenge);
    seq.send('Auth server', 'User', `302 /callback?code=${short(code1, 9)}&state`, 'done', true);
    step(r, 'url', `Auth server remembers ${code1} with the challenge and redirects back`, panels(), { code: code1 });

    const sentState = scenario === 'state mismatch' ? 'st_forged' : state;
    seq.send('User', 'Client app', `GET /callback?code&state=${short(sentState, 9)}`, scenario === 'state mismatch' ? 'error' : undefined);
    stateOk = sentState === state;
    if (!stateOk) {
      seq.send('Client app', 'User', '403 state mismatch', 'error', true);
      step(r, 'check', `state ${sentState} ≠ ${state}: callback not started by us, abort`, panels([{ k: 'callback state', v: sentState, tone: 'error' }]), { stateOk });
      step(r, 'check', 'No code is exchanged: a forged callback cannot log the victim into the attacker\'s account', panels(), { stateOk });
      return { frames: r.frames, result: { stateOk, tokenResponses: responses } };
    }
    step(r, 'check', 'state matches the one stored in the session: callback is ours', panels([{ k: 'callback state', v: sentState, tone: 'found' }]), { stateOk });

    const exchange = (verifierSent: string, label: string) => {
      seq.send('Client app', 'Auth server', `POST /token code + verifier${label}`);
      step(r, 'exchange', `Client posts the code with its verifier${label}`, panels(), { code: code1 });
      const grant = codes.get(code1);
      codes.delete(code1);
      step(r, 'pop', grant ? `Server takes ${code1} out of its table: codes are single use` : `${code1} is not in the table any more`, panels(), { code: code1 });
      const ok = grant !== undefined && pkce(verifierSent) === grant;
      if (!ok) {
        seq.send('Auth server', 'Client app', '400 invalid_grant', 'error', true);
        responses.push('invalid_grant');
        step(r, grant ? 'verify' : 'reject', grant ? 'SHA-256(verifier) ≠ stored challenge: the sender never saw the verifier' : 'Unknown or used code: invalid_grant', panels(), { ok });
        return false;
      }
      step(r, 'verify', 'SHA-256(verifier) matches the stored challenge', panels(), { ok });
      token = 'at_' + toHex(sha256('token-seed')).slice(0, 8);
      seq.send('Auth server', 'Client app', `200 access_token=${token}`, 'done', true);
      responses.push('issued');
      step(r, 'issue', `Access token ${token} issued`, panels(), { token });
      return true;
    };

    const first = exchange(scenario === 'wrong code_verifier' ? b64url(sha256('attacker-guess')) : verifier, scenario === 'wrong code_verifier' ? ' (attacker\'s)' : '');
    if (first) {
      seq.send('Client app', 'Resource server', `GET /api/me Bearer ${token}`);
      seq.send('Resource server', 'Client app', '200 {"user": "alice"}', 'done', true);
      step(r, 'resource', 'API validates the bearer token and returns data', panels(), { token });
    }
    if (scenario === 'code reused') exchange(verifier, ' (replay)');
    step(r, 'issue', `Token responses: ${responses.join(', ') || 'none'}`, panels(), { responses: responses.join(',') });
    return { frames: r.frames, result: { stateOk, tokenResponses: responses } };
  },
  reference({ scenario }) {
    switch (scenario) {
      case 'state mismatch':
        return { stateOk: false, tokenResponses: [] };
      case 'wrong code_verifier':
        return { stateOk: true, tokenResponses: ['invalid_grant'] };
      case 'code reused':
        return { stateOk: true, tokenResponses: ['issued', 'invalid_grant'] };
      default:
        return { stateOk: true, tokenResponses: ['issued'] };
    }
  },
};

const unit: Unit = {
  id: 'be-oauth2',
  hook: '"Sign in with Google" is OAuth2. Interviewers use it to test whether you know why a code is exchanged instead of returning a token directly, and what state and PKCE each defend against.',
  predict: {
    prompt: 'In the authorization code flow the auth server redirects the browser back with a short-lived code instead of the access token itself. Why?',
    options: ['Codes are shorter, so the redirect URL fits', 'The token would sit in the URL and browser history; the code is traded for it over a direct back-channel', 'The user must approve each API call separately', 'Codes never expire'],
    answer: 1,
    explain: 'Redirect URLs leak into logs, history and referrers. The code is useless alone: the client exchanges it directly with the auth server (with its secret or PKCE verifier) to get the token.',
  },
  viz,
  deeper: {
    points: [
      'Roles: the user (resource owner), the client app, the authorization server (logs the user in, issues tokens) and the resource server (the API that accepts access tokens).',
      'state is a random value stored before the redirect and compared on return. It stops attackers from feeding your app a callback they started (login CSRF).',
      'PKCE: the client sends SHA-256(code_verifier) at the start and the verifier itself at exchange. A stolen code is useless without the verifier, which matters for mobile and single-page apps that cannot keep a client secret.',
      'Authorization codes are single use and short-lived. A second exchange attempt returns invalid_grant.',
      'OAuth2 is about authorization (what the app may do). Authentication ("who is this user") is added by OpenID Connect, which layers an ID token on top.',
    ],
    pitfalls: ['Skipping or not verifying the state parameter', 'Using the implicit flow (token in the URL) for new apps', 'Accepting any redirect_uri instead of an exact registered one', 'Using the plain PKCE method when S256 is available'],
  },
  practice: {
    language: 'python',
    fnName: 'pkce_challenge',
    statement: 'Implement the PKCE S256 transform: code_challenge = base64url(SHA-256(code_verifier)), URL-safe alphabet, without "=" padding.',
    signature: 'import base64, hashlib\n\ndef pkce_challenge(verifier):',
    solution: `import base64, hashlib

def pkce_challenge(verifier):
    digest = hashlib.@@sha256@@(verifier.encode()).digest()
    encoded = base64.@@urlsafe_b64encode@@(digest)
    return encoded.@@rstrip(b"=")@@.decode()`,
    tests: [
      { args: ['dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'], expected: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', name: 'RFC 7636 example' },
      { args: ['abc'], expected: 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0' },
      { args: ['a'.repeat(43)], expected: 'ZtNPunH49FD35FWYhT5Tv8I7vRKQJ8uxMaL0_9eHjNA', name: '43 characters' },
      { args: ['~-._Zz09'.repeat(6)], expected: 'H_lrr92LIHjlzbGC-yOUdFUaiuoiFwSgcgPrPGypq3E', name: 'unreserved characters' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'check_state',
    statement: 'check_state(params, session) returns {"ok": True} when the callback\'s state equals the one saved in the session, otherwise {"ok": False, "error": "state mismatch"}. An attacker who simply leaves the state parameter out of the callback gets in. Fix it.',
    buggy: `def check_state(params, session):
    expected = session.get("state")
    if "state" in params and params["state"] != expected:
        return {"ok": False, "error": "state mismatch"}
    return {"ok": True}`,
    fixed: `def check_state(params, session):
    expected = session.get("state")
    if not expected or params.get("state") != expected:
        return {"ok": False, "error": "state mismatch"}
    return {"ok": True}`,
    tests: [
      { args: [{ state: 'abc', code: 'x' }, { state: 'abc' }], expected: { ok: true }, name: 'matching state' },
      { args: [{ state: 'evil', code: 'x' }, { state: 'abc' }], expected: { ok: false, error: 'state mismatch' }, name: 'different state' },
      { args: [{ code: 'x' }, { state: 'abc' }], expected: { ok: false, error: 'state mismatch' }, name: 'state parameter missing' },
      { args: [{ code: 'x' }, {}], expected: { ok: false, error: 'state mismatch' }, name: 'no state stored at all' },
    ],
    bugType: 'missing state check',
    hint: 'What does the check do when the state parameter is absent from the callback?',
    explanation: 'The buggy version only compares when the parameter is present, so omitting it skips the defence entirely. The check must be mandatory: a callback without a state that equals the stored one is rejected (and an empty stored state must never match).',
  },
  boss: {
    title: 'Build the authorize URL',
    statement: 'Write build_authorize_url(client_id, redirect_uri, scope, state, verifier) returning "https://auth.example.com/authorize?" plus a urlencode()d query with these parameters in this exact order: response_type=code, client_id, redirect_uri, scope, state, code_challenge (S256 of the verifier), code_challenge_method=S256. Remember to import what you need.',
    language: 'python',
    fnName: 'build_authorize_url',
    starter: `def build_authorize_url(client_id, redirect_uri, scope, state, verifier):
    # your code here
    pass
`,
    solution: `import base64, hashlib
from urllib.parse import urlencode

def build_authorize_url(client_id, redirect_uri, scope, state, verifier):
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    query = urlencode([
        ("response_type", "code"),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("scope", scope),
        ("state", state),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
    ])
    return "https://auth.example.com/authorize?" + query`,
    tests: [
      { args: ['app123', 'https://app.example/callback', 'read', 'xyz', 'abc'], expected: 'https://auth.example.com/authorize?response_type=code&client_id=app123&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&scope=read&state=xyz&code_challenge=ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0&code_challenge_method=S256', name: 'basic' },
      { args: ['web-1', 'https://app.example/cb?next=/home', 'read write', 'a b&c', 'a'.repeat(43)], expected: 'https://auth.example.com/authorize?response_type=code&client_id=web-1&redirect_uri=https%3A%2F%2Fapp.example%2Fcb%3Fnext%3D%2Fhome&scope=read+write&state=a+b%26c&code_challenge=ZtNPunH49FD35FWYhT5Tv8I7vRKQJ8uxMaL0_9eHjNA&code_challenge_method=S256', name: 'values are escaped' },
      { args: ['c', 'http://localhost:3000/auth/callback', 'openid profile email', 's1', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'], expected: 'https://auth.example.com/authorize?response_type=code&client_id=c&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&scope=openid+profile+email&state=s1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256', name: 'RFC verifier' },
      { args: ['x', 'https://x.example/cb', 'a', 'S', '~-._Zz09'.repeat(6)], expected: 'https://auth.example.com/authorize?response_type=code&client_id=x&redirect_uri=https%3A%2F%2Fx.example%2Fcb&scope=a&state=S&code_challenge=H_lrr92LIHjlzbGC-yOUdFUaiuoiFwSgcgPrPGypq3E&code_challenge_method=S256', name: 'long verifier' },
    ],
    hints: ['Compute the challenge first (SHA-256, base64url, no padding), then let urllib.parse.urlencode escape the values.', 'Pass urlencode a list of (key, value) pairs so the parameter order is exactly the one requested.'],
    combines: ['be-jwt', 'be-csrf'],
  },
  quiz: [
    {
      prompt: 'An attacker intercepts the authorization code from the redirect. With PKCE, what stops them from exchanging it?',
      options: ['The code is encrypted', 'They do not have the code_verifier that hashes to the stored challenge', 'The state parameter', 'Codes only work from the same IP'],
      answer: 1,
      explain: 'The auth server only issues a token when SHA-256(verifier) equals the challenge sent at the start, and only the legitimate client knows the verifier.',
    },
  ],
};

export default unit;
