import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, kvPanel, short, step, timelinePanel } from '@/content/lib/ai-finish-2';

const code = `
def consume(stream, on_text, cancel_after=None):
    text = ""
    for i, chunk in enumerate(stream):                               #@chunk
        if cancel_after is not None and i >= cancel_after:           #@cancel
            stream.close()                                           #@close
            break
        text += chunk                                                #@append
        on_text(text)                                                #@render
    return text                                                      #@done
`;

const WORDS = 'Streaming sends each token to the client as soon as it exists so people can start reading while the rest is still being generated'.split(' ');
const MODES = ['stream', 'blocking'];

interface In {
  tokens: number;
  ttft_ms: number;
  tokens_per_sec: number;
  cancel_at_ms: number;
  mode: string;
}

function clean(i: In) {
  const tokens = Math.round(Number(i.tokens));
  const ttft = Math.round(Number(i.ttft_ms));
  const tps = Number(i.tokens_per_sec);
  const cancel = Math.round(Number(i.cancel_at_ms) || 0);
  if (!Number.isFinite(tokens) || tokens < 1 || tokens > WORDS.length) throw new Error(`tokens must be between 1 and ${WORDS.length}.`);
  if (!Number.isFinite(ttft) || ttft < 0 || ttft > 5000) throw new Error('ttft_ms must be between 0 and 5000.');
  if (!Number.isFinite(tps) || tps < 1 || tps > 200) throw new Error('tokens_per_sec must be between 1 and 200.');
  if (cancel < 0) throw new Error('cancel_at_ms must be 0 (never) or positive.');
  if (!MODES.includes(i.mode)) throw new Error('mode must be stream or blocking.');
  const times = Array.from({ length: tokens }, (_, k) => Math.round(ttft + (k * 1000) / tps));
  return { tokens, ttft, tps, cancel, mode: i.mode, times };
}

function outcome(c: ReturnType<typeof clean>) {
  const last = c.times[c.tokens - 1];
  const cancelled = c.cancel > 0 && c.cancel < last;
  const generated = cancelled ? c.times.filter((t) => t <= c.cancel).length : c.tokens;
  const shown = c.mode === 'stream' ? generated : cancelled ? 0 : c.tokens;
  const firstVisible = c.mode === 'stream' ? (generated > 0 ? c.times[0] : null) : cancelled ? null : last;
  return { first_visible_ms: firstVisible, finished_ms: cancelled ? c.cancel : last, generated, shown, saved_tokens: c.tokens - generated };
}

const viz: VizDef<In> = {
  id: 'ai-streaming',
  title: 'Streaming, time to first token and cancel',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'Delivery', kind: 'select', options: MODES, default: 'stream' },
    { key: 'tokens', label: 'Response length (tokens)', kind: 'number', default: 12 },
    { key: 'ttft_ms', label: 'Time to first token (ms)', kind: 'number', default: 400 },
    { key: 'tokens_per_sec', label: 'Tokens per second', kind: 'number', default: 20 },
    { key: 'cancel_at_ms', label: 'User cancels at (ms, 0 = never)', kind: 'number', default: 0 },
  ],
  presets: [
    { label: 'Streaming', input: { mode: 'stream' } },
    { label: 'Blocking (no streaming)', input: { mode: 'blocking' } },
    { label: 'Cancel mid-stream', input: { mode: 'stream', cancel_at_ms: 800 } },
    { label: 'Cancel a blocking call', input: { mode: 'blocking', cancel_at_ms: 800 } },
  ],
  run(input) {
    const c = clean(input);
    const out = outcome(c);
    const r = new Recorder(code);
    const last = c.times[c.tokens - 1];
    const tMax = Math.max(last, c.cancel || 0) + 100;
    const gen: { t: number; label: string; tone: Tone }[] = [];
    const ui: { t: number; label: string; tone: Tone }[] = [];
    let shownText = '';
    const view = (now: number, extra: Panel[] = []): Panel[] => [
      timelinePanel(
        c.mode === 'stream' ? 'Server generates, client renders as it arrives' : 'Server generates, client waits for the whole body',
        [
          { label: 'server', events: [{ t: 0, dur: c.ttft, label: 'prefill', tone: 'compare' }, ...gen] },
          { label: 'client UI', events: ui },
        ],
        tMax,
        now,
      ),
      { type: 'log', title: 'Text on screen', lines: [{ text: shownText ? short(shownText, 80) : '(nothing yet)', tone: shownText ? 'found' : 'muted' }] },
      ...extra,
    ];
    step(r, 'chunk', `Request sent. The model must read the prompt first: first token after ${c.ttft} ms`, view(0), { mode: c.mode, ttft_ms: c.ttft });
    for (let i = 0; i < out.generated; i++) {
      r.op();
      const t = c.times[i];
      gen.push({ t, label: String(i + 1), tone: 'active' });
      if (c.mode === 'stream') {
        shownText += (i ? ' ' : '') + WORDS[i];
        ui.push({ t, label: WORDS[i], tone: 'found' });
        step(r, i === 0 ? 'render' : 'append', i === 0 ? `t=${t} ms: first token "${WORDS[i]}" is already on screen` : `t=${t} ms: token ${i + 1} "${short(WORDS[i], 14)}" appended to the screen`, view(t), { tokens_shown: i + 1, t });
      } else {
        step(r, 'chunk', `t=${t} ms: token ${i + 1} generated, but the client sees nothing yet`, view(t), { tokens_shown: 0, t });
      }
    }
    if (out.saved_tokens > 0) {
      step(r, 'close', `t=${c.cancel} ms: client closes the stream; ${out.saved_tokens} tokens are never generated or billed`, view(c.cancel, [kvPanel('Cancelled', { generated: out.generated, saved: out.saved_tokens, 'on screen': out.shown }, { saved: 'found' })]), { cancelled: true });
      if (c.mode === 'blocking') step(r, 'done', 'A blocking call has nothing to show: the generated tokens were wasted', view(c.cancel), { tokens_shown: 0 });
    } else if (c.mode === 'blocking') {
      WORDS.slice(0, c.tokens).forEach((w, i) => (shownText += (i ? ' ' : '') + w));
      ui.push({ t: last, label: 'full text', tone: 'found' });
      step(r, 'render', `t=${last} ms: the complete body arrives and everything appears at once`, view(last), { tokens_shown: c.tokens });
    } else {
      step(r, 'done', `Stream ends at t=${last} ms; the user has been reading since t=${c.times[0]} ms`, view(last), { tokens_shown: c.tokens });
    }
    step(r, 'done', `First text visible: ${out.first_visible_ms ?? 'never'} ms; finished at ${out.finished_ms} ms`, view(out.finished_ms, [kvPanel('Perceived latency', { 'first visible (ms)': out.first_visible_ms ?? 'never', 'finished (ms)': out.finished_ms, 'tokens on screen': out.shown }, { 'first visible (ms)': c.mode === 'stream' ? 'found' : 'default' })]), { first_visible: out.first_visible_ms });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const c = clean(input);
    return outcome(c);
  },
};

