import { parse } from 'acorn';

const LOOPS = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);

/**
 * Insert `__guard()` at the top of every loop body so code running on a shared
 * thread (the React iframe) throws instead of hanging forever.
 * Works on already-transpiled JS. Returns the original code if it can't parse.
 */
export function addLoopGuards(code: string, guard = '__guard()'): string {
  let ast: any;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  } catch {
    return code;
  }
  const inserts: { at: number; text: string }[] = [];
  const visit = (node: any) => {
    if (!node || typeof node.type !== 'string') return;
    if (LOOPS.has(node.type)) {
      const body = node.body;
      if (body.type === 'BlockStatement') inserts.push({ at: body.start + 1, text: `${guard};` });
      else {
        inserts.push({ at: body.start, text: `{${guard};` });
        inserts.push({ at: body.end, text: '}' });
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  inserts.sort((a, b) => b.at - a.at);
  let out = code;
  for (const { at, text } of inserts) out = out.slice(0, at) + text + out.slice(at);
  return out;
}
