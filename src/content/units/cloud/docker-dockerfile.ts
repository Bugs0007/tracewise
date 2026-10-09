import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kv, list, step } from '@/content/lib/cloud-devops';

const code = `
def build(lines, context):
    image = {"fs": set(), "env": {}, "workdir": "/", "user": "root", "expose": [], "cmd": None}   #@init
    layers = 0
    for line in lines:                                           #@loop
        op, _, arg = line.partition(" ")
        if op == "FROM":
            image["fs"] |= base_files(arg)                       #@from
        elif op == "WORKDIR":
            image["workdir"] = arg                               #@workdir
        elif op == "COPY":
            image["fs"] |= copy_files(arg, context, image)       #@copy
            layers += 1
        elif op == "RUN":
            apply_shell(arg, image)                              #@run
            layers += 1
        elif op == "ENV":
            key, _, value = arg.partition("=")
            image["env"][key] = value                            #@env
        elif op == "USER":
            image["user"] = arg                                  #@user
        elif op == "EXPOSE":
            image["expose"].append(int(arg))                     #@expose
        elif op == "CMD":
            image["cmd"] = arg                                   #@cmd
    return image, layers

def docker_run(image):
    if image["cmd"] is None:
        return "container exits: no command"                     #@nocmd
    return "pid 1: " + image["cmd"] + " as " + image["user"]     #@start
`;

const CONTEXT = ['requirements.txt', 'app.py', 'README.md', '.env', 'tests/test_app.py'];
const REQS = ['flask', 'gunicorn'];

const DEFAULT = [
  'FROM python:3.12-slim',
  'WORKDIR /app',
  'ENV PORT=8000',
  'COPY requirements.txt .',
  'RUN pip install --no-cache-dir -r requirements.txt',
  'COPY . .',
  'RUN useradd -m app',
  'USER app',
  'EXPOSE 8000',
  'CMD python app.py',
];

const KEYWORDS = new Set(['FROM', 'WORKDIR', 'COPY', 'ADD', 'RUN', 'ENV', 'EXPOSE', 'USER', 'CMD', 'ENTRYPOINT', 'LABEL', 'ARG', 'VOLUME']);

interface Image {
  fs: string[];
  env: Record<string, string>;
  workdir: string;
  user: string;
  expose: number[];
  cmd: string | null;
  users: Set<string>;
}

function baseFiles(image: string): string[] {
  const name = image.split(':')[0];
  if (name.startsWith('python')) return ['/bin/sh', '/usr/local/bin/python'];
  if (name.startsWith('ubuntu') || name.startsWith('debian')) return ['/bin/sh', '/bin/bash', '/usr/bin/apt-get'];
  if (name.startsWith('alpine')) return ['/bin/sh', '/sbin/apk'];
  if (name === 'scratch') return [];
  return ['/bin/sh'];
}

function join(base: string, p: string): string {
  const raw = p.startsWith('/') ? p : (base === '/' ? '' : base) + '/' + p;
  const out: string[] = [];
  for (const seg of raw.split('/')) if (seg && seg !== '.') out.push(seg);
  return '/' + out.join('/');
}

function addAll(img: Image, paths: string[]): string[] {
  const added: string[] = [];
  for (const p of paths) {
    if (img.fs.includes(p)) continue;
    img.fs.push(p);
    added.push(p);
  }
  return added;
}

/** Returns added paths or throws a build error with a Docker-style message. */
function applyCopy(arg: string, img: Image): string[] {
  const parts = arg.split(/\s+/).filter((p) => !p.startsWith('--'));
  const dest = parts[parts.length - 1];
  const srcs = parts.slice(0, -1);
  if (!srcs.length) throw new Error('COPY needs a source and a destination');
  const out: string[] = [];
  for (const s of srcs) {
    if (s === '.' || s === './') {
      for (const f of CONTEXT) out.push(join(join(img.workdir, dest), f));
    } else if (CONTEXT.includes(s)) {
      out.push(join(join(img.workdir, dest), s.split('/').pop()!));
    } else {
      const dir = s.replace(/\/+$/, '') + '/';
      const hit = CONTEXT.filter((f) => f.startsWith(dir));
      if (!hit.length) throw new Error(`COPY failed: "${s}" not found in the build context`);
      for (const f of hit) out.push(join(join(img.workdir, dest), f.slice(dir.length)));
    }
  }
  return addAll(img, out);
}