const RENDER_OK = `def render_stream(stream, on_update):
    text = ""
    pending = None
    for chunk in stream:
        if pending is not None:
            text += pending
            on_update(text)
        pending = chunk
    if pending is not None:
        text += pending
        on_update(text)
    return text`;

const STREAM_HARNESS = `
from minillm import MockLLM

def run_collect(fn, text, max_chunks=None):
    return fn(MockLLM({"*": text}).stream("go"), max_chunks)

def run_render(fn, text):
    updates = []
    out = fn(MockLLM({"*": text}).stream("go"), updates.append)
    return {"out": out, "updates": updates}
`;

const unit: Unit = {
  id: 'ai-streaming',
  hook: 'Streaming turns a 6-second wait into text that starts in half a second. Interviewers ask about time to first token, how to consume a stream without losing chunks, and how cancellation saves money.',
  predict: {
    prompt: 'A response takes 6 seconds to generate, but the first token is ready after 0.5 s. With streaming, when does the user start reading?',
    options: ['After 6 s, when it is complete', 'After about 0.5 s, when the first token arrives', 'After 3 s, halfway', 'Streaming does not change when the user sees text'],
    answer: 1,
    explain: 'Perceived latency is time to first token. Total generation time is unchanged, but the user is reading while the rest is produced.',
  },
  viz,
  deeper: {
    points: [
      'Streaming sends partial output as it is produced (server-sent events or chunked HTTP); the client appends each piece.',
      'Time to first token (TTFT) depends on prompt length and queueing; tokens per second depends on the model. Measure both.',
      'Cancellation: when the user navigates away or presses stop, close the connection so the provider stops generating and billing.',
      'Consumers must flush the final chunk, handle a stream that ends mid-event, and still produce a complete, validated result for the backend.',
      'Streaming is awkward with structured output and tool calls: you may need to buffer until the JSON or call is complete.',
    ],
    pitfalls: ['Dropping the last buffered chunk', 'Not closing the stream on cancel', 'Parsing JSON from a partial stream'],
  },
  practice: {
    language: 'python',
    fnName: 'collect',
    statement: 'collect(stream, max_chunks=None) joins the chunks of a stream. It returns {"text", "chunks", "cancelled"}. If max_chunks is not None and another chunk arrives after max_chunks have been taken, call stream.close() and return with cancelled True; otherwise cancelled is False.',
    signature: 'def collect(stream, max_chunks=None):',
    solution: `def collect(stream, max_chunks=None):
    text = ""
    chunks = 0
    for chunk in stream:
        if @@max_chunks is not None and chunks >= max_chunks@@:
            stream.close()
            return {"text": text, "chunks": chunks, "cancelled": True}
        text += @@chunk@@
        chunks += 1
    return {"text": text, "chunks": chunks, "cancelled": @@False@@}`,
    harness: STREAM_HARNESS,
    adapter: 'run_collect',
    tests: [
      { args: ['Hello big world'], expected: { text: 'Hello big world', chunks: 3, cancelled: false }, name: 'whole stream' },
      { args: ['Hello big world', 2], expected: { text: 'Hello big ', chunks: 2, cancelled: true }, name: 'cancel after two chunks' },
      { args: ['Hello big world', 3], expected: { text: 'Hello big world', chunks: 3, cancelled: false }, name: 'limit equals length: not cancelled' },
      { args: ['Hello big world', 0], expected: { text: '', chunks: 0, cancelled: true }, name: 'cancel immediately' },
      { args: [''], expected: { text: '', chunks: 0, cancelled: false }, name: 'empty stream' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'render_stream',
    harness: STREAM_HARNESS,
    adapter: 'run_render',
    statement: 'render_stream(stream, on_update) appends every chunk and calls on_update(text_so_far) after each one, then returns the full text. It looks one chunk ahead, but the last chunk never reaches the screen.',
    buggy: RENDER_OK.replace('    if pending is not None:\n        text += pending\n        on_update(text)\n    return text', '    return text'),
    fixed: RENDER_OK,
    tests: [
      { args: ['Hello big world'], expected: { out: 'Hello big world', updates: ['Hello ', 'Hello big ', 'Hello big world'] }, name: 'three chunks' },
      { args: ['Hi'], expected: { out: 'Hi', updates: ['Hi'] }, name: 'single chunk' },
      { args: [''], expected: { out: '', updates: [] }, name: 'empty stream' },
    ],
    bugType: 'dropping the last chunk',
    hint: 'The loop writes the previous chunk when a new one arrives. What happens to the chunk that has no successor?',
    explanation: 'With the look-ahead buffer, the final chunk stays in "pending" when the loop ends. Flush it after the loop (and update the UI) or the answer is cut off.',
  },
  boss: {
    title: 'Server-sent events parser',
    statement: 'Write parse_sse(raw). raw is the text of an SSE stream. Events are separated by a blank line. Inside an event, a line "data:<value>" contributes <value> (drop one leading space); several data lines are joined with "\\n". Lines starting with ":" and other fields (event:, id:) are ignored; events with no data lines are skipped. Normalise "\\r\\n" to "\\n". An event whose payload is "[DONE]" ends parsing and is not returned. The last event counts even without a trailing blank line. Return the list of payload strings.',
    language: 'python',
    fnName: 'parse_sse',
    starter: `def parse_sse(raw):
    # your code here
    pass
`,
    solution: `def parse_sse(raw):
    events = []
    for block in raw.replace("\\r\\n", "\\n").split("\\n\\n"):
        data = []
        for line in block.split("\\n"):
            if line.startswith("data:"):
                value = line[5:]
                if value.startswith(" "):
                    value = value[1:]
                data.append(value)
        if not data:
            continue
        payload = "\\n".join(data)
        if payload == "[DONE]":
            break
        events.append(payload)
    return events`,
    tests: [
      { args: ['data: Hello\n\ndata: world\n\n'], expected: ['Hello', 'world'], name: 'two events' },
      { args: ['data: Hello\n\ndata: world'], expected: ['Hello', 'world'], name: 'last event without trailing blank line' },
      { args: ['data: line1\ndata: line2\n\n'], expected: ['line1\nline2'], name: 'multi-line data' },
      { args: [': keep-alive\n\nevent: token\nid: 7\ndata: hi\n\n'], expected: ['hi'], name: 'comments and other fields ignored' },
      { args: ['data: a\n\ndata: [DONE]\n\ndata: ignored\n\n'], expected: ['a'], name: '[DONE] ends the stream' },
      { args: ['data: a\r\n\r\ndata: b\r\n\r\n'], expected: ['a', 'b'], name: 'CRLF line endings' },
      { args: ['data:nospace\n\n'], expected: ['nospace'], name: 'no space after the colon' },
      { args: [''], expected: [], name: 'empty input' },
    ],
    hints: ['Replace "\\r\\n" with "\\n", then split the text on "\\n\\n" to get one block per event.', 'Collect the data lines of each block, join them with "\\n", skip empty blocks, and stop at the payload "[DONE]".'],
    combines: ['mcp-transports'],
  },
  quiz: [
    {
      prompt: 'What does cancelling a streaming request (closing the connection) usually buy you?',
      options: ['Nothing; the model finishes anyway', 'The provider stops generating, so you stop paying for the remaining output tokens', 'A faster first token', 'Higher quality'],
      answer: 1,
      explain: 'Most providers stop generation when the client disconnects, and unproduced tokens are not billed. A blocking call cannot be partially used or cancelled usefully.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
