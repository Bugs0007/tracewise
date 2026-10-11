// Renders a model reply as text only: fenced code, bullet and numbered lists, paragraphs, `code` and **bold**.
// Nothing is ever injected as HTML, so a reply cannot add markup or scripts to the page.
import { CodeBlock, Md } from '@/ui/common';

type Block = { kind: 'code'; lang: string; text: string } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] } | { kind: 'p'; text: string };

export function parseReply(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      // an unterminated fence (the reply is still streaming) is shown as code so far
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', lang: fence[1] || 'python', text: body.join('\n') });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push({ kind: 'ol', items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push({ kind: 'p', text: para.join(' ').replace(/^#{1,6}\s+/, '') });
  }
  return blocks;
}

export function Reply({ text }: { text: string }) {
  const blocks = parseReply(text);
  return (
    <div className="ai-reply">
      {blocks.map((b, i) =>
        b.kind === 'code' ? (
          <CodeBlock key={i} code={b.text} lang={b.lang === 'js' || b.lang === 'javascript' || b.lang === 'typescript' ? 'javascript' : 'python'} />
        ) : b.kind === 'p' ? (
          <p key={i}>
            <Md text={b.text} />
          </p>
        ) : b.kind === 'ul' ? (
          <ul key={i}>
            {b.items.map((t, j) => (
              <li key={j}>
                <Md text={t} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((t, j) => (
              <li key={j}>
                <Md text={t} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
