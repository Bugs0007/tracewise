import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { CIDR_HARNESS, SIM_NOTE, arch, frame, inCidr, inCidrBinary, kvPanel, listPanel, logPanel, type ArchNode, type ArchEdge } from '@/content/lib/cloud-aws';

const code = `
def sg_allows(rules, proto, port, src_ip):
    for rule in rules:                                   #@loop
        if rule["proto"] not in (proto, "all"):          #@proto
            continue
        if not rule["from"] <= port <= rule["to"]:       #@port
            continue
        if in_cidr(src_ip, rule["cidr"]):                #@cidr
            return True                                  #@allow
    return False                                         #@deny
`;

interface In {
  rules: string[];
  requests: string[];
  instance: string;
  workload: string;
}

const TYPES: Record<string, { vcpu: number; mem: number; note: string }> = {
  't3.micro': { vcpu: 2, mem: 1, note: 'burstable' },
  'm5.large': { vcpu: 2, mem: 8, note: 'general purpose' },
  'c5.xlarge': { vcpu: 4, mem: 8, note: 'compute optimised' },
  'r5.large': { vcpu: 2, mem: 16, note: 'memory optimised' },
};
const NEEDS: Record<string, { vcpu: number; mem: number }> = {
  'web app': { vcpu: 2, mem: 4 },
  'batch compute': { vcpu: 4, mem: 6 },
  'in-memory cache': { vcpu: 2, mem: 12 },
};

interface Rule {
  proto: string;
  from: number;
  to: number;
  cidr: string;
  text: string;
}
interface Req {
  proto: string;
  port: number;
  ip: string;
  text: string;
}

function parseRule(s: string): Rule {
  const [proto, ports, cidr] = s.split(':').map((x) => x.trim());
  if (!proto || !ports || !cidr || !/^[\d.]+\/\d+$/.test(cidr)) throw new Error(`Rule "${s}" should look like tcp:443:0.0.0.0/0 or tcp:8000-8100:10.0.0.0/16`);
  const [a, b] = ports.split('-').map(Number);
  if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) throw new Error(`Rule "${s}" has bad ports`);
  inCidr(cidr, '0.0.0.0');
  return { proto, from: a, to: b ?? a, cidr, text: s };
}
function parseReq(s: string): Req {
  const [proto, port, ip] = s.split(':').map((x) => x.trim());
  if (!proto || !Number.isInteger(Number(port)) || !ip) throw new Error(`Request "${s}" should look like tcp:443:203.0.113.9`);
  inCidr('0.0.0.0/0', ip);
  return { proto, port: Number(port), ip, text: s };
}

const NODES: ArchNode[] = [
  { id: 'client', label: 'Client', x: 60, y: 100, shape: 'actor' },
  { id: 'sg', label: 'Security group', x: 235, y: 100 },
  { id: 'ec2', label: 'EC2 instance', x: 420, y: 100 },
  { id: 'ebs', label: 'EBS', x: 570, y: 100, shape: 'cylinder' },
  { id: 'ami', label: 'AMI', x: 420, y: 28 },
];
const EDGES: ArchEdge[] = [
  { from: 'client', to: 'sg' },
  { from: 'sg', to: 'ec2' },
  { from: 'ec2', to: 'ebs' },
  { from: 'ami', to: 'ec2', dashed: true, label: 'launched from' },
];

