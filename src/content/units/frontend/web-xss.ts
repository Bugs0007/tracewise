import { Recorder } from '@/engine/recorder';
import type { KVPanel, LogPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq } from '@/content/lib/backend-db-auth';
import { escapeHtmlTs, scanHtml, scriptFindings } from '@/content/lib/frontend-css-web';
import { clip } from '@/content/lib/finish-m2m3';

const code = `
// Vulnerable: untrusted text is glued into markup
res.send('<p>Hello ' + req.query.name + '</p>');                    //@raw
// Fixed: escape on output, for the HTML context
res.send('<p>Hello ' + escapeHtml(req.query.name) + '</p>');       //@escaped

// DOM XSS: the browser's own code writes the markup
box.innerHTML = location.hash.slice(1);                             //@innerHTML
box.textContent = location.hash.slice(1);                           //@textContent

// Defence in depth: refuse inline scripts and handlers
// Content-Security-Policy: script-src 'self'                        //@csp
`;

const KINDS = ['stored', 'reflected', 'DOM'];
const MODES = ['raw HTML', 'raw HTML + CSP', 'escaped text'];
const PAYLOADS = ['<img src=x onerror=alert(1)>', '<script>steal()</script>', '<a href="javascript:alert(1)">win a prize</a>', '<b>bold</b>', 'Ada'];

interface In {
  kind: string;
  mode: string;
  payload: string;
}

interface Out {
  injected: boolean;
  executed: boolean;
  findings: string[];
}

