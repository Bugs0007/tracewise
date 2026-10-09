import { Recorder } from '@/engine/recorder';
import type { ChartPanel, GraphNode, GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kv, step } from '@/content/lib/cloud-devops';

const code = `
def capacity(host_cpu_m, host_mem_mb, reserve_mb, app_cpu_m, app_mem_mb, overhead_mb):
    usable = host_mem_mb - reserve_mb                     #@usable
    by_mem = usable // (app_mem_mb + overhead_mb)         #@bymem
    by_cpu = host_cpu_m // app_cpu_m                      #@bycpu
    return max(0, min(by_mem, by_cpu))                    #@min
`;

// Illustrative, order-of-magnitude numbers (not benchmarks).
const MODEL = {
  vm: { label: 'VM', reserve: 2048, overhead: 800, startup: 40 },
  container: { label: 'Container', reserve: 1024, overhead: 30, startup: 0.8 },
};

interface In {
  cores: number;
  hostGb: number;
  appMb: number;
  appCpuM: number;
}

function clean(i: In) {
  const cores = Math.round(i.cores);
  const hostGb = Math.round(i.hostGb);
  const appMb = Math.round(i.appMb);
  const appCpuM = Math.round(i.appCpuM);
  if (!(cores >= 1 && cores <= 128)) throw new Error('Cores must be between 1 and 128');
  if (!(hostGb >= 2 && hostGb <= 1024)) throw new Error('Host memory must be between 2 and 1024 GB');
  if (!(appMb >= 16 && appMb <= 65536)) throw new Error('App memory must be between 16 and 65536 MB');
  if (!(appCpuM >= 10 && appCpuM <= 64000)) throw new Error('App CPU must be between 10 and 64000 millicores');
  return { cores, hostGb, appMb, appCpuM };
}

function stacks(hl: 'none' | 'vm' | 'container' | 'both'): GraphPanel {
  const vmHot: Tone = hl === 'vm' || hl === 'both' ? 'error' : 'swap';
  const ctHot: Tone = hl === 'container' || hl === 'both' ? 'found' : 'done';
  const n = (id: string, label: string, x: number, y: number, tone: Tone, w = 110): GraphNode => ({ id, label, x, y, shape: 'rect', w, h: 30, tone });
  const nodes: GraphNode[] = [
    n('hw1', 'Hardware', 140, 235, 'muted', 250),
    n('hyp', 'Hypervisor', 140, 198, 'compare', 250),
    n('g1', 'Guest OS (full)', 82, 150, vmHot),
    n('g2', 'Guest OS (full)', 200, 150, vmHot),
    n('a1', 'App A', 82, 112, 'default'),
    n('a2', 'App B', 200, 112, 'default'),
    n('hw2', 'Hardware', 440, 235, 'muted', 260),
    n('k', 'Host OS kernel (shared)', 440, 198, ctHot, 260),
    n('rt', 'Container runtime', 440, 160, 'compare', 260),
    n('c1', 'App A', 370, 118, 'default', 76),
    n('c2', 'App B', 440, 118, 'default', 76),
    n('c3', 'App C', 510, 118, 'default', 76),
    n('t1', 'Virtual machines', 140, 60, 'muted', 150),
    n('t2', 'Containers', 440, 60, 'muted', 150),
  ];
  return { type: 'graph', title: 'Isolation stacks', nodes, edges: [], width: 590, height: 270 };
}

