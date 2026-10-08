// Minimal, dependency-free syntax highlighter for the read-only code panel.
import type { ReactNode } from 'react';

const PY_KW = new Set('def return if elif else while for in not and or is None True False class import from as with yield lambda try except finally raise pass break continue global nonlocal async await del assert'.split(' '));
const JS_KW = new Set('function return if else while for of in let const var new class extends import from export default true false null undefined this typeof instanceof async await yield try catch finally throw break continue switch case do delete void super'.split(' '));

const TOKEN = /(#.*$|\/\/.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/gm;

export function highlightLine(line: string, lang: string): ReactNode[] {
  const kw = lang === 'python' ? PY_KW : JS_KW;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let k = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok, com, str, num, ident] = m;
    if (com && (lang === 'python' ? com.startsWith('#') : com.startsWith('//'))) out.push(<span key={k++} className="tok-com">{tok}</span>);
    else if (com) out.push(tok);
    else if (str) out.push(<span key={k++} className="tok-str">{tok}</span>);
    else if (num) out.push(<span key={k++} className="tok-num">{tok}</span>);
    else if (ident && kw.has(ident)) out.push(<span key={k++} className="tok-kw">{tok}</span>);
    else if (ident && line[m.index + tok.length] === '(') out.push(<span key={k++} className="tok-fn">{tok}</span>);
    else out.push(tok);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