/** Models a few common shell commands; returns added/removed paths and notes. */
function applyShell(arg: string, img: Image): { added: string[]; removed: string[]; note: string } {
  const added: string[] = [];
  const removed: string[] = [];
  const notes: string[] = [];
  for (const cmd of arg.split('&&').map((c) => c.trim()).filter(Boolean)) {
    const t = cmd.split(/\s+/);
    if (t[0] === 'pip' && t[1] === 'install') {
      let noCache = false;
      const pkgs: string[] = [];
      for (let i = 2; i < t.length; i++) {
        if (t[i] === '--no-cache-dir') noCache = true;
        else if (t[i] === '-r') {
          const file = join(img.workdir, t[++i] ?? '');
          if (!img.fs.includes(file)) throw new Error(`pip: ${t[i]} not found in ${img.workdir}. COPY it before this RUN`);
          pkgs.push(...REQS);
        } else if (!t[i].startsWith('-')) pkgs.push(t[i]);
      }
      added.push(...addAll(img, pkgs.map((p) => `/usr/local/lib/python3.12/site-packages/${p}`)));
      if (!noCache) added.push(...addAll(img, ['/root/.cache/pip']));
      notes.push(noCache ? 'pip installed packages' : 'pip installed packages and left /root/.cache/pip');
    } else if (t[0] === 'apt-get' && t[1] === 'update') {
      added.push(...addAll(img, ['/var/lib/apt/lists/*']));
      notes.push('apt downloaded package lists');
    } else if (t[0] === 'apt-get' && t[1] === 'install') {
      added.push(...addAll(img, t.slice(2).filter((x) => !x.startsWith('-')).map((p) => `/usr/bin/${p}`)));
      notes.push('apt installed packages');
    } else if (t[0] === 'rm') {
      const targets = t.slice(1).filter((x) => !x.startsWith('-'));
      for (const x of targets) {
        const gone = img.fs.filter((p) => p === x || (x.endsWith('/*') && p.startsWith(x.slice(0, -1))) || p.startsWith(x + '/'));
        img.fs = img.fs.filter((p) => !gone.includes(p));
        removed.push(...gone);
      }
      notes.push('rm removed files in THIS layer');
    } else if (t[0] === 'useradd' || t[0] === 'adduser') {
      const name = t[t.length - 1];
      img.users.add(name);
      added.push(...addAll(img, [`/home/${name}`]));
      notes.push(`created user ${name}`);
    } else if (t[0] === 'mkdir') {
      added.push(...addAll(img, t.slice(1).filter((x) => !x.startsWith('-')).map((p) => join(img.workdir, p))));
      notes.push('mkdir');
    } else notes.push(`"${t[0]}": no file effect modelled`);
  }
  return { added, removed, note: notes.join('; ') };
}

interface In {
  lines: string[];
}