const viz: VizDef<In> = {
  id: 'web-xss',
  title: 'XSS: untrusted text becoming code',
  code,
  language: 'javascript',
  inputs: [
    { key: 'kind', label: 'Type of XSS', kind: 'select', options: KINDS, default: 'reflected' },
    { key: 'mode', label: 'How the page renders it', kind: 'select', options: MODES, default: 'raw HTML' },
    { key: 'payload', label: 'Attacker input', kind: 'string', default: PAYLOADS[0], maxItems: 60 },
  ],
  presets: [
    { label: 'Reflected, raw', input: { kind: 'reflected', mode: 'raw HTML', payload: PAYLOADS[0] } },
    { label: 'Stored, raw <script>', input: { kind: 'stored', mode: 'raw HTML', payload: PAYLOADS[1] } },
    { label: 'DOM via innerHTML', input: { kind: 'DOM', mode: 'raw HTML', payload: PAYLOADS[1] } },
    { label: 'Escaped output', input: { kind: 'stored', mode: 'escaped text', payload: PAYLOADS[1] } },
    { label: 'CSP as a safety net', input: { kind: 'reflected', mode: 'raw HTML + CSP', payload: PAYLOADS[2] } },
    { label: 'Harmless markup', input: { kind: 'stored', mode: 'raw HTML', payload: PAYLOADS[3] } },
  ],
  run({ kind, mode, payload }) {
    if (!KINDS.includes(kind)) throw new Error('kind must be one of ' + KINDS.join(' | '));
    if (!MODES.includes(mode)) throw new Error('mode must be one of ' + MODES.join(' | '));
    const r = new Recorder(code);
    const seq = new Seq(['Attacker', 'Victim browser', 'Server'], `${kind} XSS, ${mode}`);
    const dom = kind === 'DOM';
    const escaped = mode === 'escaped text';
    const csp = mode.endsWith('CSP');
    let html = '';
    const lines: LogPanel['lines'] = [];
    const markup = (): KVPanel => ({ type: 'kv', title: dom ? 'Result of box.innerHTML / textContent' : 'HTML the server sends', entries: [{ k: 'markup', v: html ? clip(html, 70) : '(not built yet)', tone: (html ? 'compare' : 'muted') as Tone }] });
    const view = (): Panel[] => [seq.panel(), markup(), { type: 'log', title: 'Browser parser', lines: [...lines] }];

    r.step(undefined, clip(`Attacker input: ${payload}`), view(), { kind, mode });
    if (kind === 'stored') {
      seq.send('Attacker', 'Server', 'POST /comments  ' + clip(payload, 22));
      r.step(undefined, 'Stored XSS: the payload is saved (a comment, a profile field)', view(), { stored: true });
      seq.send('Victim browser', 'Server', 'GET /post (any visitor)');
    } else if (kind === 'reflected') {
      seq.send('Attacker', 'Victim browser', 'link: /search?q=' + clip(payload, 18), 'error');
      r.step(undefined, 'Reflected XSS: the attacker sends a crafted link; the victim clicks it', view(), { linkSent: true });
      seq.send('Victim browser', 'Server', 'GET /search?q=<payload>');
    } else {
      seq.send('Attacker', 'Victim browser', 'link: /#' + clip(payload, 18), 'error');
      r.step(undefined, 'DOM XSS: the payload sits in the URL fragment, which is never sent to the server', view(), { linkSent: true });
      seq.send('Victim browser', 'Server', 'GET /  (fragment not included)');
    }
    html = escaped ? escapeHtmlTs(payload) : payload;
    r.op();
    if (dom) {
      seq.send('Server', 'Victim browser', '200 static page + script', 'done', true);
      r.step(escaped ? 'textContent' : 'innerHTML', clip(escaped ? 'Client code uses textContent: the payload is inserted as plain text' : 'Client code puts location.hash into innerHTML: it is parsed as markup'), view(), { sink: escaped ? 'textContent' : 'innerHTML' });
    } else {
      seq.send('Server', 'Victim browser', '200 <p>Hello ' + clip(html, 20) + '</p>', escaped ? 'done' : 'error', true);
      r.step(escaped ? 'escaped' : 'raw', clip(escaped ? 'The server escapes < > & " \' so the payload becomes harmless text' : 'The server concatenates the payload into the HTML unchanged'), view(), { escaped });
    }
    const tokens = scanHtml(html);
    const tags = tokens.filter((t) => t.kind === 'tag' && !t.closing);
    const found = scriptFindings(tokens);
    for (const t of tags) if (t.kind === 'tag') lines.push({ text: `tag <${t.name}>` + (t.attrs.length ? ' with ' + t.attrs.map((a) => a.name).join(', ') : ''), tone: 'compare' });
    for (const f of found) lines.push({ text: `${f.kind} at ${f.where}`, tone: 'error' });
    if (!lines.length) lines.push({ text: 'only text, no tags', tone: 'done' });
    r.step(undefined, clip(tags.length ? `The parser builds ${tags.length} element(s) from the response` : 'The parser sees only text: nothing to execute'), view(), { tags: tags.length, scriptLike: found.length });
    // innerHTML never runs <script> elements, but handlers and javascript: URLs still work
    const runnable = found.filter((f) => !(dom && f.kind === 'script-tag'));
    if (dom && found.some((f) => f.kind === 'script-tag')) {
      lines.push({ text: 'innerHTML does not run inserted <script> elements', tone: 'muted' });
      r.step('innerHTML', 'Scripts inserted through innerHTML are inert, but event handlers still fire', view(), { runnable: runnable.length });
    }
    let executed = runnable.length > 0;
    if (executed && csp) {
      lines.push({ text: "CSP script-src 'self' blocks inline script, handlers and javascript: URLs", tone: 'done' });
      executed = false;
      r.step('csp', 'The Content-Security-Policy blocks inline code: the injection happens but nothing runs', view(), { blocked: true });
    }
    const out: Out = { injected: tags.length > 0, executed, findings: found.map((f) => f.kind).sort() };
    r.step(undefined, clip(executed ? 'The attacker script runs with the site\'s privileges: cookies, DOM, requests' : out.injected ? 'Markup was injected, but no script runs here' : 'Safe: the input stayed text'), [seq.panel(), markup(), { type: 'log', title: 'Browser parser', lines: [...lines] }, { type: 'note', text: executed ? 'It could read tokens, change the page or act as the user.' : 'Escaping on output is the real fix; CSP is a second layer.', tone: executed ? 'error' : 'found' }], { ...out, findings: out.findings.length });
    return { frames: r.frames, result: out };
  },
  reference({ kind, mode, payload }) {
    const escaped = mode === 'escaped text';
    const csp = mode.endsWith('CSP');
    if (escaped) return { injected: false, executed: false, findings: [] };
    const kinds: string[] = [];
    if (/<script/i.test(payload)) kinds.push('script-tag');
    if (/<[a-z][^>]*\son\w+\s*=/i.test(payload)) kinds.push('event-handler');
    if (/<[a-z][^>]*(href|src|action)\s*=\s*"?javascript:/i.test(payload)) kinds.push('javascript-url');
    const hasTag = /<[a-zA-Z]/.test(payload);
    const runs = kinds.some((k) => !(kind === 'DOM' && k === 'script-tag'));
    return { injected: hasTag, executed: runs && !csp, findings: kinds.sort() };
  },
};

const TEMPLATE_CASES = [
  { args: ['Hi {{ name }}!', { name: 'Ada' }], expected: 'Hi Ada!', name: 'plain value' },
  { args: ['{{name}}', { name: '<b>x</b>' }], expected: '&lt;b&gt;x&lt;/b&gt;', name: 'markup is escaped' },
  { args: ['{{{ html }}}', { html: '<b>ok</b>' }], expected: '<b>ok</b>', name: 'triple braces are trusted' },
  { args: ['{{ user.name }} ({{ user.age }})', { user: { name: 'Bo', age: 7 } }], expected: 'Bo (7)', name: 'dotted paths and numbers' },
  { args: ['[{{ missing }}][{{ a.b }}]', { a: null }], expected: '[][]', name: 'missing values are empty' },
  { args: ['{{ a }}', { a: '{{ b }}', b: 'SECRET' }], expected: '{{ b }}', name: 'data is never re-interpreted' },
  { args: ['<a title="{{ t }}">', { t: '" onmouseover="x' }], expected: '<a title="&quot; onmouseover=&quot;x">', name: 'quotes cannot break out of an attribute' },
];

const unit: Unit = {
  id: 'web-xss',
  hook: 'XSS is the vulnerability behind most front-end security questions. Interviewers want the three flavours (stored, reflected, DOM), the root cause (untrusted input interpreted as code) and the fix hierarchy: escape on output, avoid raw HTML sinks, add CSP.',
  predict: {
    prompt: 'A page does `box.innerHTML = location.hash.slice(1)` and the hash is `#<script>alert(1)</script>`. Does the alert run?',
    options: ['Yes, innerHTML always runs scripts', 'No: scripts inserted with innerHTML do not execute (but an <img onerror> would)', 'No, because the hash is never read by JavaScript', 'Only in older browsers, never in modern ones'],
    answer: 1,
    explain: 'The HTML spec makes <script> elements inserted through innerHTML inert. That is why attackers use <img src=x onerror=...> or similar. The sink is still dangerous, which is why textContent is preferred for plain text.',
  },
  simulationNote: 'The parser is a small tokenizer that spots scripts, event handlers and javascript: URLs. Real browsers have many more injection routes.',
  viz,
  deeper: {
    points: [
      'Root cause: data and code share one channel. Untrusted text placed into HTML, an attribute, a URL or a script is interpreted by the parser as structure.',
      'Stored XSS is saved and hits every visitor, reflected XSS rides in a link the victim clicks, DOM XSS happens entirely in client code (innerHTML, document.write, eval).',
      'Escape on OUTPUT for the exact context: HTML text needs & < > escaped, attributes also need quotes, URLs need scheme validation, scripts and CSS need other rules. Frameworks like React escape text for you.',
      'Dangerous sinks to avoid or guard: innerHTML, outerHTML, document.write, dangerouslySetInnerHTML, javascript: URLs, eval and string-based setTimeout.',
      'When you must render user HTML (rich text), sanitise it with a vetted allow-list library, not regexes.',
      'Content-Security-Policy (e.g. script-src \'self\') blocks inline scripts and handlers and turns many XSS bugs into harmless markup. HttpOnly cookies limit what a successful script can steal.',
    ],
    pitfalls: ['Escaping on input instead of output', 'Using one escaping function for HTML, attributes and URLs alike', 'Trusting "sanitised" data stored earlier and rendering it with raw HTML', 'Relying on CSP while leaving the bug in place'],
  },
  practice: {
    language: 'javascript',
    fnName: 'escapeHtml',
    statement: 'Write `escapeHtml(value)` that converts the value to a string and escapes `&`, `<`, `>`, `"` and `\'` into `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&#39;` so it is safe in HTML text and in quoted attributes. The order matters.',
    signature: 'function escapeHtml(value) {',
    solution: `function escapeHtml(value) {
  return String(value)
    .replace(/&/g, @@'&amp;'@@)
    .replace(/</g, @@'&lt;'@@)
    .replace(/>/g, '&gt;')
    .replace(/"/g, @@'&quot;'@@)
    .replace(/'/g, @@'&#39;'@@);
}`,
    tests: [
      { args: ['<script>alert(1)</script>'], expected: '&lt;script&gt;alert(1)&lt;/script&gt;', name: 'script tag' },
      { args: ['Tom & Jerry'], expected: 'Tom &amp; Jerry', name: 'ampersand' },
      { args: ['&lt;'], expected: '&amp;lt;', name: 'already-escaped text is escaped again' },
      { args: ['say "hi" and \'bye\''], expected: 'say &quot;hi&quot; and &#39;bye&#39;', name: 'quotes' },
      { args: [''], expected: '', name: 'empty string' },
      { args: [42], expected: '42', name: 'numbers become strings' },
      { args: ['<img src=x onerror="a(\'b\')">'], expected: '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;', name: 'handler payload' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'escapeHtml',
    statement: '`escapeHtml("<b>")` returns `&amp;lt;b&amp;gt;`, a double-escaped mess that shows up as visible entities on the page. Fix the function.',
    buggy: `function escapeHtml(value) {
  return String(value)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/&/g, '&amp;');
}`,
    fixed: `function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}`,
    tests: [
      { args: ['<b>'], expected: '&lt;b&gt;', name: 'single pass' },
      { args: ['a & b'], expected: 'a &amp; b', name: 'ampersand' },
      { args: ['"quoted"'], expected: '&quot;quoted&quot;', name: 'quotes' },
      { args: ['plain'], expected: 'plain', name: 'plain text' },
    ],
    bugType: 'escaping order',
    hint: 'The entities you create contain "&" themselves. When is it safe to replace "&"?',
    explanation: 'Replacing & last escapes the ampersands that the earlier replacements just produced, so &lt; becomes &amp;lt;. Escape & first, then the characters whose replacements contain &.',
  },
  boss: {
    title: 'A safe template renderer',
    statement: 'Write `render(template, data)`. `{{ path }}` inserts the value at `path` (dotted, e.g. `user.name`) escaped for HTML (`& < > " \'`). `{{{ path }}}` inserts it unescaped. Whitespace inside the braces is allowed. Missing, `null` or `undefined` values give an empty string; numbers and booleans become text. Substitution happens in ONE pass: text coming from `data` is never scanned for more placeholders.',
    language: 'javascript',
    fnName: 'render',
    starter: `function render(template, data) {
  // your code here
}
`,
    solution: `function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(template, data) {
  const lookup = (path) => {
    let value = data;
    for (const key of path.split('.')) {
      if (value === null || value === undefined) return '';
      value = value[key];
    }
    return value === null || value === undefined ? '' : String(value);
  };
  return template.replace(/\\{\\{\\{\\s*([\\w.]+)\\s*\\}\\}\\}|\\{\\{\\s*([\\w.]+)\\s*\\}\\}/g, (match, raw, safe) => (raw ? lookup(raw) : escapeHtml(lookup(safe))));
}`,
    tests: TEMPLATE_CASES,
    hints: ['One String.replace with a regex that has two alternatives: triple braces (raw) and double braces (escaped). Put the triple-brace alternative first so it wins.', 'Write a lookup that walks the dotted path and returns "" for null/undefined at any step. The replace callback returns lookup(raw) or escapeHtml(lookup(safe)); a single pass means data is never re-scanned.'],
    combines: ['dom-events'],
  },
  quiz: [
    {
      prompt: 'Which choice best prevents DOM XSS when showing a user\'s name inside a <span>?',
      options: ['span.innerHTML = name', 'span.textContent = name', 'span.innerHTML = name.toLowerCase()', 'eval("span.innerText = \'" + name + "\'")'],
      answer: 1,
      explain: 'textContent inserts the value as text and never parses markup. The other options either parse HTML or build code from untrusted data.',
    },
  ],
};

export default unit;
