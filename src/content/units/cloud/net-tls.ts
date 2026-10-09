import { Recorder } from '@/engine/recorder';
import type { GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq, kv, step } from '@/content/lib/cloud-devops';

const code = `
def handshake(host):
    client_hello = {"versions": ["1.3"], "key_share": client_pub, "sni": host}   #@hello
    server_hello = {"cipher": "TLS_AES_128_GCM_SHA256", "key_share": server_pub} #@server_hello
    keys = derive(client_priv, server_pub)           # same on both sides         #@keys
    send_encrypted(certificate_chain)                                           #@cert
    send_encrypted(sign(transcript, server_key))     # CertificateVerify        #@verify
    send_encrypted(finished(keys, transcript))                                  #@finished

def host_ok(pattern, host):
    if pattern.startswith("*."):
        first, _, rest = host.partition(".")
        return bool(first) and rest == pattern[2:]
    return pattern == host

def validate(chain, trusted, host, now):
    for i, cert in enumerate(chain):                         #@loop
        if i + 1 < len(chain) and cert["issuer"] != chain[i + 1]["subject"]:
            return "BROKEN_CHAIN"                            #@link
        if not cert["start"] <= now < cert["end"]:
            return "EXPIRED"                                 #@expired
    if chain[-1]["subject"] not in trusted:
        return "UNTRUSTED_ROOT"                              #@root
    if not any(host_ok(p, host) for p in chain[0]["san"]):
        return "HOSTNAME_MISMATCH"                           #@host
    return "OK"                                              #@ok
`;

interface In {
  host: string;
  chain: string[];
  trusted: string[];
  now: number;
  scenario: string;
}

const SCENARIOS = ['as written', 'intermediate certificate expired', 'certificate is for another hostname', 'root is not trusted'];

interface Cert {
  subject: string;
  issuer: string;
  start: number;
  end: number;
  san: string[];
}

function parseCert(s: string): Cert {
  const m = s.trim().match(/^([\w.*-]+)>([\w.*-]+)\s+(\d+)-(\d+)\s+(\S+)$/);
  if (!m) throw new Error(`Certificate "${s}" should look like: leaf>InterCA 100-400 *.example.com|example.com  (subject>issuer start-end san, or - for none)`);
  return { subject: m[1], issuer: m[2], start: Number(m[3]), end: Number(m[4]), san: m[5] === '-' ? [] : m[5].split('|') };
}

function prep(i: In) {
  const chain = i.chain.map(parseCert);
  if (chain.length < 2 || chain.length > 4) throw new Error('Give a chain of 2 to 4 certificates, leaf first and root last');
  const host = i.host.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host)) throw new Error('Hostname should look like www.example.com');
  const now = Math.round(i.now);
  if (!(now >= 0)) throw new Error('Time must be 0 or more');
  let trusted = i.trusted.slice();
  if (i.scenario === SCENARIOS[1] && chain.length > 2) chain[1].end = Math.max(0, now - 1);
  else if (i.scenario === SCENARIOS[1]) chain[0].end = Math.max(0, now - 1);
  if (i.scenario === SCENARIOS[2]) chain[0].san = ['shop.other.org'];
  if (i.scenario === SCENARIOS[3]) trusted = [];
  return { chain, host, now, trusted };
}

function hostOk(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const dot = host.indexOf('.');
    return dot > 0 && host.slice(dot + 1) === p.slice(2);
  }
  return p === host;
}

function validateRef(chain: Cert[], trusted: string[], host: string, now: number): string {
  // Independent formulation: build the checks as ordered predicates.
  const links = chain.slice(0, -1).every((c, k) => c.issuer === chain[k + 1].subject);
  if (!links) return 'BROKEN_CHAIN';
  if (!chain.every((c) => c.start <= now && now < c.end)) return 'EXPIRED';
  if (!trusted.includes(chain[chain.length - 1].subject)) return 'UNTRUSTED_ROOT';
  if (!chain[0].san.some((p) => hostOk(p, host))) return 'HOSTNAME_MISMATCH';
  return 'OK';
}

