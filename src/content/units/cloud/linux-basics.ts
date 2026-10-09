import { Recorder } from '@/engine/recorder';
import type { GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { frame, kvPanel, logPanel } from '@/content/lib/cloud-aws';
import { modeToSym, parseOctal } from '@/content/lib/cloud-finish';

const code = `
PROGRAM = {"r": "cat", "w": "tee", "x": "./run.sh"}

def run(shell, user, op):
    child = fork(shell)                                      #@fork
    child.image = PROGRAM[op]                                #@exec
    return can_access(MODE, OWNER, GROUP, user.name, user.groups, op)   #@open

def can_access(mode, owner, group, uid, gids, op):
    if uid == "root":
        return op != "x" or mode & 0o111 != 0                #@root
    if uid == owner:
        cls = (mode >> 6) & 7                                 #@owner
    elif group in gids:
        cls = (mode >> 3) & 7                                 #@group
    else:
        cls = mode & 7                                        #@other
    need = {"r": 4, "w": 2, "x": 1}[op]
    return cls & need != 0                                    #@check
`;

interface In {
  mode: string;
  fileOwner: string;
  users: string[];
  requests: string[];
}

interface User {
  name: string;
  groups: string[];
  text: string;
}

const PROGRAM: Record<string, string> = { r: 'cat', w: 'tee', x: './run.sh' };
const OPS = ['r', 'w', 'x'];

function parseUser(s: string): User {
  const [name, g] = s.split(':').map((x) => x.trim());
  if (!name || !/^[\w-]+$/.test(name)) throw new Error(`User "${s}" should look like bob:devs+qa (name:groups joined by +)`);
  return { name, groups: g ? g.split('+').filter(Boolean) : [], text: s.trim() };
}

function prep(i: In) {
  const mode = parseOctal(i.mode);
  const [owner, group] = i.fileOwner.split(':').map((x) => x.trim());
  if (!owner || !group) throw new Error('File owner should look like alice:devs (owner:group)');
  const users = i.users.map(parseUser);
  users.push({ name: 'root', groups: ['root'], text: 'root:root' });
  const reqs = i.requests.map((s) => {
    const p = s.trim().split(/\s+/);
    if (p.length !== 2 || !OPS.includes(p[1])) throw new Error(`Request "${s}" should look like: bob r  (user, then r, w or x)`);
    const u = users.find((x) => x.name === p[0]);
    if (!u) throw new Error(`Unknown user "${p[0]}" (known: ${users.map((x) => x.name).join(', ')})`);
    return { user: u, op: p[1], text: s.trim() };
  });
  if (!reqs.length) throw new Error('Add at least one request');
  return { mode, owner, group, users, reqs };
}

function ref(mode: number, owner: string, group: string, u: User, op: string): boolean {
  // Independent formulation: read the answer off the symbolic string.
  const sym = modeToSym(mode);
  if (u.name === 'root') return op !== 'x' || sym.includes('x');
  const triple = u.name === owner ? sym.slice(0, 3) : u.groups.includes(group) ? sym.slice(3, 6) : sym.slice(6, 9);
  return triple.includes(op);
}

const viz: VizDef<In> = {
  id: 'linux-basics',
  title: 'fork/exec and file permission bits',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'File mode (octal)', kind: 'string', default: '754', maxItems: 3, help: 'e.g. 754 = rwxr-xr--. Digits are owner, group, other.' },
    { key: 'fileOwner', label: 'File owner:group', kind: 'string', default: 'alice:devs', maxItems: 24 },
    { key: 'users', label: 'Users (name:groups joined by +)', kind: 'strings', default: ['alice:devs', 'bob:devs+qa', 'carol:staff'], maxItems: 4 },
    { key: 'requests', label: 'Requests (user r|w|x)', kind: 'strings', default: ['alice w', 'bob w', 'bob x', 'carol r', 'root w'], maxItems: 5 },
  ],
  presets: [
    { label: 'Owner, group, other and root', input: {} },
    { label: 'Owner class does not fall through to group', input: { mode: '074', requests: ['alice r', 'bob r', 'carol r'] } },
    { label: 'No execute bits: even root cannot run it', input: { mode: '644', requests: ['root x', 'root r', 'alice x'] } },
    { label: 'World writable', input: { mode: '666', requests: ['carol w', 'carol x', 'bob r'] } },
  ],
  run(input) {
    const { mode, owner, group, reqs } = prep(input);
    const sym = modeToSym(mode);
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const out: boolean[] = [];
    const cells = [0, 1, 2].map((row) => [0, 1, 2].map((col) => sym[row * 3 + col]));
    const proc = (user: string, image: string, forked: boolean, tone: Tone): GraphPanel => ({
      type: 'graph',
      title: 'Process tree',
      width: 520,
      height: 80,
      nodes: [
        { id: 'init', label: 'init', sub: 'pid 1, root', x: 60, y: 40, shape: 'rect', w: 80 },
        { id: 'sh', label: 'bash', sub: `pid 100, ${user}`, x: 210, y: 40, shape: 'rect', w: 100 },
        ...(forked ? [{ id: 'ch', label: image, sub: `pid 101, ${user}`, x: 390, y: 40, shape: 'rect' as const, w: 110, tone }] : []),
      ],
      edges: [
        { from: 'init', to: 'sh', directed: true },
        ...(forked ? [{ from: 'sh', to: 'ch', directed: true, label: 'fork', flow: tone === 'active' }] : []),
      ],
    });
    const bits = (row: number, col: number, rowTone: Tone, cellTone: Tone): Panel => ({
      type: 'grid',
      title: `${sym}  (${input.mode})  owner ${owner}, group ${group}`,
      cells,
      rowLabels: ['owner', 'group', 'other'],
      colLabels: ['r', 'w', 'x'],
      tones: { ...(row >= 0 ? Object.fromEntries([0, 1, 2].map((c) => [`${row},${c}`, rowTone])) : {}), ...(row >= 0 && col >= 0 ? { [`${row},${col}`]: cellTone } : {}) },
    });
    frame(r, 'fork', `File mode ${input.mode} is ${sym}: owner ${owner}, group ${group}`, [proc('alice', 'bash', false, 'default'), bits(-1, -1, 'default', 'default'), kvPanel('Octal digits', { owner: `${(mode >> 6) & 7}`, group: `${(mode >> 3) & 7}`, other: `${mode & 7}`, 'r / w / x': '4 / 2 / 1' })], { mode: input.mode });
    for (const q of reqs) {
      r.op();
      const u = q.user;
      const prog = PROGRAM[q.op];
      frame(r, 'fork', `${u.name}'s shell forks: the child (pid 101) is a copy running as ${u.name}`, [proc(u.name, 'bash', true, 'active'), bits(-1, -1, 'default', 'default'), logPanel('Results', log)], { user: u.name });
      frame(r, 'exec', `exec replaces the child's program with ${prog}; the user does not change`, [proc(u.name, prog, true, 'compare'), bits(-1, -1, 'default', 'default'), logPanel('Results', log)], { image: prog });
      const col = OPS.indexOf(q.op);
      let ok: boolean;
      let row = -1;
      if (u.name === 'root') {
        ok = q.op !== 'x' || (mode & 0o111) !== 0;
        frame(r, 'root', ok ? 'root bypasses read/write checks; execute needs at least one x bit' : 'Even root cannot execute a file with no x bit set', [proc(u.name, prog, true, ok ? 'found' : 'error'), bits(-1, -1, 'default', 'default'), logPanel('Results', log)], { class: 'root' });
      } else {
        let cls: string;
        if (u.name === owner) {
          row = 0;
          cls = 'owner';
          frame(r, 'owner', `${u.name} owns the file: only the owner digit (${(mode >> 6) & 7}) is used`, [proc(u.name, prog, true, 'compare'), bits(0, -1, 'compare', 'default'), logPanel('Results', log)], { class: cls });
        } else if (u.groups.includes(group)) {
          row = 1;
          cls = 'group';
          frame(r, 'group', `${u.name} is in group ${group}, not the owner: group digit (${(mode >> 3) & 7}) is used`, [proc(u.name, prog, true, 'compare'), bits(1, -1, 'compare', 'default'), logPanel('Results', log)], { class: cls });
        } else {
          row = 2;
          cls = 'other';
          frame(r, 'other', `${u.name} is neither owner nor in ${group}: other digit (${mode & 7}) is used`, [proc(u.name, prog, true, 'compare'), bits(2, -1, 'compare', 'default'), logPanel('Results', log)], { class: cls });
        }
        ok = cells[row][col] !== '-';
      }
      out.push(ok);
      log.push({ text: `${u.name} ${q.op}: ${ok ? 'allowed' : 'Permission denied'}`, tone: ok ? 'found' : 'error' });
      frame(r, 'check', ok ? `${q.op} bit is set: ${prog} ${q.op === 'x' ? 'runs' : 'opens the file'}` : q.op === 'x' ? 'No x bit for this class: exec fails with EACCES (Permission denied)' : `No ${q.op} bit for this class: open() fails with EACCES`, [proc(u.name, prog, true, ok ? 'found' : 'error'), bits(row, col, row >= 0 ? (ok ? 'found' : 'error') : 'default', ok ? 'found' : 'error'), logPanel('Results', log)], { allowed: ok });
    }
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { mode, owner, group, reqs } = prep(input);
    return reqs.map((q) => ref(mode, owner, group, q.user, q.op));
  },
};