const viz: VizDef<In> = {
  id: 'aws-ec2',
  title: 'Security group in front of an EC2 instance',
  code,
  language: 'python',
  inputs: [
    { key: 'rules', label: 'Inbound rules (proto:ports:cidr)', kind: 'strings', default: ['tcp:22:10.0.0.0/8', 'tcp:443:0.0.0.0/0', 'tcp:8000-8100:10.0.1.0/24'], maxItems: 6, help: 'e.g. tcp:443:0.0.0.0/0, tcp:8000-8100:10.0.1.0/24, all:0-65535:10.0.0.0/16' },
    { key: 'requests', label: 'Incoming packets (proto:port:source ip)', kind: 'strings', default: ['tcp:443:203.0.113.9', 'tcp:22:203.0.113.9', 'tcp:22:10.2.3.4', 'udp:53:10.0.1.5', 'tcp:8050:10.0.1.77'], maxItems: 8 },
    { key: 'instance', label: 'Instance type', kind: 'select', default: 'm5.large', options: Object.keys(TYPES) },
    { key: 'workload', label: 'Workload', kind: 'select', default: 'web app', options: Object.keys(NEEDS) },
  ],
  presets: [
    { label: 'Public web + private SSH', input: {} },
    { label: 'Port range edge', input: { rules: ['tcp:8000-8100:10.0.1.0/24'], requests: ['tcp:8000:10.0.1.5', 'tcp:8100:10.0.1.5', 'tcp:8101:10.0.1.5', 'tcp:8050:10.0.2.5'] } },
    { label: 'Locked down (no rules)', input: { rules: [], requests: ['tcp:443:203.0.113.9', 'tcp:22:10.0.0.4'], instance: 't3.micro', workload: 'batch compute' } },
    { label: 'Wide open (all traffic)', input: { rules: ['all:0-65535:0.0.0.0/0'], requests: ['udp:123:198.51.100.7', 'tcp:3306:198.51.100.7'] } },
  ],
  run(input) {
    const rules = input.rules.map(parseRule);
    const reqs = input.requests.map(parseReq);
    const it = TYPES[input.instance];
    const need = NEEDS[input.workload];
    if (!it || !need) throw new Error('Pick an instance type and a workload');
    const fits = it.vcpu >= need.vcpu && it.mem >= need.mem;
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const results: boolean[] = [];
    const sub = `${input.instance}: ${it.vcpu} vCPU, ${it.mem} GiB`;
    const view = (tones: Record<string, Tone>, flow: string | null, ruleTones: Record<number, Tone>, badge = ''): Panel[] => [
      arch('Request path', 640, 150, NODES, EDGES, { tones: { ec2: fits ? 'done' : 'error', ...tones }, flow, subs: { ec2: it.note }, badges: { ec2: sub, sg: badge } }),
      listPanel('Inbound rules (first match wins, default deny)', rules.map((x) => x.text), ruleTones, {}, 'no rules: everything is denied'),
      kvPanel('Sizing check', { workload: input.workload, 'needs': `${need.vcpu} vCPU, ${need.mem} GiB`, instance: `${it.vcpu} vCPU, ${it.mem} GiB (${it.note})`, verdict: fits ? 'fits' : 'undersized' }, { verdict: fits ? 'found' : 'error' }),
      logPanel('Decisions', log),
    ];
    frame(r, 'loop', `Instance ${input.instance} (${it.note}) for a ${input.workload}: ${fits ? 'fits' : 'undersized'}`, view({}, null, {}), { instance: input.instance, rules: rules.length });
    for (const q of reqs) {
      r.op();
      frame(r, 'loop', `${q.text}: packet reaches the security group`, view({ client: 'active', sg: 'compare' }, 'client>sg', {}, 'checking'), { proto: q.proto, port: q.port, src: q.ip });
      let allowed = false;
      const ruleTones: Record<number, Tone> = {};
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        ruleTones[i] = 'compare';
        if (rule.proto !== q.proto && rule.proto !== 'all') {
          frame(r, 'proto', `Rule ${i + 1}: protocol ${rule.proto} is not ${q.proto}, skip`, view({ sg: 'compare' }, null, { ...ruleTones }, 'checking'), { rule: i + 1 });
          ruleTones[i] = 'muted';
          continue;
        }
        if (!(rule.from <= q.port && q.port <= rule.to)) {
          frame(r, 'port', `Rule ${i + 1}: port ${q.port} outside ${rule.from}-${rule.to}, skip`, view({ sg: 'compare' }, null, { ...ruleTones }, 'checking'), { rule: i + 1 });
          ruleTones[i] = 'muted';
          continue;
        }
        if (!inCidr(rule.cidr, q.ip)) {
          frame(r, 'cidr', `Rule ${i + 1}: ${q.ip} is not inside ${rule.cidr}, skip`, view({ sg: 'compare' }, null, { ...ruleTones }, 'checking'), { rule: i + 1 });
          ruleTones[i] = 'muted';
          continue;
        }
        ruleTones[i] = 'found';
        allowed = true;
        log.push({ text: `${q.text} allowed by rule ${i + 1}`, tone: 'found' });
        frame(r, 'allow', `Rule ${i + 1} matches: ${q.ip} is inside ${rule.cidr}. Allowed`, view({ sg: 'found', ec2: 'active' }, 'sg>ec2', ruleTones, 'allow'), { allowed: true });
        frame(r, 'allow', 'Reply traffic leaves automatically: security groups are stateful', view({ sg: 'found', ec2: 'active', client: 'found' }, 'ec2>sg', ruleTones, 'allow'), { allowed: true });
        break;
      }
      if (!allowed) {
        log.push({ text: `${q.text} dropped (no rule)`, tone: 'error' });
        frame(r, 'deny', `No rule matches ${q.text}: dropped silently (default deny)`, view({ sg: 'error', client: 'error' }, null, ruleTones, 'drop'), { allowed: false });
      }
      results.push(allowed);
    }
    if (!reqs.length) frame(r, 'deny', 'No packets were given', view({}, null, {}), {});
    frame(r, 'deny', `${results.filter(Boolean).length} of ${results.length} packets reached the instance`, view({}, null, {}), { allowed: results.filter(Boolean).length });
    return { frames: r.frames, result: results };
  },
  reference(input) {
    const rules = input.rules.map(parseRule);
    return input.requests.map(parseReq).map((q) => rules.some((x) => (x.proto === q.proto || x.proto === 'all') && q.port >= x.from && q.port <= x.to && inCidrBinary(x.cidr, q.ip)));
  },
};