const viz: VizDef<In> = {
  id: 'net-tls',
  title: 'TLS 1.3 handshake and certificate validation',
  code,
  language: 'python',
  inputs: [
    { key: 'host', label: 'Hostname the client wants', kind: 'string', default: 'www.example.com', maxItems: 40 },
    { key: 'chain', label: 'Chain sent by the server (subject>issuer start-end san)', kind: 'strings', default: ['www.example.com>InterCA 100-400 *.example.com|example.com', 'InterCA>RootCA 50-900 -', 'RootCA>RootCA 0-1000 -'], maxItems: 4, help: 'Leaf first, root last. Times are plain numbers (days); a certificate is valid when start <= now < end.' },
    { key: 'trusted', label: "Client's trusted roots", kind: 'strings', default: ['RootCA'], maxItems: 3 },
    { key: 'now', label: 'Current time (injected)', kind: 'number', default: 200 },
    { key: 'scenario', label: 'Failure injection', kind: 'select', default: SCENARIOS[0], options: SCENARIOS },
  ],
  presets: [
    { label: 'Valid chain', input: {} },
    { label: 'Intermediate expired', input: { scenario: SCENARIOS[1] } },
    { label: 'Hostname mismatch', input: { scenario: SCENARIOS[2] } },
    { label: 'Root not in the trust store', input: { scenario: SCENARIOS[3] } },
    { label: 'Wildcard does not cover the apex', input: { host: 'example.com', chain: ['www.example.com>InterCA 100-400 *.example.com', 'InterCA>RootCA 50-900 -', 'RootCA>RootCA 0-1000 -'] } },
    { label: 'Certificate not yet valid', input: { now: 80, chain: ['www.example.com>InterCA 100-400 *.example.com', 'InterCA>RootCA 50-900 -', 'RootCA>RootCA 0-1000 -'] } },
  ],
  run(input) {
    const { chain, host, now, trusted } = prep(input);
    const r = new Recorder(code);
    const seq = new Seq(['Client', 'Server'], 'TLS 1.3 handshake (one round trip)');
    const msg = (from: string, to: string, label: string, tone: Tone) => {
      r.op();
      seq.send(from, to, label, tone);
    };
    const hs = (at: string, caption: string, state: Record<string, string>) => step(r, at, caption, [seq.panel(), kv('State', state)], { host });
    hs('hello', `Client wants ${host}. Nothing is encrypted yet`, { client: 'idle', server: 'idle' });
    msg('Client', 'Server', `ClientHello (key_share, SNI ${host})`, 'active');
    hs('hello', 'ClientHello carries the ECDHE public value up front, so the server can answer in one trip', { client: 'sent hello', encryption: 'none' });
    msg('Server', 'Client', 'ServerHello (key_share)', 'active');
    hs('server_hello', 'ServerHello picks the cipher and sends its ECDHE public value', { client: 'got hello', encryption: 'none yet' });
    hs('keys', 'Both sides combine the key shares: a shared secret nobody on the wire can compute', { client: 'keys derived', server: 'keys derived', encryption: 'handshake keys' });
    msg('Server', 'Client', '{EncryptedExtensions}', 'new');
    msg('Server', 'Client', '{Certificate} chain', 'new');
    hs('cert', 'Certificate chain sent, already encrypted. Braces mean encrypted', { encryption: 'handshake keys' });
    msg('Server', 'Client', '{CertificateVerify} signature', 'new');
    hs('verify', 'The server signs the transcript with its private key: proof it owns the certificate', { proof: 'signature over transcript' });
    msg('Server', 'Client', '{Finished}', 'new');
    hs('finished', 'Finished authenticates the whole handshake with the new keys', { server: 'done' });

    // certificate validation
    const chainPanel = (tones: Record<string, Tone>, edgeTones: Record<number, Tone> = {}): GraphPanel => ({
      type: 'graph',
      title: `Chain validated at t=${now}`,
      width: 580,
      height: 90,
      nodes: chain.map((c, k) => ({ id: `c${k}`, label: c.subject.length > 18 ? c.subject.slice(0, 17) + '…' : c.subject, sub: `valid ${c.start}-${c.end}`, x: 70 + k * (440 / Math.max(1, chain.length - 1)), y: 45, w: 130, tone: tones[`c${k}`] ?? 'default', badge: k === 0 ? `SAN: ${c.san.join(', ') || '-'}` : k === chain.length - 1 ? (trusted.includes(c.subject) ? 'trusted root' : 'not trusted') : 'intermediate' })),
      edges: chain.slice(0, -1).map((_c, k) => ({ from: `c${k}`, to: `c${k + 1}`, label: 'signed by', directed: true, tone: edgeTones[k] })),
    });
    const vp = (tones: Record<string, Tone>, edgeTones: Record<number, Tone> = {}): Panel[] => [seq.panel(), chainPanel(tones, edgeTones), kv('Validation', { host, now, trusted: trusted.join(', ') || '(none)' })];
    const tones: Record<string, Tone> = {};
    const eTones: Record<number, Tone> = {};
    step(r, 'loop', `Client now validates the ${chain.length} certificates against its trust store`, vp({ c0: 'compare' }), { now });
    let status = 'OK';
    for (let k = 0; k < chain.length && status === 'OK'; k++) {
      const c = chain[k];
      r.op();
      tones[`c${k}`] = 'compare';
      if (k + 1 < chain.length && c.issuer !== chain[k + 1].subject) {
        tones[`c${k}`] = 'error';
        eTones[k] = 'error';
        status = 'BROKEN_CHAIN';
        step(r, 'link', `${c.subject} says it was issued by ${c.issuer}, but the next certificate is ${chain[k + 1].subject}`, vp({ ...tones }, { ...eTones }), { status });
        break;
      }
      if (!(c.start <= now && now < c.end)) {
        tones[`c${k}`] = 'error';
        status = 'EXPIRED';
        step(r, 'expired', now < c.start ? `${c.subject} is not valid until ${c.start} (now ${now})` : `${c.subject} expired at ${c.end} (now ${now}). One bad link breaks the chain`, vp({ ...tones }, { ...eTones }), { status });
        break;
      }
      tones[`c${k}`] = 'found';
      if (k + 1 < chain.length) eTones[k] = 'found';
      step(r, 'loop', `${c.subject}: valid at t=${now}${k + 1 < chain.length ? ` and issued by ${c.issuer}` : ''}`, vp({ ...tones }, { ...eTones }), { cert: k + 1 });
    }
    if (status === 'OK') {
      const root = chain[chain.length - 1];
      if (!trusted.includes(root.subject)) {
        tones[`c${chain.length - 1}`] = 'error';
        status = 'UNTRUSTED_ROOT';
        step(r, 'root', `The chain ends at ${root.subject}, which is not in the client's trust store`, vp({ ...tones }, { ...eTones }), { status });
      } else {
        step(r, 'root', `${root.subject} is a trusted root: the signatures chain up to something the client already trusts`, vp({ ...tones, [`c${chain.length - 1}`]: 'done' }, { ...eTones }), { trusted: true });
        const hit = chain[0].san.find((p) => hostOk(p, host));
        if (!hit) {
          tones.c0 = 'error';
          status = 'HOSTNAME_MISMATCH';
          step(r, 'host', `${host} matches none of the leaf's names [${chain[0].san.join(', ')}]`, vp({ ...tones }, { ...eTones }), { status });
        } else step(r, 'host', `${host} matches the certificate name ${hit}`, vp({ ...tones }, { ...eTones }), { san: hit });
      }
    }
    if (status === 'OK') {
      msg('Client', 'Server', '{Finished}', 'found');
      msg('Client', 'Server', '{HTTP request}', 'found');
      step(r, 'ok', 'Certificate accepted. Client Finished sent: application data is encrypted both ways', vp({ ...tones }, { ...eTones }), { status });
    } else {
      msg('Client', 'Server', `alert: ${status.toLowerCase().replace(/_/g, ' ')}`, 'error');
      step(r, 'ok', `Handshake aborted: ${status}. The browser shows a certificate error`, vp({ ...tones }, { ...eTones }), { status });
    }
    return { frames: r.frames, result: status };
  },
  reference(input) {
    const { chain, host, now, trusted } = prep(input);
    return validateRef(chain, trusted, host, now);
  },
};