const unit: Unit = {
  id: 'linux-basics',
  hook: 'Backend and DevOps interviews keep returning to the Linux basics: how a process is born (fork then exec) and what chmod 754 actually means. Both come up the moment something fails with "Permission denied".',
  predict: {
    prompt: 'A file is owned by alice, group devs, mode 074 (---rwxr--). Alice is also in group devs. Can alice read it?',
    options: ['Yes: she is in the group, which allows read', 'No: the owner class applies to the owner and gives her no permissions', 'Yes: owner permissions are added to group permissions', 'Only with sudo'],
    answer: 1,
    explain: 'Linux picks exactly one class: owner if you are the owner, otherwise group, otherwise other. It never combines them, so the owner digit 0 applies and alice is denied even though her group could read it.',
  },
  viz,
  deeper: {
    points: [
      '`fork()` copies the calling process (new pid, same user, same open files); `exec()` replaces the current program image in that process. A shell runs a command with fork then exec, then `wait()`s for the child.',
      'Every process runs as a **user** with a primary and supplementary **groups**; file access is checked against those, not against who typed the command.',
      'A mode is three triples (owner, group, other) of r=4, w=2, x=1, so `754` = `rwx r-x r--`. Directories: r lists names, w changes entries, x lets you enter them.',
      '**root** skips read/write checks but still needs at least one x bit to execute a file. `setuid` makes a program run as its owner; `umask` removes bits from newly created files.',
      'Zombies are exited children whose parent has not `wait`ed; orphans are re-parented to init. Signals (SIGTERM, SIGKILL) and exit codes (0 success, 126 not executable, 127 not found) are the debugging vocabulary.',
    ],
    pitfalls: ['chmod 777 to make an error disappear', 'Forgetting x on a directory so files inside are unreachable', 'Reading the octal digits right-to-left'],
  },
  practice: {
    language: 'python',
    fnName: 'to_symbolic',
    statement: 'Convert an octal mode string such as "754" to its symbolic form "rwxr-xr--". Each digit contributes three characters: r if the 4 bit is set, w if the 2 bit is set, x if the 1 bit is set, otherwise "-".',
    signature: 'def to_symbolic(octal):',
    solution: `def to_symbolic(octal):
    out = ""
    for digit in octal:
        d = int(digit)
        out += "r" if @@d & 4@@ else "-"
        out += "w" if @@d & 2@@ else "-"
        out += "x" if @@d & 1@@ else "-"
    return out`,
    tests: [
      { args: ['754'], expected: 'rwxr-xr--', name: 'typical script' },
      { args: ['644'], expected: 'rw-r--r--', name: 'typical file' },
      { args: ['000'], expected: '---------', name: 'no access' },
      { args: ['777'], expected: 'rwxrwxrwx', name: 'everything' },
      { args: ['421'], expected: 'r---w---x', name: 'one bit per class' },
      { args: ['070'], expected: '---rwx---', name: 'group only' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'to_octal',
    statement: '`to_octal("rwxr-xr--")` returns "457" instead of "754". Fix the digit order.',
    buggy: `def to_octal(sym):
    digits = []
    for i in range(0, 9, 3):
        chunk = sym[i:i + 3]
        digits.append(str((chunk[0] != "-") * 4 + (chunk[1] != "-") * 2 + (chunk[2] != "-")))
    return "".join(reversed(digits))`,
    fixed: `def to_octal(sym):
    digits = []
    for i in range(0, 9, 3):
        chunk = sym[i:i + 3]
        digits.append(str((chunk[0] != "-") * 4 + (chunk[1] != "-") * 2 + (chunk[2] != "-")))
    return "".join(digits)`,
    tests: [
      { args: ['rwxr-xr--'], expected: '754', name: 'owner first' },
      { args: ['rw-r--r--'], expected: '644', name: 'typical file' },
      { args: ['rwxrwxrwx'], expected: '777', name: 'symmetrical' },
      { args: ['---rwx---'], expected: '070', name: 'group only' },
      { args: ['---------'], expected: '000', name: 'no access' },
    ],
    bugType: 'wrong octal digit order',
    hint: 'The first triple in the string is the owner. In which order are the digits joined?',
    explanation: 'The symbolic string and the octal number both read owner, group, other from left to right. Reversing the digits turns 754 into 457.',
  },
  boss: {
    title: 'Can this user touch that file?',
    statement: 'Write `can_access(mode, owner, group, uid, gids, op)`. `mode` is an int (use bit operations; 0o754 style), `uid` the user name, `gids` the list of group names the user belongs to, `op` is "r", "w" or "x". For "root": r and w are always allowed, x only if any of the three x bits is set. Otherwise pick exactly one class: owner if `uid == owner`, else group if `group in gids`, else other; the access is allowed if that class\'s digit has the bit (r=4, w=2, x=1) set.',
    language: 'python',
    fnName: 'can_access',
    starter: `def can_access(mode, owner, group, uid, gids, op):
    pass
`,
    solution: `def can_access(mode, owner, group, uid, gids, op):
    if uid == "root":
        return op != "x" or mode & 0o111 != 0
    if uid == owner:
        cls = (mode >> 6) & 7
    elif group in gids:
        cls = (mode >> 3) & 7
    else:
        cls = mode & 7
    need = {"r": 4, "w": 2, "x": 1}[op]
    return cls & need != 0`,
    tests: [
      { args: [0o754, 'alice', 'devs', 'alice', ['devs'], 'w'], expected: true, name: 'owner may write' },
      { args: [0o754, 'alice', 'devs', 'bob', ['devs', 'qa'], 'w'], expected: false, name: 'group may not write' },
      { args: [0o754, 'alice', 'devs', 'bob', ['devs'], 'x'], expected: true, name: 'group may execute' },
      { args: [0o754, 'alice', 'devs', 'carol', ['staff'], 'r'], expected: true, name: 'other may read' },
      { args: [0o754, 'alice', 'devs', 'carol', ['staff'], 'x'], expected: false, name: 'other may not execute' },
      { args: [0o074, 'alice', 'devs', 'alice', ['devs'], 'r'], expected: false, name: 'owner class does not fall through to group' },
      { args: [0o644, 'alice', 'devs', 'root', ['root'], 'x'], expected: false, name: 'root cannot run a file without x bits' },
      { args: [0o100, 'alice', 'devs', 'root', ['root'], 'x'], expected: true, name: 'any x bit lets root execute' },
      { args: [0o000, 'alice', 'devs', 'root', ['root'], 'w'], expected: true, name: 'root writes anything' },
    ],
    hints: ['Handle root first. Then compute a single class digit with shifts: owner `(mode >> 6) & 7`, group `(mode >> 3) & 7`, other `mode & 7`.', 'Use an if / elif / else chain so only one class applies, then test `digit & need` where need is 4, 2 or 1.'],
    combines: ['aws-iam'],
  },
  quiz: [
    {
      prompt: 'Which sequence does a shell use to run `ls`?',
      options: ['exec, then fork', 'fork, then exec in the child', 'Only fork', 'It loads ls into its own process'],
      answer: 1,
      explain: 'The shell must survive, so it forks a child and the child execs the new program. If it exec-ed itself it would be replaced by ls.',
    },
  ],
  simulationNote: 'A simplified model of Linux permissions and process creation (no ACLs, setuid, sticky bits or capabilities), for learning the rules rather than reproducing every kernel detail.',
};

export default unit;
