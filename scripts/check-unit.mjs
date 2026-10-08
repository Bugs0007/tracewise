// Validate specific units: npm run check:unit -- binary-search,bfs
import { spawnSync } from 'node:child_process';

const ids = process.argv.slice(2).join(',').trim();
if (!ids) {
  console.error('usage: npm run check:unit -- <unit-id>[,<unit-id>...]');
  process.exit(2);
}
const r = spawnSync('npx', ['vitest', 'run', 'src/content/content.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, UNITS: ids },
});
process.exit(r.status ?? 1);
