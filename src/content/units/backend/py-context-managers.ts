import { Recorder } from '@/engine/recorder';
import type { Panel, SequenceMessage, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, logPanel } from '@/content/lib/backend-python';

const code = `
class Managed:
    def __init__(self, suppress):
        self.suppress = suppress
    def __enter__(self):                          #@enter
        print('enter')
        return self
    def __exit__(self, exc_type, exc, tb):        #@exit
        print('exit', exc_type)
        return self.suppress                      #@ret

def demo(fail, suppress):
    with Managed(suppress) as m:                  #@with
        print('body')                             #@body
        if fail:
            raise ValueError('boom')              #@raise
    print('after')                                #@after
`;

interface In {
  fail: string;
  suppress: string;
}

const EXC = "<class 'ValueError'>";

function simulate(fail: boolean, suppress: boolean): string[] {
  // independent straight-line model of what demo() prints
  const out = ['enter', 'body'];
  out.push(`exit ${fail ? EXC : 'None'}`);
  if (!fail || suppress) out.push('after');
  else out.push('ValueError: boom propagates');
  return out;
}

const viz: VizDef<In> = {
  id: 'py-context-managers',
  title: 'What `with` calls, in order',
  code,
  language: 'python',
  inputs: [
    { key: 'fail', label: 'Body raises?', kind: 'select', default: 'no', options: ['no', 'yes'] },
    { key: 'suppress', label: '__exit__ returns True?', kind: 'select', default: 'no', options: ['no', 'yes'] },
  ],
  presets: [
    { label: 'Clean body', input: { fail: 'no', suppress: 'no' } },
    { label: 'Raises, propagates', input: { fail: 'yes', suppress: 'no' } },
    { label: 'Raises, swallowed', input: { fail: 'yes', suppress: 'yes' } },
  ],
  run({ fail: f, suppress: sp }) {
    const fail = f === 'yes';
    const suppress = sp === 'yes';
    const r = new Recorder(code);
    const actors = ['demo()', 'with', 'Managed', 'body'];
    const msgs: SequenceMessage[] = [];
    const out: string[] = [];
    const panels = (): Panel[] => [{ type: 'sequence', title: 'Who calls whom', actors, messages: msgs, active: msgs.length - 1 }, logPanel(out, 'Printed output', out.length > 0)];
    const vars = (extra: Record<string, unknown> = {}) => ({ fail, suppress, ...extra });

    msgs.push({ from: 'demo()', to: 'with', label: 'with Managed(...) as m' });
    msgs.push({ from: 'with', to: 'Managed', label: 'Managed(suppress)' });
    r.step('with', cap('The expression after `with` is evaluated first: a Managed object is built'), panels(), vars());
    msgs.push({ from: 'with', to: 'Managed', label: '__enter__()', tone: 'active' });
    out.push('enter');
    r.step('enter', cap('with calls __enter__() before the body starts: prints enter'), panels(), vars());
    msgs.push({ from: 'Managed', to: 'with', label: 'returns self → m', dashed: true });
    r.step('enter', cap('The value returned by __enter__ is bound to the name after `as`'), panels(), vars());
    msgs.push({ from: 'with', to: 'body', label: 'run the block' });
    out.push('body');
    r.step('body', cap('The body runs: prints body'), panels(), vars());
    if (fail) {
      msgs.push({ from: 'body', to: 'with', label: "ValueError('boom')", tone: 'error' });
      r.step('raise', cap('The body raises, but control still goes to __exit__ before anything else'), panels(), vars());
    } else {
      msgs.push({ from: 'body', to: 'with', label: 'finished normally', dashed: true });
      r.step('body', cap('The body finishes without an error'), panels(), vars());
    }
    msgs.push({ from: 'with', to: 'Managed', label: fail ? '__exit__(ValueError, boom, tb)' : '__exit__(None, None, None)', tone: fail ? 'error' : 'active' });
    out.push(`exit ${fail ? EXC : 'None'}`);
    r.step('exit', cap(fail ? '__exit__ receives the exception type, value and traceback' : '__exit__ runs anyway; all three arguments are None'), panels(), vars());
    msgs.push({ from: 'Managed', to: 'with', label: `returns ${suppress ? 'True' : 'False'}`, dashed: true, tone: fail && suppress ? 'found' : 'default' });
    r.step('ret', cap(fail ? (suppress ? 'A truthy return value tells with to swallow the exception' : 'A falsy return value tells with to re-raise the exception') : 'The return value is ignored when there was no exception'), panels(), vars());
    if (!fail || suppress) {
      msgs.push({ from: 'with', to: 'demo()', label: 'continue after the block', dashed: true, tone: 'found' });
      out.push('after');
      r.step('after', cap(fail ? 'The error vanished: execution continues and prints after' : 'Execution continues after the block: prints after'), panels(), vars());
    } else {
      msgs.push({ from: 'with', to: 'demo()', label: 'ValueError propagates', tone: 'error' });
      out.push('ValueError: boom propagates');
      r.step('after', cap('with re-raises: demo() never reaches print("after")'), panels(), vars());
    }
    return { frames: r.frames, result: out };
  },
  reference({ fail, suppress }) {
    return simulate(fail === 'yes', suppress === 'yes');
  },
};

