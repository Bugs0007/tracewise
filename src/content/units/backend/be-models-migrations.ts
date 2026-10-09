import { Recorder } from '@/engine/recorder';
import type { Panel, Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE } from '@/content/lib/backend-orm';

const code = `
old = project_state(Post)                  #@old
# ...you edit models.py: add, alter, remove or rename a field...   #@edit
new = project_state(Post)                  #@new
ops = diff(old, new)                       #@diff
for op in ops:                             #@loop
    run(sql_for(op))                       #@sql
`;

type Fields = Record<string, string>;

const V1: Fields = { title: 'CharField(max_length=100)', body: 'TextField()', views: 'IntegerField()' };
const ROWS: Scalar[][] = [
  [1, 'Hello', 'First post', 12],
  [2, 'Tips', 'Short tips', 40],
];

const CHANGES: Record<string, (f: Fields) => Fields> = {
  'add field': (f) => ({ ...f, slug: 'SlugField(max_length=50, null)' }),
  'alter field': (f) => ({ ...f, title: 'CharField(max_length=200)' }),
  'remove field': (f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'views')),
  'rename field': (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k === 'views' ? 'hits' : k, v])),
};

/** mirrors minidjango.migrations.diff for a single model */
function diff(model: string, old: Fields, now: Fields): string[] {
  const ops: string[] = [];
  for (const k of Object.keys(now)) {
    if (!(k in old)) ops.push(`AddField ${model}.${k} ${now[k]}`);
    else if (old[k] !== now[k]) ops.push(`AlterField ${model}.${k} ${old[k]} -> ${now[k]}`);
  }
  for (const k of Object.keys(old)) if (!(k in now)) ops.push(`RemoveField ${model}.${k}`);
  return ops;
}

function sqlType(spec: string): string {
  const n = spec.match(/max_length=(\d+)/)?.[1];
  const base = spec.split('(')[0];
  const t = base === 'TextField' ? 'TEXT' : base === 'IntegerField' ? 'INTEGER' : `VARCHAR(${n ?? 255})`;
  return t + (spec.includes('null') ? ' NULL' : spec.includes('unique') ? ' UNIQUE' : '');
}

function sqlFor(op: string, now: Fields): string {
  const [kind, target] = op.split(' ');
  const [, col] = target.split('.');
  if (kind === 'AddField') return `ALTER TABLE post ADD COLUMN ${col} ${sqlType(now[col])};`;
  if (kind === 'RemoveField') return `ALTER TABLE post DROP COLUMN ${col};`;
  return `ALTER TABLE post ALTER COLUMN ${col} TYPE ${sqlType(now[col])};`;
}

interface In {
  change: string;
}