const T = [['t3.micro', 2, 1, 0.0104], ['m5.large', 2, 8, 0.096], ['c5.xlarge', 4, 8, 0.17], ['r5.large', 2, 16, 0.126], ['m5.xlarge', 4, 16, 0.192]];
const R = [['tcp', 22, 22, '10.0.0.0/8'], ['tcp', 8000, 8100, '10.0.1.0/24'], ['tcp', 443, 443, '0.0.0.0/0']];

const unit: Unit = {
  id: 'aws-ec2',
  hook: 'EC2 questions are about matching the instance family to the workload and understanding that a security group is a stateful allow-list. Nearly every "why can\'t I connect?" story ends at one of those two.',
  predict: {
    prompt: 'A security group allows inbound TCP 443 from 0.0.0.0/0 and has no outbound rule changes beyond the default. Does the response to a client request get blocked unless you add a matching rule for the reply?',
    options: ['Yes, replies need an explicit outbound rule on the ephemeral port range', 'No, security groups are stateful so replies to allowed connections flow back automatically', 'Only if a network ACL is also attached', 'Yes, but only for UDP'],
    answer: 1,
    explain: 'Security groups track connections. If the inbound request was allowed, the reply is allowed no matter what the outbound rules say. (Network ACLs are stateless and do need both directions.)',
  },
  viz,
  deeper: {
    points: [
      'An **AMI** is the template (root volume snapshot, launch permissions); an **instance** is a running copy of it. Instance store disks vanish on stop, **EBS** volumes persist.',
      'Families map to workloads: **t** burstable (credits), **m** general purpose, **c** compute heavy, **r/x** memory heavy, **i** fast local storage, **g/p** GPUs.',
      'Security group rules are **allow only**, evaluated together (not in order), and the default for inbound is deny. Rules can reference another security group instead of a CIDR.',
      'Purchase options trade commitment for price: on-demand, savings plans/reserved for steady load, spot for interruptible work.',
      'Put instances in an Auto Scaling group across availability zones rather than relying on a single hand-managed machine.',
    ],
    pitfalls: ['Opening SSH to 0.0.0.0/0 "just for a minute"', 'Treating a t-class instance as always-fast: CPU credits run out', 'Forgetting that a stopped instance changes its public IP unless it has an Elastic IP'],
  },
  practice: {
    language: 'python',
    fnName: 'pick_instance',
    statement: 'Given `types` as `[name, vcpu, mem_gb, price_per_hour]` rows, return the name of the cheapest type with at least `vcpu` vCPUs and at least `mem_gb` memory, or None if nothing fits. Earlier rows win price ties.',
    signature: 'def pick_instance(types, vcpu, mem_gb):',
    solution: `def pick_instance(types, vcpu, mem_gb):
    best = None
    for name, cpus, mem, price in types:
        if @@cpus >= vcpu and mem >= mem_gb@@:
            if best is None or @@price < best[1]@@:
                best = (name, price)
    return @@best[0] if best else None@@`,
    tests: [
      { args: [T, 2, 1], expected: 't3.micro', name: 'tiny workload' },
      { args: [T, 2, 8], expected: 'm5.large', name: 'general purpose is cheapest' },
      { args: [T, 4, 8], expected: 'c5.xlarge', name: 'compute beats bigger m5' },
      { args: [T, 2, 12], expected: 'r5.large', name: 'memory heavy' },
      { args: [T, 4, 16], expected: 'm5.xlarge', name: 'only one fits both' },
      { args: [T, 8, 4], expected: null, name: 'nothing fits' },
      { args: [[['a', 2, 4, 0.1], ['b', 2, 4, 0.1]], 2, 4], expected: 'a', name: 'tie keeps first' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'sg_allows',
    statement: 'After a refactor, HTTPS on 443 times out even though a rule allows it, and so does the last port (8100) of the 8000-8100 range. Fix `sg_allows`. (`in_cidr(ip, cidr)` is provided.)',
    harness: CIDR_HARNESS,
    buggy: `def sg_allows(rules, proto, port, src_ip):
    for rule_proto, lo, hi, cidr in rules:
        if rule_proto != proto and rule_proto != "all":
            continue
        if not lo <= port < hi:
            continue
        if in_cidr(src_ip, cidr):
            return True
    return False`,
    fixed: `def sg_allows(rules, proto, port, src_ip):
    for rule_proto, lo, hi, cidr in rules:
        if rule_proto != proto and rule_proto != "all":
            continue
        if not lo <= port <= hi:
            continue
        if in_cidr(src_ip, cidr):
            return True
    return False`,
    tests: [
      { args: [R, 'tcp', 443, '203.0.113.9'], expected: true, name: 'single port rule' },
      { args: [R, 'tcp', 8100, '10.0.1.5'], expected: true, name: 'upper bound is included' },
      { args: [R, 'tcp', 8000, '10.0.1.5'], expected: true, name: 'lower bound is included' },
      { args: [R, 'tcp', 8101, '10.0.1.5'], expected: false, name: 'just outside the range' },
      { args: [R, 'udp', 22, '10.1.1.1'], expected: false, name: 'wrong protocol' },
    ],
    bugType: 'off-by-one (exclusive range end)',
    hint: 'Port ranges in a security group rule include both ends. Which comparison operator is excluding `hi`?',
    explanation: 'Port ranges in a rule include both ends, so 8000-8100 covers 8100 and a single-port rule has lo == hi. `lo <= port < hi` is a slicing habit that makes the range half-open; it must be `lo <= port <= hi`.',
  },
  boss: {
    title: 'Port scan against a security group',
    statement: 'Write `scan(rules, src_ip, ports)` returning the sorted list of TCP `ports` that a client at `src_ip` could connect to. `rules` are `[proto, lo, hi, cidr]` rows where proto may be "tcp", "udp" or "all"; ranges are inclusive; a port is open if any rule matches; everything else is closed. `in_cidr(ip, cidr)` is provided.',
    language: 'python',
    fnName: 'scan',
    harness: CIDR_HARNESS,
    starter: `def scan(rules, src_ip, ports):
    pass
`,
    solution: `def scan(rules, src_ip, ports):
    open_ports = []
    for port in ports:
        for proto, lo, hi, cidr in rules:
            if proto in ("tcp", "all") and lo <= port <= hi and in_cidr(src_ip, cidr):
                open_ports.append(port)
                break
    return sorted(open_ports)`,
    tests: [
      { args: [R, '203.0.113.9', [22, 80, 443, 8050]], expected: [443], name: 'internet sees only 443' },
      { args: [R, '10.0.1.5', [22, 443, 8000, 8100, 8101]], expected: [22, 443, 8000, 8100], name: 'office subnet' },
      { args: [[['udp', 53, 53, '0.0.0.0/0']], '1.2.3.4', [53]], expected: [], name: 'udp rule does not open tcp' },
      { args: [[['all', 0, 65535, '10.0.0.0/16']], '10.0.9.9', [1, 65535, 5432]], expected: [1, 5432, 65535], name: 'all traffic from the vpc' },
      { args: [[], '10.0.0.1', [22]], expected: [], name: 'no rules means nothing is open' },
      { args: [R, '10.0.1.5', [443, 22, 443]], expected: [22, 443, 443], name: 'duplicates kept, result sorted' },
    ],
    hints: ['For each port, loop over the rules and stop at the first one that matches protocol (tcp or all), the inclusive range and the CIDR.', 'Collect matching ports in a list and `break` out of the rule loop once a port is open so it is not added twice. Sort at the end.'],
    combines: ['aws-vpc'],
  },
  quiz: [
    {
      prompt: 'Your batch job needs lots of CPU and little memory. Which family should you start with?',
      options: ['r (memory optimised)', 'c (compute optimised)', 't (burstable)', 'i (storage optimised)'],
      answer: 1,
      explain: 'C-family instances give a high vCPU-to-memory ratio. T instances run out of CPU credits under sustained load.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