const viz: VizDef<In> = {
  id: 'docker-vs-vm',
  title: 'Containers vs virtual machines',
  code,
  language: 'python',
  inputs: [
    { key: 'cores', label: 'Host CPU cores', kind: 'number', default: 16 },
    { key: 'hostGb', label: 'Host memory (GB)', kind: 'number', default: 64 },
    { key: 'appMb', label: 'App memory (MB)', kind: 'number', default: 512 },
    { key: 'appCpuM', label: 'App CPU (millicores)', kind: 'number', default: 250, help: '1000 millicores = 1 core' },
  ],
  presets: [
    { label: 'Small web apps', input: { cores: 16, hostGb: 64, appMb: 512, appCpuM: 250 } },
    { label: 'CPU-bound workers', input: { cores: 16, hostGb: 64, appMb: 512, appCpuM: 2000 } },
    { label: 'Memory-hungry app', input: { cores: 32, hostGb: 64, appMb: 8192, appCpuM: 500 } },
    { label: 'Tiny microservices', input: { cores: 8, hostGb: 32, appMb: 64, appCpuM: 50 } },
  ],
  run(input) {
    const { cores, hostGb, appMb, appCpuM } = clean(input);
    const hostMb = hostGb * 1024;
    const hostCpuM = cores * 1000;
    const r = new Recorder(code);
    const counts: Record<string, number> = {};
    const chart = (): Panel[] => {
      const out: Panel[] = [];
      if ('vm' in counts || 'container' in counts) {
        const fit: ChartPanel = {
          type: 'chart',
          title: 'Instances that fit on one host',
          kind: 'bar',
          xLabel: 'VM = 1, container = 2',
          yLabel: 'instances',
          series: [
            ...('vm' in counts ? [{ label: 'VMs', points: [[1, counts.vm]] as [number, number][], tone: 'swap' as Tone }] : []),
            ...('container' in counts ? [{ label: 'Containers', points: [[2, counts.container]] as [number, number][], tone: 'found' as Tone }] : []),
          ],
        };
        out.push(fit);
      }
      return out;
    };

    step(r, 0, 'A VM virtualises hardware and boots a whole OS. A container shares the host kernel.', [stacks('none')], {});
    step(r, 0, `Each VM carries a guest OS: ~${MODEL.vm.overhead} MB of RAM and ~${MODEL.vm.startup}s to boot`, [stacks('vm'), kv('Per-instance cost', { 'VM overhead': MODEL.vm.overhead + ' MB', 'VM start-up': MODEL.vm.startup + ' s' })], {});
    step(r, 0, `A container is a process with isolation: ~${MODEL.container.overhead} MB and ~${MODEL.container.startup}s to start`, [stacks('container'), kv('Per-instance cost', { 'container overhead': MODEL.container.overhead + ' MB', 'container start-up': MODEL.container.startup + ' s' })], {});

    for (const key of ['vm', 'container'] as const) {
      const m = MODEL[key];
      const usable = hostMb - m.reserve;
      r.op();
      step(r, 'usable', `${m.label}: ${hostMb} MB host minus ${m.reserve} MB for the ${key === 'vm' ? 'hypervisor and host OS' : 'host OS and runtime'} = ${usable} MB`, [kv(`${m.label} sizing`, { host_mem_mb: hostMb, reserve_mb: m.reserve, usable })], { usable });
      const byMem = Math.floor(usable / (appMb + m.overhead));
      step(r, 'bymem', `${m.label}: ${usable} // (${appMb} + ${m.overhead}) = ${byMem} fit by memory`, [kv(`${m.label} sizing`, { usable, per_instance_mb: appMb + m.overhead, by_mem: byMem }, { by_mem: 'active' })], { by_mem: byMem });
      const byCpu = Math.floor(hostCpuM / appCpuM);
      step(r, 'bycpu', `${m.label}: ${hostCpuM} // ${appCpuM} millicores = ${byCpu} fit by CPU`, [kv(`${m.label} sizing`, { by_mem: byMem, by_cpu: byCpu }, { by_cpu: 'active' })], { by_cpu: byCpu });
      counts[key] = Math.max(0, Math.min(byMem, byCpu));
      const limit = byMem < byCpu ? 'memory' : byMem > byCpu ? 'CPU' : 'memory and CPU';
      step(r, 'min', `${m.label}: min(${byMem}, ${byCpu}) = ${counts[key]} instances, limited by ${limit}`, [kv(`${m.label} result`, { instances: counts[key], limited_by: limit }, { instances: 'found' }), ...chart()], { count: counts[key] });
    }
    const ratio = counts.vm > 0 ? Math.round((counts.container / counts.vm) * 10) / 10 : counts.container;
    step(
      r,
      'min',
      counts.container > counts.vm ? `Containers: ${counts.container} per host vs ${counts.vm} VMs, and they start ~${Math.round(MODEL.vm.startup / MODEL.container.startup)}x faster` : `Here CPU is the limit, so VMs and containers fit the same number (${counts.vm})`,
      [
        ...chart(),
        { type: 'chart', title: 'Start-up time (seconds)', kind: 'bar', xLabel: 'VM = 1, container = 2', yLabel: 'seconds', series: [{ label: 'VM', points: [[1, MODEL.vm.startup]], tone: 'swap' }, { label: 'Container', points: [[2, MODEL.container.startup]], tone: 'found' }] },
        kv('Takeaway', { ratio: ratio + 'x', 'stronger isolation': 'VM (own kernel)', 'faster / denser': 'container' }),
      ],
      { vm: counts.vm, container: counts.container },
    );
    return { frames: r.frames, result: { vm: counts.vm, container: counts.container } };
  },
  reference(input) {
    const { cores, hostGb, appMb, appCpuM } = clean(input);
    // Place instances one at a time until memory or CPU runs out.
    const place = (reserve: number, overhead: number) => {
      let mem = hostGb * 1024 - reserve;
      let cpu = cores * 1000;
      let n = 0;
      while (mem >= appMb + overhead && cpu >= appCpuM) {
        mem -= appMb + overhead;
        cpu -= appCpuM;
        n++;
      }
      return n;
    };
    return { vm: place(MODEL.vm.reserve, MODEL.vm.overhead), container: place(MODEL.container.reserve, MODEL.container.overhead) };
  },
};