const cert = (subject: string, issuer: string, start: number, end: number, san: string[]) => ({ subject, issuer, start, end, san });
const GOOD = [cert('www.example.com', 'InterCA', 100, 400, ['*.example.com', 'example.com']), cert('InterCA', 'RootCA', 50, 900, []), cert('RootCA', 'RootCA', 0, 1000, [])];

const unit: Unit = {
  id: 'net-tls',
  hook: 'TLS is how every secure connection starts. Interviewers ask what the handshake agrees on (keys, not just encryption), how a certificate chain proves identity, and what the many "certificate" errors actually mean.',
  predict: {
    prompt: 'A server sends a leaf certificate that is valid, signed by an intermediate whose own validity period ended last week, chained to a trusted root. What does the client do?',
    options: ['Accepts: the leaf and the root are fine', 'Rejects: every certificate in the chain must be valid at the current time', 'Accepts but warns', 'Fetches a new intermediate from the root'],
    answer: 1,
    explain: 'Validation covers the whole path. An expired intermediate invalidates everything it signed, which is why renewing only the leaf certificate does not fix an outage caused by an expired intermediate.',
  },
  viz,
  deeper: {
    points: [
      'TLS 1.3 needs **one round trip**: ClientHello carries a key share, ServerHello answers with its own, and from then on everything (including the certificate) is encrypted with keys both sides computed via **(EC)DHE**, giving forward secrecy.',
      'A **certificate** binds a name to a public key and is signed by an **issuer**. The server sends a **chain** (leaf, intermediates); the client must reach a **root** already in its trust store.',
      'Validation checks: each signature links to the next issuer, every certificate is within its validity period, the root is trusted, the revocation status is acceptable and the **hostname** matches a Subject Alternative Name. Wildcards cover exactly one label.',
      '**CertificateVerify** proves the server holds the private key; **Finished** authenticates the entire transcript so a downgrade or tampering is detected.',
      '**SNI** tells a shared IP which certificate to present. Session resumption and 0-RTT trade a little security for speed; HSTS and certificate pinning guard against downgrade and rogue CAs.',
    ],
    pitfalls: ['Renewing the leaf but serving a stale intermediate', 'Comparing the hostname with a substring or regex instead of the SAN rules', 'Skipping validation in tests with `verify=False` and shipping it'],
  },
  practice: {
    language: 'python',
    fnName: 'host_matches',
    statement: 'Return True if a certificate name `pattern` covers `host`. Comparison is case-insensitive. A pattern starting with "*." matches exactly one non-empty leftmost label (`*.example.com` matches `www.example.com`, not `example.com` or `a.b.example.com`). Other patterns must be equal.',
    signature: 'def host_matches(pattern, host):',
    solution: `def host_matches(pattern, host):
    pattern = pattern@@.lower()@@
    host = host.lower()
    if pattern.startswith("*."):
        first, _, rest = host.@@partition(".")@@
        return bool(first) and rest == @@pattern[2:]@@
    return pattern == host`,
    tests: [
      { args: ['*.example.com', 'www.example.com'], expected: true, name: 'wildcard covers one label' },
      { args: ['*.example.com', 'example.com'], expected: false, name: 'wildcard does not cover the apex' },
      { args: ['*.example.com', 'a.b.example.com'], expected: false, name: 'only one label' },
      { args: ['www.example.com', 'WWW.Example.COM'], expected: true, name: 'case-insensitive' },
      { args: ['*.example.com', '.example.com'], expected: false, name: 'empty label' },
      { args: ['example.com', 'www.example.com'], expected: false, name: 'exact names must be equal' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'times_ok',
    statement: 'A site broke when its intermediate certificate expired, yet our checker said the chain was fine. Fix `times_ok`, which returns "OK", "EXPIRED" or "NOT_YET_VALID" for a list of `[start, end]` validity windows at time `now` (valid when start <= now < end).',
    buggy: `def times_ok(chain, now):
    start, end = chain[0]
    if now < start:
        return "NOT_YET_VALID"
    if now >= end:
        return "EXPIRED"
    return "OK"`,
    fixed: `def times_ok(chain, now):
    for start, end in chain:
        if now < start:
            return "NOT_YET_VALID"
        if now >= end:
            return "EXPIRED"
    return "OK"`,
    tests: [
      { args: [[[100, 400], [50, 150], [0, 1000]], 200], expected: 'EXPIRED', name: 'intermediate expired' },
      { args: [[[100, 400], [50, 900], [0, 1000]], 200], expected: 'OK', name: 'all valid' },
      { args: [[[100, 400], [250, 900], [0, 1000]], 200], expected: 'NOT_YET_VALID', name: 'intermediate not valid yet' },
      { args: [[[100, 400], [50, 900], [0, 200]], 200], expected: 'EXPIRED', name: 'root expires exactly now' },
      { args: [[[100, 400]], 400], expected: 'EXPIRED', name: 'end is exclusive' },
    ],
    bugType: 'only the leaf is checked',
    hint: 'How many certificates does the function look at?',
    explanation: 'Only the leaf validity was checked. Every certificate on the path to the root must be valid at the current time, so loop over the whole chain.',
  },
  boss: {
    title: 'Certificate chain validator',
    statement: 'Write `validate_chain(chain, trusted, host, now)`. `chain` is a list of dicts `{subject, issuer, start, end, san}` (leaf first, root last), `trusted` a list of root subject names, `now` and `host` are injected. Check in this order and return the first failure: "BROKEN_CHAIN" if any certificate\'s issuer is not the next certificate\'s subject; "EXPIRED" if any certificate is not valid (`start <= now < end`), including intermediates and the root; "UNTRUSTED_ROOT" if the last subject is not in `trusted`; "HOSTNAME_MISMATCH" unless one of the leaf\'s `san` patterns covers `host` (case-insensitive; `*.` matches exactly one non-empty label). Otherwise "OK".',
    language: 'python',
    fnName: 'validate_chain',
    starter: `def validate_chain(chain, trusted, host, now):
    pass
`,
    solution: `def validate_chain(chain, trusted, host, now):
    def host_ok(pattern, name):
        pattern, name = pattern.lower(), name.lower()
        if pattern.startswith("*."):
            first, _, rest = name.partition(".")
            return bool(first) and rest == pattern[2:]
        return pattern == name

    for i in range(len(chain) - 1):
        if chain[i]["issuer"] != chain[i + 1]["subject"]:
            return "BROKEN_CHAIN"
    for cert in chain:
        if not cert["start"] <= now < cert["end"]:
            return "EXPIRED"
    if chain[-1]["subject"] not in trusted:
        return "UNTRUSTED_ROOT"
    if not any(host_ok(p, host) for p in chain[0]["san"]):
        return "HOSTNAME_MISMATCH"
    return "OK"`,
    tests: [
      { args: [GOOD, ['RootCA'], 'www.example.com', 200], expected: 'OK', name: 'valid chain' },
      { args: [[GOOD[0], { ...GOOD[1], end: 150 }, GOOD[2]], ['RootCA'], 'www.example.com', 200], expected: 'EXPIRED', name: 'expired intermediate' },
      { args: [GOOD, ['RootCA'], 'www.example.com', 80], expected: 'EXPIRED', name: 'leaf not valid yet' },
      { args: [GOOD, ['OtherCA'], 'www.example.com', 200], expected: 'UNTRUSTED_ROOT', name: 'root not trusted' },
      { args: [GOOD, ['RootCA'], 'example.com', 200], expected: 'OK', name: 'apex listed explicitly in the SAN' },
      { args: [[{ ...GOOD[0], san: ['*.example.com'] }, GOOD[1], GOOD[2]], ['RootCA'], 'example.com', 200], expected: 'HOSTNAME_MISMATCH', name: 'wildcard does not cover the apex' },
      { args: [[GOOD[0], { ...GOOD[1], subject: 'OtherCA' }, GOOD[2]], ['RootCA'], 'www.example.com', 200], expected: 'BROKEN_CHAIN', name: 'issuer does not match the next subject' },
      { args: [[{ ...GOOD[0], end: 100 }, GOOD[1], GOOD[2]], ['RootCA'], 'wrong.org', 100], expected: 'EXPIRED', name: 'time failure reported before hostname' },
    ],
    hints: ['Do the checks in the given order, each as its own loop or condition. The chain links come first: compare `chain[i]["issuer"]` with `chain[i + 1]["subject"]`.', 'The validity loop must cover every certificate, not just the leaf, using `start <= now < end`. Write the wildcard rule as a small helper (`partition(".")`) and use `any(...)` over the leaf\'s SAN list.'],
    combines: ['net-tcp', 'aws-cloudfront'],
  },
  quiz: [
    {
      prompt: 'What does the server prove with the CertificateVerify message?',
      options: ['That its certificate is not expired', 'That it holds the private key matching the certificate', 'That the client key is valid', 'That the chain reaches a trusted root'],
      answer: 1,
      explain: 'Anyone can present a public certificate. Signing the handshake transcript with the private key shows the server really owns it.',
    },
  ],
  simulationNote: 'A simplified model of TLS 1.3: key exchange is illustrated rather than computed, signatures are assumed valid, and revocation and SCTs are left out.',
};

export default unit;
