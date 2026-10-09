import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq, kv, step } from '@/content/lib/cloud-devops';

const code = `
def tcp(c_isn, s_isn, sizes, rto, syn_lost, losses):
    seq = c_isn                                           #@syn
    delay = sum(rto * 2 ** k for k in range(syn_lost))    #@synretx
    synack_ack = seq + 1                                  #@synack
    seq += 1
    final_ack = s_isn + 1                                 #@ack3
    acks = [synack_ack, final_ack]
    for n, lost in zip(sizes, losses):                    #@data
        for k in range(lost):                             #@timeout
            delay += rto * 2 ** k                         #@backoff
        seq += n
        acks.append(seq)                                  #@dataack
    acks.append(seq + 1)                                  #@fin
    return acks, delay
`;

interface In {
  cIsn: number;
  sIsn: number;
  sizes: number[];
  rto: number;
  loss: string;
}

const LOSSES = ['no loss', 'SYN-ACK is lost', 'first data segment is lost', 'first data segment is lost twice (backoff)', 'ACK of the first data segment is lost'];

function prep(i: In) {
  const cIsn = Math.round(i.cIsn);
  const sIsn = Math.round(i.sIsn);
  const rto = Math.round(i.rto);
  if (!(cIsn >= 0 && cIsn <= 1_000_000_000 && sIsn >= 0 && sIsn <= 1_000_000_000)) throw new Error('Initial sequence numbers must be between 0 and 1,000,000,000');
  if (!(i.sizes.length >= 1 && i.sizes.length <= 3) || i.sizes.some((s) => !(s >= 1 && s <= 10000) || !Number.isInteger(s))) throw new Error('Give 1 to 3 data segment sizes (1 to 10000 bytes)');
  if (!(rto >= 1)) throw new Error('The retransmission timeout must be at least 1 ms');
  if (!LOSSES.includes(i.loss)) throw new Error('Pick a loss scenario');
  const synLost = i.loss === LOSSES[1] ? 1 : 0;
  const losses: number[] = i.sizes.map((_, k) => (k > 0 ? 0 : i.loss === LOSSES[2] ? 1 : i.loss === LOSSES[3] ? 2 : i.loss === LOSSES[4] ? 1 : 0));
  return { cIsn, sIsn, rto, sizes: i.sizes, synLost, losses, ackLost: i.loss === LOSSES[4] };
}

interface Out {
  acks: number[];
  retransmits: number;
  delay: number;
}