const viz: VizDef<In> = {
  id: 'docker-dockerfile',
  title: 'Dockerfile line by line',
  code,
  language: 'python',
  inputs: [{ key: 'lines', label: 'Dockerfile instructions', kind: 'strings', default: DEFAULT, maxItems: 12, help: 'Separate instructions with commas (no commas inside an instruction). Build context: requirements.txt, app.py, README.md, .env, tests/test_app.py' }],
  presets: [
    { label: 'Well-ordered app', input: { lines: DEFAULT } },
    { label: 'Install before COPY', input: { lines: ['FROM python:3.12-slim', 'WORKDIR /app', 'RUN pip install -r requirements.txt', 'COPY . .', 'CMD python app.py'] } },
    { label: 'Runs as root, no CMD', input: { lines: ['FROM ubuntu:22.04', 'RUN apt-get update && apt-get install -y curl', 'COPY app.py /srv/', 'EXPOSE 8080'] } },
    { label: 'USER that does not exist', input: { lines: ['FROM python:3.12-slim', 'COPY app.py /srv/', 'USER ghost', 'CMD python /srv/app.py'] } },
  ],
  run({ lines: raw }) {
    const lines = raw.map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!lines.length) throw new Error('Add at least one instruction');
    for (const l of lines) if (!KEYWORDS.has(l.split(' ')[0].toUpperCase())) throw new Error(`"${l}" does not start with a Dockerfile instruction`);
    if (lines[0].split(' ')[0].toUpperCase() !== 'FROM') throw new Error('A Dockerfile must start with FROM');

    const r = new Recorder(code);
    const img: Image = { fs: [], env: {}, workdir: '/', user: 'root', expose: [], cmd: null, users: new Set(['root']) };
    const history: ListItem[] = [];
    let layers = 0;
    let built = true;
    let fresh: string[] = [];

    const fsPanel = (): Panel => {
      const shown = img.fs.slice(-12);
      return list(
        `Filesystem (${img.fs.length} paths${img.fs.length > shown.length ? ', last 12 shown' : ''})`,
        shown.map((p): ListItem => {
          const secret = p.endsWith('/.env');
          return { label: p, tone: secret ? 'error' : fresh.includes(p) ? 'new' : 'default', sub: secret ? 'secret baked into the image' : undefined };
        }),
        { emptyText: 'empty (scratch)' },
      );
    };
    const metaPanel = (): Panel =>
      kv('Image metadata (no layer)', {
        workdir: img.workdir,
        user: img.user,
        env: Object.entries(img.env).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)',
        expose: img.expose.join(', ') || '(none)',
        cmd: img.cmd ?? '(none)',
      });
    const histPanel = (): Panel => list(`Image history: ${layers} filesystem layers`, history.slice(-8), { startLabel: 'base', endLabel: 'top' });
    const view = (): Panel[] => [histPanel(), fsPanel(), metaPanel()];
    const addHist = (line: string, layer: boolean, tone: Tone = 'default') => history.push({ label: line, sub: layer ? 'layer' : 'metadata only', tone: layer ? tone : 'muted' });

    step(r, 'init', 'Start from an empty image. Instructions run top to bottom.', view(), {});
    for (const line of lines) {
      r.op();
      const [opRaw, ...restParts] = line.split(' ');
      const op = opRaw.toUpperCase();
      const arg = restParts.join(' ');
      fresh = [];
      try {
        if (op === 'FROM') {
          fresh = addAll(img, baseFiles(arg.split(' ')[0]));
          layers += 1;
          addHist(line, true, 'swap');
          step(r, 'from', `FROM ${arg.split(' ')[0]}: start with the base image's files`, view(), { op });
        } else if (op === 'WORKDIR') {
          img.workdir = join(img.workdir, arg);
          fresh = addAll(img, [img.workdir]);
          addHist(line, false);
          step(r, 'workdir', `WORKDIR sets the directory for later COPY, RUN and CMD: ${img.workdir}`, view(), { workdir: img.workdir });
        } else if (op === 'COPY' || op === 'ADD') {
          fresh = applyCopy(arg, img);
          layers += 1;
          addHist(line, true, 'new');
          const secret = fresh.some((p) => p.endsWith('/.env'));
          step(r, 'copy', secret ? `${op} adds ${fresh.length} files, including .env: secrets are now in the image` : `${op} adds ${fresh.length} file(s) from the build context as a new layer`, view(), { op, files: fresh.length });
        } else if (op === 'RUN') {
          const res = applyShell(arg, img);
          fresh = res.added;
          layers += 1;
          addHist(line, true, 'new');
          step(r, 'run', `RUN executes at build time in a new layer: ${res.note}`, view(), { op, added: res.added.length, removed: res.removed.length });
        } else if (op === 'ENV') {
          const m = arg.match(/^([\w]+)(?:=|\s+)(.*)$/);
          if (!m) throw new Error(`ENV needs KEY=value, got "${arg}"`);
          img.env[m[1]] = m[2];
          addHist(line, false);
          step(r, 'env', `ENV ${m[1]}=${m[2]} is stored in metadata and visible to every later step and the container`, view(), { op });
        } else if (op === 'USER') {
          img.user = arg.split(' ')[0];
          addHist(line, false);
          step(r, 'user', img.users.has(img.user) || /^\d+$/.test(img.user) ? `USER ${img.user}: later steps and the container run as this user` : `USER ${img.user} is recorded, but no such user was created in the image`, view(), { user: img.user });
        } else if (op === 'EXPOSE') {
          img.expose.push(Number(arg.split(/[\s/]/)[0]));
          addHist(line, false);
          step(r, 'expose', `EXPOSE ${arg} only documents the port. It does not publish it`, view(), { op });
        } else if (op === 'CMD' || op === 'ENTRYPOINT') {
          img.cmd = arg;
          addHist(line, false);
          step(r, 'cmd', `${op} stores the default command; it runs when a container starts, not now`, view(), { cmd: arg });
        } else {
          addHist(line, false);
          step(r, 'init', `${op}: metadata only in this model`, view(), { op });
        }
      } catch (e) {
        built = false;
        const msg = e instanceof Error ? e.message : String(e);
        step(r, op === 'COPY' ? 'copy' : 'run', `Build fails at "${line}": ${msg}`, [...view(), { type: 'note', text: msg, tone: 'error' }], { error: msg });
        break;
      }
    }
    fresh = [];
    const userOk = img.users.has(img.user) || /^\d+$/.test(img.user);
    let runs = false;
    if (!built) {
      step(r, 'start', 'No image was produced, so there is nothing to run', [metaPanel()], { built });
    } else if (img.cmd === null) {
      step(r, 'nocmd', 'docker run: the container exits immediately, there is no CMD', [metaPanel(), { type: 'note', text: 'No CMD or ENTRYPOINT: pass a command or add one.', tone: 'error' }], { built });
    } else if (!userOk) {
      step(r, 'start', `docker run fails: unable to find user ${img.user}`, [metaPanel(), { type: 'note', text: 'The USER must exist in /etc/passwd of the image (create it with useradd).', tone: 'error' }], { built });
    } else {
      runs = true;
      const listening = img.expose.length ? `listening on ${img.expose[0]} inside; run with -p ${img.expose[0]}:${img.expose[0]} to reach it` : 'no EXPOSE: still reachable if you publish a port with -p';
      step(r, 'start', `docker run: PID 1 is "${img.cmd}" as ${img.user}`, [
        kv('Running container', { 'pid 1': img.cmd, user: img.user, cwd: img.workdir, env: Object.keys(img.env).join(', ') || '(none)', network: listening }, { 'pid 1': 'found' }),
        { type: 'note', text: 'The container adds a thin writable layer on top of the image layers; files written at runtime are lost when it is removed.', tone: 'compare' },
      ], { built, runs });
    }
    const res = { built, layers: built ? layers : 0, user: img.user, cmd: img.cmd, env: Object.keys(img.env).sort(), expose: [...img.expose], runs };
    return { frames: r.frames, result: res };
  },
  reference({ lines: raw }) {
    return summarise(raw.map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean));
  },
};

