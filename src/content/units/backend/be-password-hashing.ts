import { Recorder } from '@/engine/recorder';
import type { GridPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { pbkdf2Sha256, sha256, short, step, toHex } from '@/content/lib/backend-db-auth';

const code = `
def hash_plain(password):
    return hashlib.sha256(password.encode()).hexdigest()                    #@plain

def hash_salted(password, salt):
    return hashlib.sha256((salt + password).encode()).hexdigest()           #@salted

def hash_pbkdf2(password, salt, iterations):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()   #@pbkdf2

def check_password(password, salt, iterations, stored_hash):
    candidate = hash_pbkdf2(password, salt, iterations)                     #@recompute
    return hmac.compare_digest(candidate, stored_hash)                      #@compare
`;

const SCHEMES = ['sha256 (no salt)', 'sha256 + salt', 'pbkdf2 (salt + iterations)'];
const SALTS: Record<string, string> = { alice: 'a1f3c9', bob: 'b7d204' };

interface In {
  password: string;
  scheme: string;
  iterations: number;
}

const iterOf = (n: number) => Math.min(5000, Math.max(1, Math.round(Number.isFinite(n) ? n : 1000)));

function hashOf(scheme: string, password: string, salt: string, iterations: number): string {
  if (scheme === SCHEMES[0]) return toHex(sha256(password));
  if (scheme === SCHEMES[1]) return toHex(sha256(salt + password));
  return toHex(pbkdf2Sha256(password, salt, iterations));
}

const viz: VizDef<In> = {
  id: 'be-password-hashing',
  title: 'Storing passwords safely',
  code,
  language: 'python',
  inputs: [
    { key: 'password', label: 'Password both users chose', kind: 'string', default: 'hunter2', maxItems: 20 },
    { key: 'scheme', label: 'Storage scheme', kind: 'select', options: SCHEMES, default: SCHEMES[0] },
    { key: 'iterations', label: 'PBKDF2 iterations (1-5000)', kind: 'number', default: 1000 },
  ],
  presets: [
    { label: 'Plain SHA-256', input: { scheme: SCHEMES[0] } },
    { label: 'Salted SHA-256', input: { scheme: SCHEMES[1] } },
    { label: 'PBKDF2, 1000 iterations', input: { scheme: SCHEMES[2], iterations: 1000 } },
    { label: 'PBKDF2, 4000 iterations', input: { scheme: SCHEMES[2], iterations: 4000 } },
  ],
  run({ password, scheme, iterations }) {
    const r = new Recorder(code);
    const pw = password || 'hunter2';
    const iters = iterOf(iterations);
    const anchor = scheme === SCHEMES[0] ? 'plain' : scheme === SCHEMES[1] ? 'salted' : 'pbkdf2';
    const salted = scheme !== SCHEMES[0];
    const rows: { user: string; salt: string; hash: string }[] = [];

    const table = (tones: Record<string, Tone> = {}): GridPanel => ({
      type: 'grid',
      title: 'users table (what a database leak exposes)',
      colLabels: ['user', 'salt', 'stored hash'],
      cells: rows.map((x) => [x.user, x.salt, short(x.hash, 20)]),
      tones,
    });

    step(r, anchor, scheme === SCHEMES[2] ? `Policy: PBKDF2-HMAC-SHA256, ${iters} rounds, random salt per user` : `Policy: ${scheme}`, [table(), { type: 'note', text: `alice and bob both sign up with the password "${pw}".` }], { scheme, iterations: scheme === SCHEMES[2] ? iters : 1 });

    for (const user of ['alice', 'bob']) {
      const salt = salted ? SALTS[user] : '-';
      const hash = hashOf(scheme, pw, salt, iters);
      rows.push({ user, salt, hash });
      step(r, anchor, `${user}: stored ${short(hash, 12)}${salted ? ` with salt ${salt}` : ''}`, [table({ [`${rows.length - 1},2`]: 'new' })], { user, hash: short(hash, 12) });
    }

    const same = rows[0].hash === rows[1].hash;
    step(r, anchor, same ? 'Leak: both hashes are identical, so both users share a password' : 'Leak: hashes differ even though the passwords are equal', [table({ '0,2': same ? 'error' : 'found', '1,2': same ? 'error' : 'found' })], { identical: same });

    const ops = scheme === SCHEMES[2] ? iters : 1;
    const rate = Math.round(1e9 / ops);
    const attack: Panel[] = [
      { type: 'chart', title: 'hash operations the attacker needs per guess', kind: 'bar', series: [{ label: 'plain/salted SHA-256', points: [[1, 1]], tone: 'error' }, { label: 'this scheme', points: [[2, ops]], tone: ops > 1 ? 'found' : 'error' }], xLabel: 'scheme', yLabel: 'hash ops per guess' },
      { type: 'kv', title: 'attacker model (1e9 hash ops/s)', entries: [{ k: 'ops per guess', v: ops }, { k: 'guesses per second', v: rate }, { k: 'precomputed table works', v: same ? 'yes (same hash for everyone)' : 'no (salt differs per user)', tone: same ? 'error' : 'found' }] },
    ];
    step(r, anchor, scheme === SCHEMES[0] ? 'Fast hash, no salt: a precomputed table cracks every user at full speed' : scheme === SCHEMES[1] ? 'Salt kills shared tables, but each guess is still one cheap hash' : `Each guess now costs ${ops} hash rounds: ${ops}x slower to brute-force`, attack, { ops, guesses_per_s: rate });

    const salt = rows[0].salt === '-' ? '' : rows[0].salt;
    step(r, 'recompute', `Login: recompute with alice's stored salt${salted ? ` (${salt})` : ''} and compare`, [table({ '0,2': 'compare' }), { type: 'kv', title: 'check_password', entries: [{ k: 'recomputed', v: short(hashOf(scheme, pw, salt, iters), 20) }, { k: 'stored', v: short(rows[0].hash, 20) }] }], { match: true });
    step(r, 'compare', 'compare_digest takes the same time wherever the first mismatch is', [table({ '0,2': 'found' }), { type: 'note', text: 'Match: login succeeds. Constant-time comparison avoids leaking how many characters matched.', tone: 'found' }], { match: true });
    return { frames: r.frames, result: { sameHash: same, opsPerGuess: ops } };
  },
  reference({ scheme, iterations }) {
    return { sameHash: scheme === SCHEMES[0], opsPerGuess: scheme === SCHEMES[2] ? iterOf(iterations) : 1 };
  },
};

const S1 = 'pbkdf2_sha256$1000$a1f3$182791a86ba4f46f5f08119038fb347702e7e0c08f6f228122e4c169b09d719b';
const S2 = 'pbkdf2_sha256$1500$zz99$00e9211f857eb6e341fda6d77a85882f7450fb0e14f54f468f8627a8efcb9765';
const S3 = 'pbkdf2_sha256$100$q$559fc0e64b358aaaf46aef594f01922c3e3dbb0ee657f3619f75cb6a7822b42a';
const S4 = 'pbkdf2_sha256$300$s9$a4bb63c2708710294d89f871ae623dd70ce5f7633ac7229337b70f31ab9c4a80';

const unit: Unit = {
  id: 'be-password-hashing',
  hook: 'Every database leaks eventually; the question is how bad it is. Interviewers want to hear salt, slow hash, constant-time compare, and why plain SHA-256 is the wrong tool for passwords.',
  predict: {
    prompt: 'Two users pick the same password. The table stores SHA-256(password) with no salt. What does an attacker who steals the table learn immediately?',
    options: ['Nothing, SHA-256 cannot be reversed', 'Both users have the same password, and one precomputed lookup cracks both', 'Only the length of the password', 'The salt of each user'],
    answer: 1,
    explain: 'Identical inputs give identical unsalted hashes, so equal hashes expose shared passwords and a single precomputed table (rainbow table) of common passwords cracks everyone at once.',
  },
  viz,
  deeper: {
    points: [
      'Never store passwords or reversible encryption. Store a one-way hash made for passwords, so the server itself cannot recover them.',
      'A random salt per user makes identical passwords hash differently and defeats precomputed tables. The salt is not secret; store it next to the hash.',
      'General hashes like SHA-256 are designed to be fast, which helps the attacker. Password hashes (PBKDF2, bcrypt, scrypt, Argon2) are deliberately slow and tunable.',
      'The iteration count/work factor should rise over time. Store it with the hash so old hashes keep verifying, and re-hash on login when it is below your target.',
      'Compare hashes with a constant-time function (hmac.compare_digest) so response time does not reveal how many leading characters matched.',
    ],
    pitfalls: ['One global salt (or none) for all users', 'Using MD5/SHA-1/SHA-256 directly', 'Comparing hashes with ==', 'Never raising the iteration count as hardware gets faster', 'Rolling your own scheme instead of a vetted library'],
  },
  practice: {
    language: 'python',
    fnName: 'verify_password',
    statement: 'Passwords are stored as "pbkdf2_sha256$<iterations>$<salt>$<hex digest>". Write verify_password(password, stored): return False for a malformed value or another algorithm; otherwise recompute PBKDF2-HMAC-SHA256 (hashlib.pbkdf2_hmac, hex digest) with the stored salt and iterations and compare in constant time.',
    signature: 'import hashlib, hmac\n\ndef verify_password(password, stored):',
    solution: `import hashlib, hmac

def verify_password(password, stored):
    try:
        algo, iterations, salt, digest = stored.@@split("$")@@
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    candidate = hashlib.@@pbkdf2_hmac@@("sha256", password.encode(), salt.encode(), @@int(iterations)@@).hex()
    return @@hmac.compare_digest(candidate, digest)@@`,
    tests: [
      { args: ['hunter2', S1], expected: true, name: 'correct password' },
      { args: ['Hunter2', S1], expected: false, name: 'wrong password' },
      { args: ['', S1], expected: false, name: 'empty password' },
      { args: ['hunter2', S2], expected: true, name: 'other salt and iterations' },
      { args: ['hunter2', 'plaintext'], expected: false, name: 'malformed value' },
      { args: ['pw', 'md5$1$s$abc'], expected: false, name: 'unknown algorithm' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'make_hash',
    statement: 'make_hash(password) returns "pbkdf2_sha256$1000$<salt>$<hex digest>". Two users with the same password end up with identical stored values, which defeats the point of the salt. Fix it.',
    buggy: `import hashlib

SALT = "static-salt"

def make_hash(password):
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), SALT.encode(), 1000).hex()
    return f"pbkdf2_sha256$1000\${SALT}\${digest}"`,
    fixed: `import hashlib, secrets

def make_hash(password):
    salt = secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 1000).hex()
    return f"pbkdf2_sha256$1000\${salt}\${digest}"`,
    harness: `
import hashlib

def hash_twice(fn, password):
    a, b = fn(password), fn(password)
    algo, iters, salt, digest = a.split("$")
    again = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iters)).hex()
    return {"differ": a != b, "verifies": again == digest, "algo": algo, "iterations": int(iters)}
`,
    adapter: 'hash_twice',
    tests: [
      { args: ['hunter2'], expected: { differ: true, verifies: true, algo: 'pbkdf2_sha256', iterations: 1000 }, name: 'same password, different hashes' },
      { args: ['correct horse battery staple'], expected: { differ: true, verifies: true, algo: 'pbkdf2_sha256', iterations: 1000 } },
      { args: [''], expected: { differ: true, verifies: true, algo: 'pbkdf2_sha256', iterations: 1000 }, name: 'empty password' },
    ],
    bugType: 'reused salt',
    hint: 'Where does the salt come from each time make_hash is called?',
    explanation: 'A constant salt is just a pepper everyone shares: equal passwords still give equal hashes and one table cracks all users. Generate a fresh random salt per password (secrets.token_hex) and store it in the string.',
  },
  boss: {
    title: 'Upgrade hashes on login',
    statement: 'Write login_with_upgrade(stored, password, target_iterations, new_salt) for "pbkdf2_sha256$<iterations>$<salt>$<hex>" strings. If stored is malformed, uses another algorithm or the password is wrong, return [False, stored]. If the password is right and the stored iteration count is below target_iterations, re-hash with new_salt and target_iterations and return [True, new_stored]; otherwise return [True, stored]. Compare in constant time. (The salt is passed in so the result is deterministic.)',
    language: 'python',
    fnName: 'login_with_upgrade',
    starter: `def login_with_upgrade(stored, password, target_iterations, new_salt):
    # your code here
    pass
`,
    solution: `import hashlib, hmac

def _hash(password, salt, iterations):
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_sha256\${iterations}\${salt}\${digest}"

def login_with_upgrade(stored, password, target_iterations, new_salt):
    try:
        algo, iterations, salt, _ = stored.split("$")
        iterations = int(iterations)
    except ValueError:
        return [False, stored]
    if algo != "pbkdf2_sha256":
        return [False, stored]
    if not hmac.compare_digest(_hash(password, salt, iterations), stored):
        return [False, stored]
    if iterations < target_iterations:
        return [True, _hash(password, new_salt, target_iterations)]
    return [True, stored]`,
    tests: [
      { args: [S3, 'pw', 1000, 'n1'], expected: [true, 'pbkdf2_sha256$1000$n1$68d9a495b9dbc2a6ff6412f0ed18efa9a4716328bce39183971306b03aa74437'], name: 'weak hash is upgraded' },
      { args: [S3, 'wrong', 1000, 'n1'], expected: [false, S3], name: 'wrong password never upgrades' },
      { args: [S4, 'correct horse', 300, 'fresh'], expected: [true, S4], name: 'already at target' },
      { args: [S4, 'correct horse', 600, 'fresh'], expected: [true, 'pbkdf2_sha256$600$fresh$47436da6ffe5093556ee06aa2e7460ebd75457a91c5cae0111dc614bc3320915'], name: 'upgrade 300 to 600' },
      { args: ['plaintext', 'x', 1000, 'n'], expected: [false, 'plaintext'], name: 'malformed value' },
      { args: [S1, 'hunter2', 500, 'n2'], expected: [true, S1], name: 'stronger than target is kept' },
    ],
    hints: ['Parse the four fields first, then reuse one helper that builds the full string for (password, salt, iterations): you need it both to verify and to upgrade.', 'Verify by rebuilding the whole stored string with the OLD salt and iterations, then compare with hmac.compare_digest. Only after success compare iterations with the target.'],
    combines: ['be-password-hashing', 'be-sessions'],
  },
  quiz: [
    {
      prompt: 'Why is a slow password hash a feature rather than a bug?',
      options: ['It saves memory', 'Legitimate logins need one hash, an attacker needs billions of guesses, so cost scales against them', 'It makes hashes longer', 'It removes the need for salts'],
      answer: 1,
      explain: 'A 100 ms hash is invisible to a user but makes offline brute force millions of times more expensive than with a fast hash.',
    },
  ],
  simulationNote: 'Digests in the visualizer are real SHA-256 and PBKDF2-HMAC-SHA256 values. Python tasks run against hashlib and the teaching library minidjango; production systems should use a vetted password library and far higher iteration counts.',
};

export default unit;
