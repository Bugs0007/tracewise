// Copies the self-hosted Pyodide runtime from node_modules into public/pyodide
// so the app never depends on a third-party CDN and can work offline.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pyodide');
const dest = join(root, 'public', 'pyodide');

if (!existsSync(src)) {
  console.warn('[copy-pyodide] pyodide package not installed; skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
const wanted = /\.(mjs|js|wasm|zip|json)$/;
let n = 0;
for (const f of readdirSync(src)) {
  if (!wanted.test(f) || f === 'package.json' || f.endsWith('.d.ts')) continue;
  cpSync(join(src, f), join(dest, f));
  n++;
}
console.log(`[copy-pyodide] copied ${n} files to public/pyodide`);