const harness = `
def run_cm(cls, exc_name):
    log = []
    excs = {'ValueError': ValueError, 'KeyError': KeyError, 'RuntimeError': RuntimeError}
    try:
        with cls(log) as cm:
            log.append('body')
            if exc_name:
                raise excs[exc_name]('boom')
    except Exception:
        log.append('caught outside')
    log.append('after')
    return log

def run_txn(cls, fail, amount):
    db = {'balance': 100}
    try:
        with cls(db) as tx:
            db['balance'] -= amount
            if fail:
                raise RuntimeError('insufficient')
    except RuntimeError:
        return [db['balance'], 'raised']
    return [db['balance'], 'ok']

def run_override(cm, settings, changes, fail):
    inside = None
    try:
        with cm(settings, **changes) as s:
            inside = dict(settings)
            if fail:
                raise KeyError('x')
    except KeyError:
        pass
    return [inside, settings]
`;

const unit: Unit = {
  id: 'py-context-managers',
  hook: '`with` is how Python guarantees cleanup: files, locks, transactions, temporary settings. Interviewers ask exactly what runs when the body raises, and what returning True from `__exit__` does.',
  predict: {
    prompt: 'What does this print?',
    code: `class CM:
    def __enter__(self):
        print('enter')
        return self
    def __exit__(self, *exc):
        print('exit')
        return True

with CM():
    print('body')
    raise ValueError
print('after')`,
    codeLang: 'python',
    options: ['enter, body, exit, then a ValueError traceback', 'enter, body, exit, after', 'enter, body, after', 'enter, exit'],
    answer: 1,
    explain:
      '__exit__ always runs, even when the body raises. It returned True, which means "I handled it", so the ValueError is swallowed and execution continues with print("after").',
  },
  viz,
  deeper: {
    points: [
      '`with A() as x:` evaluates A(), calls `__enter__()` and binds its return value to x, runs the body, then calls `__exit__(exc_type, exc, tb)` no matter how the body ended.',
      'If the body raised, __exit__ receives the exception; if it returns a truthy value the exception is suppressed, otherwise it propagates after __exit__ finishes. Return None/False to let errors through.',
      '`contextlib.contextmanager` turns a generator into a context manager: code before `yield` is __enter__, the yielded value is the `as` target, and code after is __exit__. Wrap the yield in try/finally so cleanup survives exceptions.',
      'Several managers in one statement (`with a() as x, b() as y:`) are entered left to right and exited in reverse order.',
      'Typical uses: files, locks, database transactions (commit or rollback), temporary patches, timers.',
    ],
    pitfalls: [
      'Returning True from __exit__ by habit, which hides every error',
      'In a @contextmanager generator, forgetting try/finally so cleanup is skipped on error',
      'Using the object after the with block when __exit__ has closed it',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'Tracer',
    statement:
      'Write the context manager class `Tracer(log)`. `__enter__` appends "enter" to `log` and returns the tracer. `__exit__` appends "exit" for a clean block or "exit:" plus the exception class name when the body raised, and never swallows the exception.',
    signature: 'class Tracer:',
    harness,
    adapter: 'run_cm',
    solution: `class Tracer:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        self.log.append('enter')
        return @@self@@

    def __exit__(self, exc_type, exc, tb):
        if @@exc_type is None@@:
            self.log.append('exit')
        else:
            self.log.append('exit:' + @@exc_type.__name__@@)
        return @@False@@`,
    tests: [
      { args: [null], expected: ['enter', 'body', 'exit', 'after'], name: 'clean block' },
      { args: ['ValueError'], expected: ['enter', 'body', 'exit:ValueError', 'caught outside', 'after'], name: 'ValueError propagates' },
      { args: ['KeyError'], expected: ['enter', 'body', 'exit:KeyError', 'caught outside', 'after'], name: 'KeyError propagates' },
      { args: ['RuntimeError'], expected: ['enter', 'body', 'exit:RuntimeError', 'caught outside', 'after'], name: 'RuntimeError propagates' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Transaction',
    statement: '`Transaction` should roll the dict back when the block fails AND let the error reach the caller. The rollback works, but callers never see the error. Fix it.',
    harness,
    adapter: 'run_txn',
    buggy: `class Transaction:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.saved = dict(self.db)
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is not None:
            self.db.clear()
            self.db.update(self.saved)
        return True`,
    fixed: `class Transaction:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.saved = dict(self.db)
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is not None:
            self.db.clear()
            self.db.update(self.saved)
        return False`,
    bugType: '__exit__ swallows exceptions',
    hint: 'What does a truthy return value from __exit__ tell the with statement to do with the active exception?',
    explanation:
      'Returning True means "exception handled", so `with` discards it and the caller carries on as if nothing failed. After doing the rollback, return False (or None) so the exception propagates.',
    tests: [
      { args: [false, 30], expected: [70, 'ok'], name: 'commit path' },
      { args: [true, 30], expected: [100, 'raised'], name: 'rollback and re-raise' },
      { args: [true, 100], expected: [100, 'raised'], name: 'fail after draining' },
      { args: [false, 0], expected: [100, 'ok'], name: 'no change' },
    ],
  },
  boss: {
    title: 'Temporary settings override',
    statement:
      'Write the generator-based context manager `override(settings, **changes)` using `contextlib.contextmanager`. Inside the block `settings` has the changes applied (and is yielded). When the block ends, normally or with an exception, restore every changed key to its old value, and remove keys that did not exist before. Exceptions must still propagate.',
    language: 'python',
    fnName: 'override',
    harness,
    adapter: 'run_override',
    starter: `def override(settings, **changes):
    # your code here
    pass
`,
    solution: `from contextlib import contextmanager

@contextmanager
def override(settings, **changes):
    missing = object()
    saved = {key: settings.get(key, missing) for key in changes}
    settings.update(changes)
    try:
        yield settings
    finally:
        for key, old in saved.items():
            if old is missing:
                settings.pop(key, None)
            else:
                settings[key] = old`,
    tests: [
      { args: [{ debug: false, level: 1 }, { debug: true }, false], expected: [{ debug: true, level: 1 }, { debug: false, level: 1 }], name: 'restore after clean block' },
      { args: [{ a: 1 }, { b: 2 }, false], expected: [{ a: 1, b: 2 }, { a: 1 }], name: 'new key is removed afterwards' },
      { args: [{ a: 1 }, { a: 5, b: 6 }, true], expected: [{ a: 5, b: 6 }, { a: 1 }], name: 'restore even when the block raises' },
      { args: [{ a: 1 }, {}, false], expected: [{ a: 1 }, { a: 1 }], name: 'no changes' },
    ],
    hints: ['Before applying the changes, remember each key\'s old value. Use a sentinel object for keys that were absent.', 'Put `yield settings` inside try, and do all the restoring in the finally block so it runs when the body raises.'],
    combines: ['py-context-managers', 'py-generators', 'py-args-kwargs'],
  },
  quiz: [
    {
      prompt: 'Two managers: `with A() as a, B() as b:`. In what order are __exit__ methods called?',
      options: ['A then B', 'B then A', 'Whichever finishes first', 'Only B'],
      answer: 1,
      explain: 'Managers are exited in reverse order of entering, like a stack.',
    },
    {
      prompt: 'In a @contextmanager function, where should the cleanup go so it runs even if the body raises?',
      options: ['Before the yield', 'In a finally block around the yield', 'In a separate __del__', 'After the function returns'],
      answer: 1,
      explain: 'The exception is thrown into the generator at the yield, so only try/finally (or except) code around it will run.',
    },
  ],
};

export default unit;
