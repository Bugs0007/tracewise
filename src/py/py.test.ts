// Runs the Python teaching libraries' own unit tests (src/py/tests) with local CPython.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function python(): string {
  for (const c of ['python3', 'python']) {
    try {
      if (/Python 3\.(1[1-9]|[2-9]\d)/.test(execFileSync(c, ['--version'], { encoding: 'utf8' }))) return c;
    } catch {}
  }
  throw new Error('Python 3.11+ required');
}

it('python teaching libraries pass their unit tests', () => {
  const root = process.cwd();
  let out = '';
  let ok = true;
  try {
    out = execFileSync(python(), ['-m', 'unittest', 'discover', '-s', join(root, 'src/py/tests')], {
      env: { ...process.env, PYTHONPATH: join(root, 'src/py'), PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e: any) {
    ok = false;
    out = String(e.stderr ?? e.message);
  }
  expect(ok, out).toBe(true);
});