const viz: VizDef<In> = {
  id: 'migration-diff',
  title: 'A migration is a schema diff',
  code,
  language: 'python',
  inputs: [{ key: 'change', label: 'Edit to models.py', kind: 'select', default: 'add field', options: Object.keys(CHANGES) }],
  presets: Object.keys(CHANGES).map((c) => ({ label: c, input: { change: c } })),
  run({ change }) {
    const edit = CHANGES[change];
    if (!edit) throw new Error(`Unknown change "${change}"`);
    const r = new Recorder(code);
    const v2 = edit(V1);
    const ops = diff('Post', V1, v2);
    let cols = ['id', ...Object.keys(V1)];
    let rows: Scalar[][] = ROWS.map((x) => [...x]);
    const dataTones: Record<string, Tone> = {};
    const log: { text: string; tone?: Tone }[] = [];

    const schema = (title: string, f: Fields, other?: Fields): Panel => {
      const names = Object.keys(f);
      const tones: Record<string, Tone> = {};
      names.forEach((n, i) => {
        if (!other) return;
        const t: Tone | undefined = !(n in other) ? (f === v2 ? 'new' : 'error') : other[n] !== f[n] ? 'compare' : undefined;
        if (t) {
          tones[`${i},0`] = t;
          tones[`${i},1`] = t;
        }
      });
      return { type: 'grid', title, cells: names.map((n) => [n, f[n]]), colLabels: ['field', 'type'], tones };
    };
    const data = (title: string): Panel => ({ type: 'grid', title, cells: rows.map((x) => x.map((v) => (v === null ? 'NULL' : v))), colLabels: cols, tones: { ...dataTones } });
    const logPanel = (): Panel => ({ type: 'log', title: 'Migration operations and SQL', lines: [...log] });

    r.step('old', 'Current state: model Post and its table, with two rows', [schema('Post (state v1)', V1), data('Table post')], { ops: 0 });
    r.step('edit', `You edit models.py: ${change}`, [schema('Post (state v1)', V1, v2), schema('Post (state v2)', v2, V1), data('Table post (unchanged)')], { change });
    r.step('new', 'project_state() snapshots the edited model as v2', [schema('v1', V1, v2), schema('v2', v2, V1)], { v1: Object.keys(V1).length, v2: Object.keys(v2).length });
    for (const op of ops) log.push({ text: op, tone: 'compare' });
    r.step('diff', ops.length ? `diff(v1, v2) finds ${ops.length} operation${ops.length > 1 ? 's' : ''}` : 'diff(v1, v2) finds nothing to do', [logPanel(), schema('v1', V1, v2), schema('v2', v2, V1)], { ops: ops.length });
    let applied = 0;
    for (const op of ops) {
      const [kind, target] = op.split(' ');
      const col = target.split('.')[1];
      const sql = sqlFor(op, v2);
      if (kind === 'AddField') {
        cols = [...cols, col];
        rows = rows.map((x) => [...x, null]);
        dataTones[`0,${cols.length - 1}`] = 'new';
        dataTones[`1,${cols.length - 1}`] = 'new';
      } else if (kind === 'RemoveField') {
        const at = cols.indexOf(col);
        cols = cols.filter((_, i) => i !== at);
        rows = rows.map((x) => x.filter((_, i) => i !== at));
        for (const k of Object.keys(dataTones)) delete dataTones[k];
      } else {
        const at = cols.indexOf(col);
        dataTones['0,' + at] = 'compare';
        dataTones['1,' + at] = 'compare';
      }
      applied++;
      log.push({ text: sql, tone: kind === 'RemoveField' ? 'error' : 'found' });
      const cap = kind === 'AddField' ? `${sql.slice(0, 60)}: old rows get NULL` : kind === 'RemoveField' ? `${col} is dropped: its values are gone for good` : `${col} keeps its data; the column type changes`;
      r.step('sql', cap, [logPanel(), data('Table post while migrating')], { applied, op: kind });
    }
    const lost = ops.some((o) => o.startsWith('RemoveField'));
    r.step('loop', lost ? 'Migrated. A removed or renamed column loses its data' : ops.length ? 'Migrated. Existing data survived' : 'Nothing to migrate', [logPanel(), data('Table post (final)'), { type: 'note', text: change === 'rename field' ? 'A plain schema diff cannot see a rename: it looks like AddField + RemoveField. Real Django asks you and then emits RenameField.' : 'Run makemigrations to generate this, migrate to apply it.', tone: lost ? 'error' : 'found' }], { ops: ops.length });
    return { frames: r.frames, result: ops };
  },
  reference({ change }) {
    const v2 = CHANGES[change](V1);
    const added = Object.keys(v2).filter((k) => !(k in V1));
    const altered = Object.keys(v2).filter((k) => k in V1 && V1[k] !== v2[k]);
    const removed = Object.keys(V1).filter((k) => !(k in v2));
    const order = Object.keys(v2);
    const ops = [...order.filter((k) => added.includes(k) || altered.includes(k)).map((k) => (added.includes(k) ? `AddField Post.${k} ${v2[k]}` : `AlterField Post.${k} ${V1[k]} -> ${v2[k]}`)), ...removed.map((k) => `RemoveField Post.${k}`)];
    return ops;
  },
};

const harness = `
from minidjango import models, migrations, connection, reset

OLD = {"Article": {"name": "Article", "table": "article", "fields": {"title": "CharField(max_length=100)", "body": "TextField()"}}}

def inspect_model(model, what):
    reset()
    if what == "ops":
        return migrations.diff(OLD, migrations.project_state(model))
    if what == "fields":
        return [f.name for f in model._meta.concrete]
    if what == "table":
        return model._meta.table
    if what == "defaults":
        a = model(title="t", body="b")
        return [a.views, a.slug]
    if what == "unique":
        model.objects.create(title="a", body="b", slug="x")
        try:
            model.objects.create(title="c", body="d", slug="x")
        except Exception as e:
            return type(e).__name__
        return "no error"
`;

