import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { CIDR_HARNESS, SIM_NOTE, arch, frame, inCidr, inCidrBinary, listPanel, logPanel, parseCidr, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';
import { cidrSpan, cidrWithin } from '@/content/lib/cloud-finish';

const code = `
def prefix(cidr):
    return int(cidr.split("/")[1])

def lookup(routes, ip):
    best = None
    for cidr, target in routes:                           #@scan
        if in_cidr(ip, cidr) and (best is None or prefix(cidr) > prefix(best[0])):
            best = (cidr, target)                         #@best
    return best

def forward(vpc, subnets, tables, nacl, sg, src, dst):
    subnet = next((s for s in subnets if in_cidr(src, s["cidr"])), None)
    if subnet is None:
        return "NO_SUBNET"                                #@nosubnet
    best = lookup([(vpc, "local")] + tables[subnet["rt"]], dst)
    if best is None:
        return "NO_ROUTE"                                 #@noroute
    if best[1] != "local":
        return "VIA_" + best[1]                           #@egress
    for num, effect, cidr in sorted(nacl):                #@nacl
        if in_cidr(src, cidr):
            if effect == "deny":
                return "NACL_DENY"
            break
    else:
        return "NACL_DENY"
    if not any(in_cidr(src, c) for c in sg):
        return "SG_DENY"                                  #@sg
    return "DELIVERED"                                    #@ok
`;

interface In {
  vpc: string;
  subnets: string[];
  routes: string[];
  nacl: string[];
  sg: string[];
  packets: string[];
}

interface Subnet {
  cidr: string;
  rt: string;
}
interface RouteRow {
  table: string;
  cidr: string;
  target: string;
}
interface NaclRule {
  num: number;
  effect: 'allow' | 'deny';
  cidr: string;
}

const TARGETS = ['igw', 'nat', 'pcx'];

function parseSubnet(s: string): Subnet {
  const [cidr, rt] = s.split(':').map((x) => x.trim());
  if (!cidr || !rt) throw new Error(`Subnet "${s}" should look like 10.0.1.0/24:public (cidr:route table)`);
  parseCidr(cidr);
  return { cidr, rt };
}
function parseRoute(s: string): RouteRow {
  const p = s.trim().split(/\s+/);
  if (p.length !== 3 || !TARGETS.includes(p[2])) throw new Error(`Route "${s}" should look like: public 0.0.0.0/0 igw  (target: igw, nat or pcx)`);
  parseCidr(p[1]);
  return { table: p[0], cidr: p[1], target: p[2] };
}
function parseNacl(s: string): NaclRule {
  const p = s.trim().split(/\s+/);
  if (p.length !== 3 || !/^\d+$/.test(p[0]) || !['allow', 'deny'].includes(p[1])) throw new Error(`NACL rule "${s}" should look like: 100 allow 10.0.0.0/16`);
  parseCidr(p[2]);
  return { num: Number(p[0]), effect: p[1] as 'allow' | 'deny', cidr: p[2] };
}
function parsePacket(s: string): { src: string; dst: string } {
  const p = s.trim().split(/\s+/);
  if (p.length !== 2) throw new Error(`Packet "${s}" should look like: 10.0.1.5 8.8.8.8 (source destination)`);
  inCidr('0.0.0.0/0', p[0]);
  inCidr('0.0.0.0/0', p[1]);
  return { src: p[0], dst: p[1] };
}

function prep(i: In) {
  parseCidr(i.vpc);
  const subnets = i.subnets.map(parseSubnet);
  if (!subnets.length) throw new Error('Add at least one subnet');
  subnets.forEach((s, k) => {
    if (!cidrWithin(s.cidr, i.vpc)) throw new Error(`Subnet ${s.cidr} is not inside the VPC ${i.vpc}`);
    for (let j = 0; j < k; j++) {
      const a = cidrSpan(s.cidr);
      const b = cidrSpan(subnets[j].cidr);
      if (a.first <= b.last && b.first <= a.last) throw new Error(`Subnets ${s.cidr} and ${subnets[j].cidr} overlap`);
    }
  });
  const routes = i.routes.map(parseRoute);
  const nacl = i.nacl.map(parseNacl);
  const packets = i.packets.map(parsePacket);
  if (!packets.length) throw new Error('Add at least one packet');
  i.sg.forEach((c) => parseCidr(c));
  return { subnets, routes, nacl, packets };
}

function tableOf(vpc: string, routes: RouteRow[], rt: string): { cidr: string; target: string }[] {
  return [{ cidr: vpc, target: 'local' }, ...routes.filter((x) => x.table === rt).map((x) => ({ cidr: x.cidr, target: x.target }))];
}

const bitsOf = (c: string): number => parseCidr(c).bits;

const viz: VizDef<In> = {
  id: 'aws-vpc',
  title: 'VPC routing, security groups and NACLs',
  code,
  language: 'python',
  inputs: [
    { key: 'vpc', label: 'VPC CIDR', kind: 'string', default: '10.0.0.0/16', maxItems: 18 },
    { key: 'subnets', label: 'Subnets (cidr:route table)', kind: 'strings', default: ['10.0.1.0/24:public', '10.0.2.0/24:private'], maxItems: 3 },
    { key: 'routes', label: 'Routes (table cidr target)', kind: 'strings', default: ['public 0.0.0.0/0 igw', 'private 0.0.0.0/0 nat', 'private 10.9.0.0/16 pcx'], maxItems: 6, help: 'Every table also has the implicit local route for the VPC CIDR.' },
    { key: 'nacl', label: 'Subnet NACL (number effect cidr)', kind: 'strings', default: ['100 deny 10.0.2.0/25', '200 allow 10.0.0.0/16'], maxItems: 4, help: 'Lowest number is checked first; the first match decides; no match means deny.' },
    { key: 'sg', label: 'Security group: allowed source CIDRs', kind: 'strings', default: ['10.0.0.0/16'], maxItems: 3 },
    { key: 'packets', label: 'Packets (source destination)', kind: 'strings', default: ['10.0.1.5 8.8.8.8', '10.0.2.7 10.9.4.4', '10.0.1.5 10.0.2.200', '10.0.2.7 10.0.1.9'], maxItems: 5 },
  ],
  presets: [
    { label: 'Public, private, peering, NACL deny', input: {} },
    { label: 'Longest prefix beats the default route', input: { packets: ['10.0.2.7 10.9.4.4', '10.0.2.7 10.8.4.4', '10.0.2.7 1.1.1.1'] } },
    { label: 'Security group blocks a peer', input: { sg: ['10.0.1.0/24'], nacl: ['100 allow 0.0.0.0/0'], packets: ['10.0.1.5 10.0.2.9', '10.0.2.5 10.0.1.9'] } },
    { label: 'No route and no subnet', input: { routes: ['public 0.0.0.0/0 igw'], packets: ['10.0.2.7 8.8.8.8', '172.16.0.4 10.0.1.5'] } },
  ],
  run(input) {
    const { subnets, routes, nacl, packets } = prep(input);
    const height = Math.max(190, subnets.length * 58 + 40);
    const nodes: ArchNode[] = [
      { id: 'rt', label: 'Route table', x: 235, y: height / 2 },
      { id: 'local', label: 'local (VPC)', x: 405, y: 32, shape: 'pill', w: 100 },
      { id: 'igw', label: 'Internet GW', x: 405, y: 84, shape: 'pill', w: 100 },
      { id: 'nat', label: 'NAT GW', x: 405, y: 136, shape: 'pill', w: 100 },
      { id: 'pcx', label: 'Peering', x: 405, y: 188, shape: 'pill', w: 100 },
      { id: 'net', label: 'Internet', x: 575, y: 110, shape: 'actor' },
      { id: 'peer', label: 'Peer VPC', x: 575, y: 188 },
    ];
    const edges: ArchEdge[] = [
      { from: 'rt', to: 'local' },
      { from: 'rt', to: 'igw' },
      { from: 'rt', to: 'nat' },
      { from: 'rt', to: 'pcx' },
      { from: 'igw', to: 'net' },
      { from: 'nat', to: 'igw', dashed: true },
      { from: 'pcx', to: 'peer' },
    ];
    subnets.forEach((s, i) => {
      nodes.push({ id: `s${i}`, label: s.rt, sub: s.cidr, x: 70, y: 40 + i * 58, w: 110 });
      edges.push({ from: `s${i}`, to: 'rt' });
    });
    const H = Math.max(height, 225);
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const out: string[] = [];
    const view = (title: string, rows: { label: string; tone?: Tone }[], tones: Record<string, Tone>, flow: string | null): Panel[] => [
      arch(`VPC ${input.vpc}`, 640, H, nodes, edges, { tones, flow }),
      listPanel(title, rows.map((x) => x.label), Object.fromEntries(rows.map((x, i) => [i, x.tone ?? 'default'])), {}, '(empty)'),
      logPanel('Packets', log),
    ];
    frame(r, 'scan', `VPC ${input.vpc} with ${subnets.length} subnets, ${routes.length} routes, ${nacl.length} NACL rules`, view('Routes', [], {}, null), { subnets: subnets.length });
    for (const p of packets) {
      r.op();
      const si = subnets.findIndex((s) => inCidr(s.cidr, p.src));
      const finish = (res: string, tones: Record<string, Tone>, flow: string | null, rows: { label: string; tone?: Tone }[], title: string, msg: string, at: string) => {
        out.push(res);
        log.push({ text: `${p.src} -> ${p.dst}: ${res}`, tone: res === 'DELIVERED' || res.startsWith('VIA_') ? 'found' : 'error' });
        frame(r, at, msg, view(title, rows, tones, flow), { result: res });
      };
      if (si < 0) {
        finish('NO_SUBNET', {}, null, [], 'Routes', `${p.src} is not in any subnet of the VPC`, 'nosubnet');
        continue;
      }
      const sub = subnets[si];
      const table = tableOf(input.vpc, routes, sub.rt);
      const rows: { label: string; tone?: Tone }[] = table.map((x) => ({ label: `${x.cidr} -> ${x.target}` }));
      const title = `Route table "${sub.rt}" for ${p.dst}`;
      frame(r, 'scan', `${p.src} (subnet ${sub.cidr}) sends to ${p.dst}: look up table "${sub.rt}"`, view(title, rows, { [`s${si}`]: 'active', rt: 'compare' }, `s${si}>rt`), { src: p.src, dst: p.dst });
      let best = -1;
      for (let k = 0; k < table.length; k++) {
        r.op();
        const hit = inCidr(table[k].cidr, p.dst);
        if (!hit) {
          rows[k].tone = 'muted';
          frame(r, 'scan', `${table[k].cidr} does not contain ${p.dst}`, view(title, rows, { rt: 'compare' }, null), { route: k + 1 });
        } else if (best < 0 || bitsOf(table[k].cidr) > bitsOf(table[best].cidr)) {
          if (best >= 0) rows[best].tone = 'muted';
          best = k;
          rows[k].tone = 'found';
          frame(r, 'best', `${table[k].cidr} contains it (/${bitsOf(table[k].cidr)}): best match so far`, view(title, rows, { rt: 'compare' }, null), { best: table[k].cidr });
        } else {
          rows[k].tone = 'muted';
          frame(r, 'scan', `${table[k].cidr} also matches but /${bitsOf(table[k].cidr)} is not longer than /${bitsOf(table[best].cidr)}`, view(title, rows, { rt: 'compare' }, null), { route: k + 1 });
        }
      }
      if (best < 0) {
        finish('NO_ROUTE', { rt: 'error' }, null, rows, title, `No route covers ${p.dst}: the packet is dropped`, 'noroute');
        continue;
      }
      const target = table[best].target;
      if (target !== 'local') {
        finish(`VIA_${target}`, { rt: 'found', [target]: 'found', ...(target === 'pcx' ? { peer: 'found' } : { net: 'found' }) }, `rt>${target}`, rows, title, `Longest match ${table[best].cidr} sends it to ${target}`, 'egress');
        continue;
      }
      frame(r, 'egress', `Target is local: delivered inside the VPC, now the destination subnet's filters`, view(title, rows, { rt: 'found', local: 'active' }, 'rt>local'), { target });
      const sorted = [...nacl].sort((a, b) => a.num - b.num);
      const nrows = sorted.map((x) => ({ label: `${x.num} ${x.effect} ${x.cidr}`, tone: undefined as Tone | undefined }));
      let verdict: 'allow' | 'deny' = 'deny';
      let decided = false;
      for (let k = 0; k < sorted.length; k++) {
        r.op();
        if (inCidr(sorted[k].cidr, p.src)) {
          verdict = sorted[k].effect;
          nrows[k].tone = verdict === 'allow' ? 'found' : 'error';
          decided = true;
          frame(r, 'nacl', `NACL rule ${sorted[k].num} matches ${p.src}: ${verdict}. First match wins`, view('NACL (stateless, ordered)', nrows, { local: verdict === 'allow' ? 'found' : 'error' }, null), { rule: sorted[k].num });
          break;
        }
        nrows[k].tone = 'muted';
        frame(r, 'nacl', `NACL rule ${sorted[k].num} (${sorted[k].cidr}) does not match ${p.src}`, view('NACL (stateless, ordered)', nrows, { local: 'compare' }, null), { rule: sorted[k].num });
      }
      if (verdict === 'deny') {
        finish('NACL_DENY', { local: 'error' }, null, nrows, 'NACL (stateless, ordered)', decided ? 'The NACL denies it before any security group is consulted' : 'No NACL rule matched: the implicit final rule denies it', 'nacl');
        continue;
      }
      const sgRows = input.sg.map((c) => ({ label: `allow from ${c}`, tone: (inCidr(c, p.src) ? 'found' : 'muted') as Tone }));
      if (!input.sg.some((c) => inCidr(c, p.src))) {
        finish('SG_DENY', { local: 'error' }, null, sgRows, 'Security group (allow rules only)', 'No security group rule allows the source: dropped', 'sg');
        continue;
      }
      finish('DELIVERED', { local: 'done' }, null, sgRows, 'Security group (allow rules only)', 'NACL and security group both allow it: delivered', 'ok');
    }
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { subnets, routes, nacl, packets } = prep(input);
    return packets.map((p) => {
      const sub = subnets.find((s) => inCidrBinary(s.cidr, p.src));
      if (!sub) return 'NO_SUBNET';
      // Independent formulation: sort candidate routes by prefix length (stable) and take the first containing one.
      const cands = tableOf(input.vpc, routes, sub.rt)
        .map((x, idx) => ({ ...x, idx, bits: bitsOf(x.cidr) }))
        .sort((a, b) => b.bits - a.bits || a.idx - b.idx);
      const best = cands.find((x) => inCidrBinary(x.cidr, p.dst));
      if (!best) return 'NO_ROUTE';
      if (best.target !== 'local') return 'VIA_' + best.target;
      const rule = [...nacl].sort((a, b) => a.num - b.num).find((x) => inCidrBinary(x.cidr, p.src));
      if (!rule || rule.effect === 'deny') return 'NACL_DENY';
      return input.sg.some((c) => inCidrBinary(c, p.src)) ? 'DELIVERED' : 'SG_DENY';
    });
  },
};

const TABLES = { public: [['0.0.0.0/0', 'igw']], private: [['0.0.0.0/0', 'nat'], ['10.9.0.0/16', 'pcx']] };
const SUBNETS = [{ cidr: '10.0.1.0/24', rt: 'public' }, { cidr: '10.0.2.0/24', rt: 'private' }];

const unit: Unit = {
  id: 'aws-vpc',
  hook: 'Networking questions come down to two things: which route a packet takes (longest prefix wins) and which firewall lets it in. Knowing why a subnet is "public" and how security groups differ from NACLs separates people who clicked a wizard from people who understand it.',
  predict: {
    prompt: 'A route table has 0.0.0.0/0 -> nat and 10.9.0.0/16 -> peering. A packet goes to 10.9.4.4. Where does it go?',
    options: ['The NAT gateway: the default route is checked first', 'The peering connection: the most specific (longest prefix) route wins', 'Both, as a copy', 'It is dropped because the routes overlap'],
    answer: 1,
    explain: 'Route tables are not ordered lists. Among all routes whose CIDR contains the destination, the one with the longest prefix is chosen. 10.9.0.0/16 is more specific than 0.0.0.0/0.',
  },
  viz,
  deeper: {
    points: [
      'A **VPC** is a private address range (a CIDR such as 10.0.0.0/16) split into **subnets**, each inside one availability zone. Subnets must sit within the VPC range and must not overlap.',
      'A subnet is **public** only because its **route table** sends 0.0.0.0/0 to an **internet gateway**. A **private** subnet sends it to a **NAT gateway** (outbound only) or nowhere.',
      'Routing uses **longest-prefix match** over the table, plus an implicit **local** route for the VPC range.',
      '**Security groups** attach to instances, have allow rules only, and are **stateful** (replies are allowed automatically). **NACLs** attach to subnets, are **stateless**, have numbered allow/deny rules evaluated in order, so return traffic needs its own rule.',
      'Peering and transit gateways connect VPCs; ranges must not overlap, and routes on both sides must be added.',
    ],
    pitfalls: ['Overlapping CIDRs that make peering impossible later', 'Forgetting the return-traffic (ephemeral port) rule in a NACL', 'Assuming rule order matters in security groups (it does not) or in route tables (it does not either)'],
  },
  practice: {
    language: 'python',
    fnName: 'cidr_contains',
    statement: 'Return True if the CIDR block `inner` lies completely inside `outer` (for example 10.0.1.0/24 inside 10.0.0.0/16). Compare the leading bits of the two network addresses.',
    signature: 'def cidr_contains(outer, inner):',
    solution: `def cidr_contains(outer, inner):
    def parse(c):
        ip, bits = c.split("/")
        n = 0
        for part in ip.split("."):
            n = n * 256 + int(part)
        return n, int(bits)

    o_base, o_bits = parse(outer)
    i_base, i_bits = parse(inner)
    shift = @@32 - o_bits@@
    return i_bits @@>=@@ o_bits and i_base >> shift == @@o_base >> shift@@`,
    tests: [
      { args: ['10.0.0.0/16', '10.0.1.0/24'], expected: true, name: 'subnet inside VPC' },
      { args: ['10.0.1.0/24', '10.0.0.0/16'], expected: false, name: 'bigger block is not inside smaller' },
      { args: ['10.0.0.0/16', '10.0.0.0/16'], expected: true, name: 'a block contains itself' },
      { args: ['10.0.0.0/16', '10.1.0.0/24'], expected: false, name: 'disjoint' },
      { args: ['0.0.0.0/0', '192.168.5.0/24'], expected: true, name: 'default route contains everything' },
      { args: ['10.0.1.0/24', '10.0.1.128/25'], expected: true, name: 'upper half of a /24' },
      { args: ['10.0.1.0/25', '10.0.1.128/25'], expected: false, name: 'sibling halves' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'pick_route',
    statement: 'Traffic to a peered range goes out through the NAT gateway because the default route is listed first. Fix `pick_route` so the most specific matching route wins. (`in_cidr(ip, cidr)` is provided.)',
    harness: CIDR_HARNESS,
    buggy: `def pick_route(routes, ip):
    for cidr, target in routes:
        if in_cidr(ip, cidr):
            return target
    return None`,
    fixed: `def pick_route(routes, ip):
    best = None
    best_bits = -1
    for cidr, target in routes:
        bits = int(cidr.split("/")[1])
        if in_cidr(ip, cidr) and bits > best_bits:
            best, best_bits = target, bits
    return best`,
    tests: [
      { args: [[['0.0.0.0/0', 'nat'], ['10.9.0.0/16', 'pcx']], '10.9.4.4'], expected: 'pcx', name: 'default listed first' },
      { args: [[['10.9.0.0/16', 'pcx'], ['0.0.0.0/0', 'nat']], '8.8.8.8'], expected: 'nat', name: 'falls back to default' },
      { args: [[['10.0.0.0/8', 'a'], ['10.1.0.0/16', 'b'], ['10.1.2.0/24', 'c']], '10.1.2.3'], expected: 'c', name: 'three nested blocks' },
      { args: [[['10.0.0.0/16', 'local']], '172.16.0.1'], expected: null, name: 'no route' },
    ],
    bugType: 'longest prefix not honoured',
    hint: 'Several routes can contain the address. Which one should be chosen, and does the first one in the list have to be it?',
    explanation: 'Returning the first containing route makes the table order decide. The rule is longest prefix: track the matching route with the greatest prefix length and return that after checking all of them.',
  },
  boss: {
    title: 'Packet forwarding through a VPC',
    statement: 'Write `forward(vpc, subnets, tables, nacl, sg, src, dst)`. `subnets` is a list of `{"cidr", "rt"}`, `tables` maps a route-table name to a list of `[cidr, target]`, `nacl` is a list of `[number, "allow"|"deny", cidr]`, `sg` a list of allowed source CIDRs. (`in_cidr(ip, cidr)` is provided.) Find the subnet containing `src` (none: "NO_SUBNET"). Routes = the implicit `[vpc, "local"]` plus the subnet\'s table; take the longest-prefix match for `dst` (none: "NO_ROUTE"; ties keep the first listed). A non-local target returns "VIA_" + target. For local traffic evaluate the NACL in number order: the first rule whose CIDR contains `src` decides, no match means deny ("NACL_DENY"); then the security group: no allowed CIDR contains `src` gives "SG_DENY"; else "DELIVERED".',
    language: 'python',
    fnName: 'forward',
    harness: CIDR_HARNESS,
    starter: `def forward(vpc, subnets, tables, nacl, sg, src, dst):
    pass
`,
    solution: `def forward(vpc, subnets, tables, nacl, sg, src, dst):
    subnet = None
    for s in subnets:
        if in_cidr(src, s["cidr"]):
            subnet = s
            break
    if subnet is None:
        return "NO_SUBNET"
    best = None
    best_bits = -1
    for cidr, target in [[vpc, "local"]] + tables.get(subnet["rt"], []):
        bits = int(cidr.split("/")[1])
        if in_cidr(dst, cidr) and bits > best_bits:
            best, best_bits = target, bits
    if best is None:
        return "NO_ROUTE"
    if best != "local":
        return "VIA_" + best
    verdict = "deny"
    for num, effect, cidr in sorted(nacl):
        if in_cidr(src, cidr):
            verdict = effect
            break
    if verdict == "deny":
        return "NACL_DENY"
    if not any(in_cidr(src, c) for c in sg):
        return "SG_DENY"
    return "DELIVERED"`,
    tests: [
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [[100, 'deny', '10.0.2.0/25'], [200, 'allow', '10.0.0.0/16']], ['10.0.0.0/16'], '10.0.1.5', '8.8.8.8'], expected: 'VIA_igw', name: 'public subnet goes to the internet gateway' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [], [], '10.0.2.7', '10.9.4.4'], expected: 'VIA_pcx', name: 'peering beats the default route' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [[100, 'deny', '10.0.2.0/25'], [200, 'allow', '10.0.0.0/16']], ['10.0.0.0/16'], '10.0.2.7', '10.0.1.9'], expected: 'NACL_DENY', name: 'lowest-numbered NACL rule decides' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [[200, 'allow', '10.0.0.0/16'], [100, 'deny', '10.0.2.0/25']], ['10.0.0.0/16'], '10.0.2.7', '10.0.1.9'], expected: 'NACL_DENY', name: 'rules are sorted by number, not list order' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [[100, 'allow', '0.0.0.0/0']], ['10.0.1.0/24'], '10.0.2.5', '10.0.1.9'], expected: 'SG_DENY', name: 'NACL allows, security group does not' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [[100, 'allow', '0.0.0.0/0']], ['10.0.0.0/16'], '10.0.1.5', '10.0.2.9'], expected: 'DELIVERED', name: 'local delivery' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [], [], '10.0.1.5', '10.0.2.9'], expected: 'NACL_DENY', name: 'empty NACL denies' },
      { args: ['10.0.0.0/16', SUBNETS, { public: [] }, [], [], '10.0.1.5', '8.8.8.8'], expected: 'NO_ROUTE', name: 'no route off the VPC' },
      { args: ['10.0.0.0/16', SUBNETS, TABLES, [], [], '192.168.0.9', '10.0.1.5'], expected: 'NO_SUBNET', name: 'source outside every subnet' },
    ],
    hints: ['Build the candidate list as `[[vpc, "local"]] + tables[subnet["rt"]]` and keep the match with the largest prefix length (`int(cidr.split("/")[1])`).', 'For the NACL, `sorted(nacl)` orders by rule number; the first rule containing `src` decides and the default is deny. Only after that check the security group with `any(...)`.'],
    combines: ['aws-ec2', 'net-dns'],
  },
  quiz: [
    {
      prompt: 'What makes a subnet "public"?',
      options: ['Its name', 'A route to an internet gateway in its route table', 'A larger CIDR block', 'A security group open to 0.0.0.0/0'],
      answer: 1,
      explain: 'Public means the subnet route table sends internet-bound traffic (0.0.0.0/0) to an internet gateway. Instances also need a public IP and permissive filters, but the route is what defines the subnet.',
    },
    {
      prompt: 'Which statement about security groups vs NACLs is correct?',
      options: ['Security groups are stateless, NACLs stateful', 'Security groups are stateful allow-lists on instances; NACLs are stateless, ordered allow/deny lists on subnets', 'Both are stateful', 'NACLs only apply to outbound traffic'],
      answer: 1,
      explain: 'Replies to an allowed security-group connection are allowed automatically. NACLs treat every packet on its own, so return traffic needs its own rule.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