const unit: Unit = {
  id: 'docker-vs-vm',
  hook: '"Containers vs VMs" is the classic warm-up. The strong answer is about what is shared (the kernel), what that costs (isolation) and what it buys (density and start-up speed).',
  predict: {
    prompt: 'Which statement about a container and a VM running on the same Linux host is true?',
    options: ['Each container boots its own kernel', 'Containers share the host kernel; each VM runs its own kernel', 'VMs share the host kernel; containers run their own', 'Both share the kernel, only the file system differs'],
    answer: 1,
    explain: 'A container is an ordinary process restricted with namespaces and cgroups, so it uses the host kernel. A VM runs a full guest OS on virtual hardware, with its own kernel.',
  },
  viz,
  deeper: {
    points: [
      'Containers rely on Linux **namespaces** (what a process can see: pids, network, mounts) and **cgroups** (how much it can use: CPU, memory).',
      'Because there is no guest OS, a container starts in well under a second and costs megabytes instead of hundreds of megabytes.',
      'The shared kernel is the trade-off: a kernel exploit can escape a container. VMs have a much smaller attack surface between tenants.',
      'A container image must match the host kernel family (Linux containers need a Linux kernel). VMs can run any OS.',
      'They combine well: cloud providers run your containers inside lightweight VMs to get both speed and strong isolation.',
    ],
    pitfalls: ['"Containers are lightweight VMs": they are not, there is no hypervisor or guest kernel', 'Assuming a container limit means a hard reservation', 'Forgetting that CPU can be the bottleneck before memory'],
  },
  practice: {
    language: 'python',
    fnName: 'capacity',
    statement: 'Implement `capacity(host_cpu_m, host_mem_mb, reserve_mb, app_cpu_m, app_mem_mb, overhead_mb)`: how many app instances fit on a host. Each instance needs `app_mem_mb + overhead_mb` of memory out of what is left after `reserve_mb`, and `app_cpu_m` millicores of CPU. Never return a negative number.',
    signature: 'def capacity(host_cpu_m, host_mem_mb, reserve_mb, app_cpu_m, app_mem_mb, overhead_mb):',
    solution: `def capacity(host_cpu_m, host_mem_mb, reserve_mb, app_cpu_m, app_mem_mb, overhead_mb):
    usable = @@host_mem_mb - reserve_mb@@
    by_mem = usable // @@(app_mem_mb + overhead_mb)@@
    by_cpu = @@host_cpu_m // app_cpu_m@@
    return @@max(0, min(by_mem, by_cpu))@@`,
    tests: [
      { args: [16000, 65536, 2048, 500, 512, 800], expected: 32, name: 'VMs, CPU-bound' },
      { args: [16000, 65536, 2048, 250, 512, 800], expected: 48, name: 'VMs, memory-bound' },
      { args: [16000, 65536, 1024, 250, 512, 30], expected: 64, name: 'containers, CPU-bound' },
      { args: [4000, 1024, 2048, 500, 256, 0], expected: 0, name: 'reserve exceeds memory' },
      { args: [4000, 2048, 512, 500, 4096, 100], expected: 0, name: 'app larger than host' },
      { args: [2000, 8192, 0, 1000, 1000, 0], expected: 2, name: 'two cores, two apps' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'capacity',
    statement: 'The planner says 124 VMs fit, but the cluster runs out of memory at about 48. Find the miscalculation.',
    buggy: `def capacity(host_cpu_m, host_mem_mb, reserve_mb, app_cpu_m, app_mem_mb, overhead_mb):
    usable = host_mem_mb - reserve_mb
    by_mem = usable // app_mem_mb
    by_cpu = host_cpu_m // app_cpu_m
    return max(0, min(by_mem, by_cpu))`,
    fixed: `def capacity(host_cpu_m, host_mem_mb, reserve_mb, app_cpu_m, app_mem_mb, overhead_mb):
    usable = host_mem_mb - reserve_mb
    by_mem = usable // (app_mem_mb + overhead_mb)
    by_cpu = host_cpu_m // app_cpu_m
    return max(0, min(by_mem, by_cpu))`,
    tests: [
      { args: [16000, 65536, 2048, 250, 512, 800], expected: 48, name: 'guest OS overhead counts' },
      { args: [16000, 65536, 2048, 500, 512, 800], expected: 32, name: 'CPU-bound' },
      { args: [16000, 65536, 1024, 250, 512, 30], expected: 64, name: 'containers' },
      { args: [2000, 8192, 0, 1000, 1000, 0], expected: 2, name: 'no overhead' },
    ],
    bugType: 'forgotten per-instance overhead',
    hint: 'Where does the guest OS memory go in the formula?',
    explanation: 'Every VM pays for its guest OS on top of the app\'s own memory. Divide usable memory by `app_mem_mb + overhead_mb`, not by the app memory alone.',
  },
  boss: {
    title: 'How many hosts do I need?',
    statement:
      'Implement `hosts_needed(workloads, host_cpu_m, host_mem_mb, overhead_mb)`. Each workload is `[cpu_m, mem_mb]` and needs `mem_mb + overhead_mb` of memory. Use first-fit decreasing: sort workloads by memory needed (largest first, ties by larger CPU first) and put each on the first host with enough CPU and memory left, opening a new host when none fits. Return the number of hosts, or -1 if any single workload cannot fit on an empty host.',
    language: 'python',
    fnName: 'hosts_needed',
    starter: `def hosts_needed(workloads, host_cpu_m, host_mem_mb, overhead_mb):
    pass
`,
    solution: `def hosts_needed(workloads, host_cpu_m, host_mem_mb, overhead_mb):
    items = sorted(((w[1] + overhead_mb, w[0]) for w in workloads), reverse=True)
    hosts = []
    for mem, cpu in items:
        if mem > host_mem_mb or cpu > host_cpu_m:
            return -1
        for h in hosts:
            if h[0] >= cpu and h[1] >= mem:
                h[0] -= cpu
                h[1] -= mem
                break
        else:
            hosts.append([host_cpu_m - cpu, host_mem_mb - mem])
    return len(hosts)`,
    tests: [
      { args: [[], 4000, 4096, 0], expected: 0, name: 'no workloads' },
      { args: [[[500, 512], [500, 512], [500, 512], [500, 512]], 2000, 2048, 0], expected: 1, name: 'all fit on one host' },
      { args: [[[500, 1024], [500, 1024], [500, 1024], [500, 1024], [500, 1024]], 4000, 4096, 0], expected: 2, name: 'memory forces a second host' },
      { args: [[[500, 1000], [500, 1000], [500, 1000], [500, 1000]], 4000, 4096, 100], expected: 2, name: 'overhead counts' },
      { args: [[[500, 5000]], 4000, 4096, 0], expected: -1, name: 'too big for any host' },
      { args: [[[100, 1000], [100, 1000], [100, 3000], [100, 3000]], 4000, 4000, 0], expected: 2, name: 'decreasing order packs tighter' },
      { args: [[[3000, 100], [3000, 100]], 4000, 4096, 0], expected: 2, name: 'CPU-bound' },
    ],
    hints: ['Turn each workload into (memory including overhead, cpu) and sort descending before placing.', 'Keep `hosts` as lists of [cpu_left, mem_left]. Try each host in order; use `for ... else` to open a new one when none fits.'],
    combines: ['docker-layers'],
  },
  quiz: [
    {
      prompt: 'Which Linux feature limits how much CPU and memory a container may use?',
      options: ['namespaces', 'cgroups', 'chroot', 'SELinux labels'],
      answer: 1,
      explain: 'Namespaces limit what a process can see; control groups (cgroups) limit what it can consume.',
    },
  ],
  simulationNote: 'Start-up times and per-instance overheads are illustrative orders of magnitude, not measurements. Real hosts also reserve CPU and may overcommit memory.',
};

export default unit;