/** Independent summary of a build, computed by scanning the instructions (no file-system simulation). */
function summarise(lines: string[]) {
  const ops = lines.map((l) => l.split(' ')[0].toUpperCase());
  const arg = (i: number) => lines[i].split(' ').slice(1).join(' ');
  const knownSource = (s: string) => s === '.' || s === './' || CONTEXT.includes(s) || CONTEXT.some((f) => f.startsWith(s.replace(/\/+$/, '') + '/'));
  // Where does the build stop? A COPY of a missing source, or pip install -r before requirements.txt was copied.
  let stop = lines.length;
  let copiedReqs = false;
  for (let i = 0; i < lines.length; i++) {
    if (ops[i] === 'COPY' || ops[i] === 'ADD') {
      const srcs = arg(i).split(' ').filter((p) => !p.startsWith('--')).slice(0, -1);
      if (srcs.some((s) => s === '.' || s === './' || s === 'requirements.txt')) copiedReqs = true;
      if (srcs.some((s) => !knownSource(s))) {
        stop = i;
        break;
      }
    }
    if (ops[i] === 'RUN' && /pip install.*-r requirements\.txt/.test(arg(i)) && !copiedReqs) {
      stop = i;
      break;
    }
  }
  const made = new Set<string>(['root']);
  let user = 'root';
  let cmd: string | null = null;
  let layers = 0;
  const env: string[] = [];
  const expose: number[] = [];
  for (let i = 0; i < stop; i++) {
    if (['FROM', 'COPY', 'ADD', 'RUN'].includes(ops[i])) layers++;
    if (ops[i] === 'USER') user = arg(i).split(' ')[0];
    if (ops[i] === 'CMD' || ops[i] === 'ENTRYPOINT') cmd = arg(i);
    if (ops[i] === 'ENV') env.push(arg(i).match(/^(\w+)/)?.[1] ?? '');
    if (ops[i] === 'EXPOSE') expose.push(Number(arg(i).split(/[\s/]/)[0]));
    if (ops[i] === 'RUN') {
      const m = arg(i).match(/(?:useradd|adduser)\s+(?:-\S+\s+)*(\S+)/);
      if (m) made.add(m[1]);
    }
  }
  const done = stop === lines.length;
  const userOk = made.has(user) || /^\d+$/.test(user);
  return { built: done, layers: done ? layers : 0, user, cmd, env: env.filter(Boolean).sort(), expose, runs: done && cmd !== null && userOk };
}