const unit: Unit = {
  id: 'be-models-migrations',
  hook: 'A model is a Python description of a table; a migration is the recorded change between two descriptions. Interviewers ask what happens to existing rows when you add, rename or drop a column.',
  predict: {
    prompt: 'A pure schema diff compares old and new field names. You rename the field `views` to `hits` in the model. What does the diff produce?',
    options: ['RenameField Post.views -> hits', 'AddField Post.hits, then RemoveField Post.views (data is lost)', 'AlterField Post.views', 'No operations, names do not matter'],
    answer: 1,
    explain: 'The diff only sees a name that disappeared and a name that appeared. Real Django asks "did you rename?" and then writes RenameField; answer no or use a naive diff and the old column is dropped with its data.',
  },
  viz,
  deeper: {
    points: [
      'makemigrations compares your models with the state recorded by earlier migrations and writes the difference as operations (CreateModel, AddField, AlterField, RemoveField).',
      'migrate runs those operations as SQL; the table `django_migrations` remembers which ones already ran.',
      'Adding a non-null column to a table with rows needs a default (or null=True), otherwise existing rows have no valid value.',
      'Removing or renaming a column through add + remove destroys data: review generated migrations before applying them.',
    ],
    pitfalls: ['Editing an already-applied migration instead of adding a new one', 'Adding a unique non-null field without a default to a populated table', 'Changing max_length down on a populated column and truncating or failing on old rows'],
  },
  practice: {
    language: 'python',
    fnName: 'Article',
    statement: 'The current Article table has `title` (CharField, max_length 100) and `body` (TextField). Define the model so that makemigrations would add exactly two fields: a unique `slug` (SlugField, max_length 50) and an integer `views` defaulting to 0. Keep `title` and `body` as they are.',
    signature: 'class Article(models.Model):',
    solution: `class Article(models.Model):
    title = models.CharField(max_length=100)
    body = models.TextField()
    slug = models.SlugField(@@max_length=50@@, @@unique=True@@)
    views = models.@@IntegerField@@(@@default=0@@)`,
    harness,
    adapter: 'inspect_model',
    tests: [
      { args: ['ops'], expected: ['AddField Article.slug SlugField(max_length=50, unique)', 'AddField Article.views IntegerField()'], name: 'diff is exactly two AddFields' },
      { args: ['fields'], expected: ['id', 'title', 'body', 'slug', 'views'], name: 'field order' },
      { args: ['defaults'], expected: [0, null], name: 'views defaults to 0' },
      { args: ['unique'], expected: 'IntegrityError', name: 'slug is unique' },
      { args: ['table'], expected: 'article', name: 'table name' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Article',
    statement: 'You only meant to add `subtitle`, but makemigrations also generates an AlterField for another column. Fix the model so the diff is a single AddField.',
    buggy: `class Article(models.Model):
    title = models.CharField(max_length=10)
    body = models.TextField()
    subtitle = models.CharField(max_length=100, default="")`,
    fixed: `class Article(models.Model):
    title = models.CharField(max_length=100)
    body = models.TextField()
    subtitle = models.CharField(max_length=100, default="")`,
    harness,
    adapter: 'inspect_model',
    tests: [
      { args: ['ops'], expected: ['AddField Article.subtitle CharField(max_length=100)'], name: 'only the new field' },
      { args: ['fields'], expected: ['id', 'title', 'body', 'subtitle'], name: 'fields' },
      { args: ['table'], expected: 'article', name: 'table name' },
    ],
    bugType: 'accidental AlterField',
    hint: 'Compare the generated operations with what you meant. Which existing field no longer matches the recorded schema?',
    explanation: '`title` was edited to max_length=10 (a copy-paste slip), so the diff gained an AlterField that would shrink a populated column. Always read the generated operations before migrating.',
  },
  boss: {
    title: 'Plan a migration',
    statement: 'Write `plan_migration(model, old, new)` where `old` and `new` map field names to type strings. Return `{"ops": [...], "destructive": bool}`. Operations in order: for each field of `new` (in order) an `AddField Model.f spec` if missing, or `AlterField Model.f old -> new` if the spec changed; then for each field of `old` missing in `new`, `RemoveField Model.f`. `destructive` is true when any RemoveField exists (a rename counts).',
    language: 'python',
    fnName: 'plan_migration',
    starter: `def plan_migration(model, old, new):
    # your code here
    pass
`,
    solution: `def plan_migration(model, old, new):
    ops = []
    for name, spec in new.items():
        if name not in old:
            ops.append(f"AddField {model}.{name} {spec}")
        elif old[name] != spec:
            ops.append(f"AlterField {model}.{name} {old[name]} -> {spec}")
    for name in old:
        if name not in new:
            ops.append(f"RemoveField {model}.{name}")
    destructive = any(op.startswith("RemoveField") for op in ops)
    return {"ops": ops, "destructive": destructive}`,
    tests: [
      { args: ['Post', { title: 'CharField(max_length=100)' }, { title: 'CharField(max_length=100)' }], expected: { ops: [], destructive: false }, name: 'no change' },
      { args: ['Post', { title: 'CharField(max_length=100)' }, { title: 'CharField(max_length=100)', slug: 'SlugField()' }], expected: { ops: ['AddField Post.slug SlugField()'], destructive: false }, name: 'add' },
      { args: ['Post', { title: 'CharField(max_length=100)' }, { title: 'CharField(max_length=200)' }], expected: { ops: ['AlterField Post.title CharField(max_length=100) -> CharField(max_length=200)'], destructive: false }, name: 'alter' },
      { args: ['Post', { title: 'CharField()', views: 'IntegerField()' }, { title: 'CharField()' }], expected: { ops: ['RemoveField Post.views'], destructive: true }, name: 'remove is destructive' },
      { args: ['Post', { title: 'CharField()', views: 'IntegerField()' }, { title: 'CharField()', hits: 'IntegerField()' }], expected: { ops: ['AddField Post.hits IntegerField()', 'RemoveField Post.views'], destructive: true }, name: 'rename looks like add + remove' },
      { args: ['Note', { a: 'TextField()', b: 'TextField()' }, { a: 'CharField()', c: 'TextField()' }], expected: { ops: ['AlterField Note.a TextField() -> CharField()', 'AddField Note.c TextField()', 'RemoveField Note.b'], destructive: true }, name: 'mixed, in order' },
    ],
    hints: ['Loop over `new.items()` first (adds and alters, in that order of appearance), then loop over `old` for removals.', 'Build the strings with f-strings exactly as specified, and compute `destructive` from the ops you already produced.'],
    combines: ['be-models-migrations', 'be-relations'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