const viz: VizDef<In> = {
  id: 'net-tcp',
  title: 'TCP handshake, sequence numbers and retransmission',
  code,
  language: 'python',
  inputs: [
    { key: 'cIsn', label: 'Client initial sequence number', kind: 'number', default: 1000 },
    { key: 'sIsn', label: 'Server initial sequence number', kind: 'number', default: 5000 },
    { key: 'sizes', label: 'Data segment sizes (bytes, 1-3 segments)', kind: 'numbers', default: [100, 50], maxItems: 3 },
    { key: 'rto', label: 'Retransmission timeout (ms)', kind: 'number', default: 1000 },
    { key: 'loss', label: 'Loss injection', kind: 'select', default: LOSSES[0], options: LOSSES },
  ],
  presets: [
    { label: 'Clean connection', input: {} },
    { label: 'SYN-ACK lost', input: { loss: LOSSES[1] } },
    { label: 'Data segment lost twice (backoff)', input: { loss: LOSSES[3], sizes: [200] } },
    { label: 'ACK lost: duplicate data', input: { loss: LOSSES[4], sizes: [100, 50] } },
    { label: 'Sequence numbers start at zero', input: { cIsn: 0, sIsn: 0, sizes: [1, 1, 1] } },
  ],
  run(input) {
    const c = prep(input);
    const r = new Recorder(code);
    const seq = new Seq(['Client', 'Server'], 'Segments on the wire');
    let cState = 'CLOSED';
    let sState = 'LISTEN';
    let time = 0;
    let retransmits = 0;
    let nextSeq = c.cIsn;
    let expected = c.sIsn;
    const st = (at: string, caption: string, extra: Record<string, unknown> = {}) =>
      step(r, at, caption, [seq.panel(), kv('Endpoints', { client: cState, server: sState, 'client next seq': nextSeq, 'server expects': expected, 'time waited (ms)': time })], { time, ...extra });
    const msg = (from: string, to: string, label: string, tone: Tone, dashed = false) => {
      r.op();
      seq.send(from, to, label, tone, dashed);
    };
    st('syn', `Client picks ISN ${c.cIsn} and listens to nothing yet: server is in LISTEN`);
    // 1. SYN
    cState = 'SYN_SENT';
    msg('Client', 'Server', `SYN seq=${c.cIsn}`, 'active');
    sState = 'SYN_RCVD';
    expected = c.cIsn + 1;
    st('syn', `SYN seq=${c.cIsn} (a SYN uses one sequence number). Server: SYN_RCVD`);
    // 2. SYN-ACK
    if (c.synLost) {
      msg('Server', 'Client', `SYN-ACK seq=${c.sIsn} ack=${c.cIsn + 1} (lost)`, 'error', true);
      st('synack', 'The SYN-ACK is lost in the network');
      time += c.rto;
      retransmits++;
      st('synretx', `No reply after ${c.rto} ms: client times out`, { timeout: c.rto });
      msg('Client', 'Server', `SYN seq=${c.cIsn} (retransmit)`, 'swap');
      st('syn', 'Client retransmits the same SYN; the server recognises the duplicate');
    }
    msg('Server', 'Client', `SYN-ACK seq=${c.sIsn} ack=${c.cIsn + 1}`, 'active');
    st('synack', `SYN-ACK: ack = ${c.cIsn} + 1 = ${c.cIsn + 1}, the next byte the server expects`);
    // 3. ACK
    nextSeq = c.cIsn + 1;
    cState = 'ESTABLISHED';
    msg('Client', 'Server', `ACK seq=${c.cIsn + 1} ack=${c.sIsn + 1}`, 'found');
    sState = 'ESTABLISHED';
    expected = c.cIsn + 1;
    st('ack3', `ACK: ack = ${c.sIsn} + 1 = ${c.sIsn + 1}. Both sides ESTABLISHED`);
    const acks = [c.cIsn + 1, c.sIsn + 1];
    let delay = c.synLost ? c.rto : 0;
    // 4. data
    c.sizes.forEach((n, i) => {
      const s0 = nextSeq;
      const lost = c.ackLost && i === 0 ? 0 : c.losses[i];
      st('data', `Client sends segment ${i + 1}: ${n} bytes starting at seq ${s0}`, { seq: s0, len: n });
      for (let k = 0; k < lost; k++) {
        const wait = c.rto * 2 ** k;
        msg('Client', 'Server', `DATA seq=${s0} len=${n}${k ? ' (retransmit)' : ''} (lost)`, 'error', true);
        st('data', `Segment lost: the server never sees seq ${s0}`);
        time += wait;
        delay += wait;
        retransmits++;
        st(k ? 'backoff' : 'timeout', k ? `Timer expired again: back off, wait ${wait} ms` : `No ACK within ${wait} ms: timeout`, { timeout: wait });
      }
      if (c.ackLost && i === 0) {
        msg('Client', 'Server', `DATA seq=${s0} len=${n}`, 'active');
        expected = s0 + n;
        msg('Server', 'Client', `ACK ack=${s0 + n} (lost)`, 'error', true);
        st('dataack', `Server got it and ACKs ${s0 + n}, but the ACK is lost`);
        time += c.rto;
        delay += c.rto;
        retransmits++;
        st('timeout', `No ACK within ${c.rto} ms: client assumes the data was lost`, { timeout: c.rto });
        msg('Client', 'Server', `DATA seq=${s0} len=${n} (retransmit)`, 'swap');
        st('data', `Server sees seq ${s0} again but expects ${expected}: duplicate, ignored`);
        msg('Server', 'Client', `ACK ack=${s0 + n}`, 'found');
        st('dataack', `Server re-sends ACK ${s0 + n} without delivering the bytes twice`);
      } else {
        msg('Client', 'Server', `DATA seq=${s0} len=${n}${lost ? ' (retransmit)' : ''}`, lost ? 'swap' : 'active');
        expected = s0 + n;
        msg('Server', 'Client', `ACK ack=${s0 + n}`, 'found');
        st('dataack', `ACK ack = ${s0} + ${n} = ${s0 + n}: everything below ${s0 + n} has arrived`);
      }
      nextSeq = s0 + n;
      acks.push(s0 + n);
    });
    // 5. close
    cState = 'FIN_WAIT_1';
    msg('Client', 'Server', `FIN seq=${nextSeq}`, 'active');
    sState = 'CLOSE_WAIT';
    msg('Server', 'Client', `ACK ack=${nextSeq + 1}`, 'found');
    cState = 'FIN_WAIT_2';
    acks.push(nextSeq + 1);
    st('fin', `FIN also uses one sequence number, so its ACK is ${nextSeq} + 1 = ${nextSeq + 1}`);
    sState = 'LAST_ACK';
    msg('Server', 'Client', `FIN seq=${c.sIsn + 1}`, 'active');
    cState = 'TIME_WAIT';
    msg('Client', 'Server', `ACK ack=${c.sIsn + 2}`, 'found');
    sState = 'CLOSED';
    st('fin', 'Server FIN acknowledged: server CLOSED, client waits in TIME_WAIT before closing');
    const out: Out = { acks, retransmits, delay };
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const c = prep(input);
    // Independent formulation: cumulative sums and geometric series.
    const total = c.sizes.reduce((a, b) => a + b, 0);
    const prefix = c.sizes.map((_, i) => c.cIsn + 1 + c.sizes.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const geo = (k: number) => c.rto * (2 ** k - 1);
    const lostTotal = c.losses.reduce((a, b) => a + b, 0);
    const out: Out = {
      acks: [c.cIsn + 1, c.sIsn + 1, ...prefix, c.cIsn + 1 + total + 1],
      retransmits: c.synLost + lostTotal,
      delay: geo(c.synLost) + c.losses.reduce((a, k) => a + geo(k), 0),
    };
    return out;
  },
};


const unit: Unit = {
  id: 'net-tcp',
  hook: '"What happens when you type a URL?" always passes through TCP. Interviewers ask about the three-way handshake, what the numbers mean, and how TCP recovers from loss without the application noticing.',
  predict: {
    prompt: 'The client sends SYN with seq=1000. What ack number does the server put in its SYN-ACK?',
    options: ['1000: it echoes the sequence number', '1001: the SYN consumes one sequence number, so it expects 1001 next', '5000: the server\'s own sequence number', '1: connections always start counting from one'],
    answer: 1,
    explain: 'An ACK number names the next byte the sender expects. A SYN (and a FIN) occupy one sequence number even though they carry no data, so acknowledging seq=1000 yields ack=1001.',
  },
  viz,
  deeper: {
    points: [
      'The **three-way handshake** (SYN, SYN-ACK, ACK) lets both sides agree on initial sequence numbers (random, to avoid stale or spoofed segments) before any data moves.',
      '**seq** numbers the first byte of a segment; **ack** is cumulative: "I have everything up to, not including, this byte". SYN and FIN each consume one number.',
      'Lost segments are repaired by the sender: if no ACK arrives before the **retransmission timeout**, resend and double the timer (**exponential backoff**). Duplicate ACKs (three in a row) trigger **fast retransmit** without waiting.',
      'Receivers discard duplicates by sequence number and re-ACK, so a lost ACK looks like a lost segment to the sender but causes no corruption.',
      'Closing uses FIN/ACK in each direction; the side that closes first sits in **TIME_WAIT** to absorb stragglers. Flow control (receive window) and congestion control (slow start, AIMD) decide how much is in flight.',
    ],
    pitfalls: ['Treating ack as "the number I received" instead of "the next number I expect"', 'Forgetting that SYN and FIN use a sequence number', 'Blaming the server when TIME_WAIT sockets pile up on the side that closes first'],
  },
  practice: {
    language: 'python',
    fnName: 'tcp_acks',
    statement: 'Return the acknowledgement numbers of a connection, in order: the ack in the SYN-ACK, the ack in the final handshake ACK, one cumulative ack per data segment (sizes in `sizes`), and the ack for the client\'s FIN. The client\'s data starts right after its SYN.',
    signature: 'def tcp_acks(c_isn, s_isn, sizes):',
    solution: `def tcp_acks(c_isn, s_isn, sizes):
    seq = c_isn + @@1@@
    acks = [seq, s_isn + 1]
    for n in sizes:
        seq @@+=@@ n
        acks.append(seq)
    acks.append(@@seq + 1@@)
    return acks`,
    tests: [
      { args: [1000, 5000, [100, 50]], expected: [1001, 5001, 1101, 1151, 1152], name: 'two segments' },
      { args: [0, 0, [1]], expected: [1, 1, 2, 3], name: 'ISN zero' },
      { args: [7, 9, []], expected: [8, 10, 9], name: 'no data: FIN directly after handshake' },
      { args: [100, 200, [10, 10, 10]], expected: [101, 201, 111, 121, 131, 132], name: 'three equal segments' },
      { args: [5, 1, [1460]], expected: [6, 2, 1466, 1467], name: 'one full-size segment' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'handshake_acks',
    statement: 'The SYN-ACK and the final ACK use the wrong acknowledgement numbers, so the peer thinks nothing arrived. Fix `handshake_acks`, which returns `[ack in SYN-ACK, ack in final ACK]`.',
    buggy: `def handshake_acks(c_isn, s_isn):
    return [c_isn, s_isn]`,
    fixed: `def handshake_acks(c_isn, s_isn):
    return [c_isn + 1, s_isn + 1]`,
    tests: [
      { args: [1000, 5000], expected: [1001, 5001], name: 'typical ISNs' },
      { args: [0, 0], expected: [1, 1], name: 'zero ISNs' },
      { args: [42, 7], expected: [43, 8], name: 'asymmetric' },
    ],
    bugType: 'ack = seq instead of seq + 1',
    hint: 'An ACK names the next sequence number expected. How many numbers does a SYN consume?',
    explanation: 'Echoing the sequence number acknowledges only the byte before the SYN. A SYN occupies one sequence number, so the acknowledgement must be seq + 1.',
  },
  boss: {
    title: 'TCP session with timeouts and backoff',
    statement: 'Write `tcp(c_isn, s_isn, sizes, rto, syn_lost, losses)`. The client sends data segments of the given `sizes` right after the handshake. `syn_lost` is how many times the first handshake exchange fails (each costs one timeout), `losses[i]` how many times data segment i is lost before it gets through. A segment lost k times costs timeouts of `rto, 2*rto, 4*rto ...` (k terms) and k retransmissions; the same applies to the `syn_lost` handshake failures (counted from `rto` again). Return a dict with `acks` (the SYN-ACK ack, the final handshake ack, one cumulative ack per segment, then the FIN ack), `retransmits` (total retransmissions) and `delay` (total milliseconds spent waiting for timers).',
    language: 'python',
    fnName: 'tcp',
    starter: `def tcp(c_isn, s_isn, sizes, rto, syn_lost, losses):
    pass
`,
    solution: `def tcp(c_isn, s_isn, sizes, rto, syn_lost, losses):
    seq = c_isn + 1
    acks = [seq, s_isn + 1]
    delay = 0
    retransmits = syn_lost
    for k in range(syn_lost):
        delay += rto * 2 ** k
    for n, lost in zip(sizes, losses):
        for k in range(lost):
            delay += rto * 2 ** k
        retransmits += lost
        seq += n
        acks.append(seq)
    acks.append(seq + 1)
    return {"acks": acks, "retransmits": retransmits, "delay": delay}`,
    tests: [
      { args: [1000, 5000, [100, 50], 1000, 0, [0, 0]], expected: { acks: [1001, 5001, 1101, 1151, 1152], retransmits: 0, delay: 0 }, name: 'clean connection' },
      { args: [1000, 5000, [100], 1000, 0, [2]], expected: { acks: [1001, 5001, 1101, 1102], retransmits: 2, delay: 3000 }, name: 'lost twice: 1000 + 2000' },
      { args: [1000, 5000, [100], 1000, 1, [0]], expected: { acks: [1001, 5001, 1101, 1102], retransmits: 1, delay: 1000 }, name: 'SYN-ACK lost' },
      { args: [10, 20, [5, 5], 500, 0, [1, 3]], expected: { acks: [11, 21, 16, 21, 22], retransmits: 4, delay: 4000 }, name: 'backoff restarts for each segment: 500 + (500+1000+2000)' },
      { args: [0, 0, [1], 200, 2, [0]], expected: { acks: [1, 1, 2, 3], retransmits: 2, delay: 600 }, name: 'handshake lost twice: 200 + 400' },
      { args: [3, 3, [], 100, 0, []], expected: { acks: [4, 4, 5], retransmits: 0, delay: 0 }, name: 'no data' },
    ],
    hints: ['Cumulative acks: start with `seq = c_isn + 1`, add each segment size, and append the new `seq` after every segment; the FIN ack is `seq + 1`.', 'A segment lost k times waits `rto * 2**j` for j in range(k). The backoff resets for each new segment, and the same series applies to `syn_lost` using `rto` again.'],
    combines: ['net-dns', 'net-tls'],
  },
  quiz: [
    {
      prompt: 'The client retransmits a segment because the ACK was lost, so the server receives the same bytes twice. What does it do?',
      options: ['Delivers both copies to the application', 'Notices the sequence number is below what it expects, discards the copy and re-sends the ACK', 'Closes the connection', 'Asks for a new ISN'],
      answer: 1,
      explain: 'Sequence numbers let the receiver detect duplicates. It drops the repeated bytes but must still acknowledge them, otherwise the sender would keep retrying.',
    },
  ],
  simulationNote: 'A simplified model of TCP: one loss at a time, fixed timeout doubling, no windows, no congestion control and no real network.',
};

export default unit;