const unit: Unit = {
  id: 'docker-dockerfile',
  hook: 'A Dockerfile is a recipe interviewers expect you to read at a glance: which lines make layers, which only set metadata, and what really happens at docker run.',
  predict: {
    prompt: 'A Dockerfile has EXPOSE 8000 and CMD python app.py. You run docker run myimage and open localhost:8000. What happens?',
    options: ['It works: EXPOSE publishes the port', 'The connection fails: EXPOSE is documentation, you need -p 8000:8000', 'The container refuses to start without -p', 'It works only on Linux'],
    answer: 1,
    explain: 'EXPOSE records metadata for humans and tools. Nothing is reachable from the host until you publish with `-p host:container` (or `-P`).',
  },
  viz,
  deeper: {
    points: [
      '`FROM`, `RUN`, `COPY` and `ADD` create **filesystem layers**. `ENV`, `EXPOSE`, `USER`, `WORKDIR`, `CMD` are **metadata** stored in the image config.',
      '`RUN` executes at **build** time. `CMD` and `ENTRYPOINT` run at **container start**. Mixing them up is a common bug.',
      'Prefer **exec form** `CMD ["python", "app.py"]` so the app is PID 1 and receives SIGTERM; shell form wraps it in `/bin/sh -c`.',
      '`COPY` copies files. `ADD` also fetches URLs and unpacks archives, which is surprising. Use `COPY` unless you need that.',
      'Run as a non-root `USER`: if the process is compromised it has far fewer privileges. Create the user with `RUN useradd` before `USER`.',
      'Use a `.dockerignore` so `.env`, `.git` and test data never enter the build context.',
    ],
    pitfalls: ['`COPY . .` before dependency install (kills the cache) or with a `.env` file present', '`RUN apt-get update` without `install` in the same line', '`pip install` without `--no-cache-dir` bloating the layer', 'USER set to a user that was never created'],
  },
  practice: {
    language: 'python',
    fnName: 'lint_dockerfile',
    statement: 'Implement `lint_dockerfile(lines)`. `lines` is a list of Dockerfile instructions. Return findings as "N:rule" strings (N = 1-based index), sorted by line then text. Rules: `latest-tag` (FROM image with no tag or :latest, unless scratch or a digest with @), `add-instead-of-copy` (ADD whose first source is not a URL or a .tar/.tar.gz/.tgz archive), `pip-cache` (RUN with pip install but no --no-cache-dir), `root-user` (no USER at all, or the last USER is root or 0; reported on the last line).',
    signature: 'def lint_dockerfile(lines):',
    solution: `def lint_dockerfile(lines):
    findings = []
    user = None
    for n, line in enumerate(lines, 1):
        op, _, args = line.strip().partition(" ")
        op = op.upper()
        if op == "FROM":
            image = args.split()[0]
            name = image.split("/")[-1]
            if image != "scratch" and "@" not in image and @@(":" not in name or name.endswith(":latest"))@@:
                findings.append(f"{n}:latest-tag")
        elif op == "ADD":
            src = args.split()[0]
            if @@not src.startswith("http") and not src.endswith((".tar", ".tar.gz", ".tgz"))@@:
                findings.append(f"{n}:add-instead-of-copy")
        elif op == "RUN":
            if "pip install" in args and @@"--no-cache-dir" not in args@@:
                findings.append(f"{n}:pip-cache")
        elif op == "USER":
            user = args.split()[0]
    if lines and @@user in (None, "root", "0")@@:
        findings.append(f"{len(lines)}:root-user")
    return sorted(findings, key=lambda f: (int(f.split(":")[0]), f))`,
    tests: [
      { args: [['FROM python', 'COPY . .', 'CMD python app.py']], expected: ['1:latest-tag', '3:root-user'], name: 'untagged base and no USER' },
      { args: [['FROM python:3.12-slim', 'ADD app.py /app/', 'USER app', 'CMD x']], expected: ['2:add-instead-of-copy'], name: 'ADD instead of COPY' },
      { args: [['FROM python:3.12', 'RUN pip install flask', 'USER app']], expected: ['2:pip-cache'], name: 'pip cache left behind' },
      { args: [['FROM python:latest', 'RUN pip install --no-cache-dir flask', 'USER 1000']], expected: ['1:latest-tag'], name: ':latest tag' },
      { args: [['FROM scratch', 'COPY app /app', 'USER 1000', 'CMD x']], expected: [], name: 'scratch is fine' },
      { args: [['FROM python:3.12@sha256:abc', 'ADD https://example.com/f.tgz /f', 'ADD rootfs.tar.gz /', 'USER root']], expected: ['4:root-user'], name: 'digest, URL and archive ADD are fine; USER root is not' },
      { args: [['FROM localhost:5000/app', 'USER app']], expected: ['1:latest-tag'], name: 'registry port is not a tag' },
      { args: [['FROM python:3.12 AS build', 'USER app']], expected: [], name: 'AS alias' },
      { args: [['FROM ubuntu', 'RUN apt-get update', 'RUN pip install flask']], expected: ['1:latest-tag', '3:pip-cache', '3:root-user'], name: 'several findings sorted' },
      { args: [[]], expected: [], name: 'empty' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'cache_order',
    statement: '`cache_order(lines)` should report the line of a `COPY . .` that comes BEFORE a dependency install (it busts the cache). It also flags the correct pattern where only requirements.txt is copied first. Fix it.',
    buggy: `def cache_order(lines):
    copied_all = None
    out = []
    for n, line in enumerate(lines, 1):
        op, _, args = line.strip().partition(" ")
        op = op.upper()
        if op == "COPY":
            copied_all = copied_all or n
        elif op == "RUN" and copied_all and any(c in args for c in ("pip install", "npm install", "npm ci")):
            out.append(copied_all)
            copied_all = None
    return out`,
    fixed: `def cache_order(lines):
    copied_all = None
    out = []
    for n, line in enumerate(lines, 1):
        op, _, args = line.strip().partition(" ")
        op = op.upper()
        if op == "COPY" and args.split()[0] == ".":
            copied_all = copied_all or n
        elif op == "RUN" and copied_all and any(c in args for c in ("pip install", "npm install", "npm ci")):
            out.append(copied_all)
            copied_all = None
    return out`,
    tests: [
      { args: [['FROM x', 'COPY . .', 'RUN pip install -r r.txt']], expected: [2], name: 'copy everything first' },
      { args: [['FROM x', 'COPY requirements.txt .', 'RUN pip install -r requirements.txt', 'COPY . .']], expected: [], name: 'manifest first is correct' },
      { args: [['FROM x', 'COPY package.json .', 'RUN npm ci', 'COPY . .', 'RUN npm run build']], expected: [], name: 'npm ci pattern' },
      { args: [['FROM x', 'COPY . .', 'RUN npm ci', 'COPY . .', 'RUN npm install']], expected: [2, 4], name: 'two offenders' },
    ],
    bugType: 'rule too broad',
    hint: 'Which COPY instructions should arm the check? Look at the first argument.',
    explanation: 'Any COPY set the flag, so the recommended `COPY requirements.txt .` was reported as a mistake. Only a copy of the whole context (`.` as the source) should arm the check.',
  },
  boss: {
    title: 'Lint a real Dockerfile',
    statement:
      'Implement `lint_text(text)` on the raw Dockerfile text. Skip blank lines and `#` comments; join lines ending in a backslash into one instruction (it counts as starting on its first line). Keywords are case-insensitive. Return sorted "N:rule" strings (N = starting line). Rules: `latest-tag` and `add-instead-of-copy` and `pip-cache` as usual; `apt-cleanup` (RUN with "apt-get install" but no "rm -rf /var/lib/apt/lists"); `cache-order` (reported on the FIRST `COPY` whose first source is "." when a later RUN has pip install, npm install or npm ci); `root-user` (no USER, or last USER is root or 0; reported on the line where the last instruction starts).',
    language: 'python',
    fnName: 'lint_text',
    starter: `def lint_text(text):
    pass
`,
    solution: `def lint_text(text):
    instrs = []
    buf, start = "", 0
    for no, raw in enumerate(text.split("\\n"), 1):
        line = raw.strip()
        if buf and line.startswith("#"):
            continue
        if not buf and (not line or line.startswith("#")):
            continue
        if not buf:
            start = no
        if line.endswith("\\\\"):
            buf += line[:-1].strip() + " "
            continue
        buf += line
        instrs.append((start, buf))
        buf = ""
    if buf:
        instrs.append((start, buf))

    findings = set()
    copy_all = None
    user = None
    for no, body in instrs:
        op, _, args = body.strip().partition(" ")
        op = op.upper()
        if op == "FROM":
            image = args.split()[0]
            name = image.split("/")[-1]
            if image != "scratch" and "@" not in image and (":" not in name or name.endswith(":latest")):
                findings.add(f"{no}:latest-tag")
        elif op == "ADD":
            src = args.split()[0]
            if not src.startswith("http") and not src.endswith((".tar", ".tar.gz", ".tgz")):
                findings.add(f"{no}:add-instead-of-copy")
        elif op == "COPY":
            if copy_all is None and args.split()[0] == ".":
                copy_all = no
        elif op == "RUN":
            if "pip install" in args and "--no-cache-dir" not in args:
                findings.add(f"{no}:pip-cache")
            if "apt-get install" in args and "rm -rf /var/lib/apt/lists" not in args:
                findings.add(f"{no}:apt-cleanup")
            if copy_all is not None and any(c in args for c in ("pip install", "npm install", "npm ci")):
                findings.add(f"{copy_all}:cache-order")
                copy_all = None
        elif op == "USER":
            user = args.split()[0]
    if instrs and user in (None, "root", "0"):
        findings.add(f"{instrs[-1][0]}:root-user")
    return sorted(findings, key=lambda f: (int(f.split(":")[0]), f))`,
    tests: [
      { args: ['FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nRUN useradd -m app\nUSER app\nCMD python app.py'], expected: [], name: 'clean Dockerfile' },
      { args: ['# build image\nFROM node\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD node server.js'], expected: ['2:latest-tag', '4:cache-order', '6:root-user'], name: 'comment line numbering and cache order' },
      { args: ['FROM ubuntu:22.04\nRUN apt-get update && \\\n    apt-get install -y curl\nUSER 1000'], expected: ['2:apt-cleanup'], name: 'continuation without cleanup' },
      { args: ['FROM ubuntu:22.04\nRUN apt-get update \\\n && apt-get install -y curl \\\n && rm -rf /var/lib/apt/lists/*\nUSER nobody'], expected: [], name: 'continuation with cleanup' },
      { args: ['FROM alpine:3.19 AS base\nADD app.tar.gz /srv\nADD config.yaml /etc/app/\nUSER root'], expected: ['3:add-instead-of-copy', '4:root-user'], name: 'ADD archive ok, ADD file not, USER root' },
      { args: ['from python:3.12\nrun pip install flask\nuser app'], expected: ['2:pip-cache'], name: 'lowercase keywords' },
      { args: ['FROM python:3.12\nCOPY . .\nCOPY . /again\nRUN pip install --no-cache-dir flask\nUSER app'], expected: ['2:cache-order'], name: 'only the first COPY . is reported' },
      { args: [''], expected: [], name: 'empty text' },
    ],
    hints: ['First pass: build a list of (starting_line, joined_text) instructions, skipping blanks and comments and merging backslash continuations. Second pass: apply the rules.', 'Keep `copy_all` (line of the first COPY with source ".") and report it on the next RUN that installs dependencies. Add findings to a set, then sort by (line number, text).'],
    combines: ['docker-layers'],
  },
  quiz: [
    {
      prompt: 'Which instruction runs when the container starts rather than while the image is built?',
      options: ['RUN', 'COPY', 'CMD', 'ENV'],
      answer: 2,
      explain: 'RUN executes during `docker build` and its result is baked into a layer. CMD (and ENTRYPOINT) only record the command that starts the container.',
    },
  ],
  simulationNote: 'A simplified Dockerfile simulator: it models COPY/ADD, a few common RUN commands (pip, apt-get, useradd, mkdir, rm) and metadata instructions on a fixed build context. Real builds execute arbitrary shell commands.',
};

export default unit;
