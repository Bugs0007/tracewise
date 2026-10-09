import type { Unit } from '@/content/types';
import type { Tone } from '@/engine/types';
import type { Cls, Design, Rel } from '@/content/lib/sysdesign-lld';
import { scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class LibraryItem:                                   #@item
    def __init__(self, title):
        self.title = title
    def loan_days(self): return 14

class Book(LibraryItem):                             #@book
    def __init__(self, title, pages):
        super().__init__(title)
        self.pages = pages

class Dvd(LibraryItem):                              #@dvd
    def loan_days(self): return 7

class Shelf:                                         #@shelf
    def __init__(self, code):
        self.code = code
        self.items = []                              #@shelf_items
    def add(self, item):
        self.items.append(item)

class Member:                                        #@member
    def __init__(self, name):
        self.name = name

class Loan:                                          #@loan
    def __init__(self, member, item):
        self.member = member                         #@loan_member
        self.item = item                             #@loan_item

class Mailer:                                        #@mailer
    def send(self, to, text): ...

class Library:                                       #@library
    def __init__(self, name):
        self.name = name
        self.shelves = [Shelf("A"), Shelf("B")]      #@lib_shelf
        self.members = []                            #@lib_member
    def join(self, member):
        self.members.append(member)
    def remind(self, mailer):                        #@lib_mailer
        for m in self.members:
            mailer.send(m.name, "due soon")
`;

const CLASSES: Record<string, Cls> = {
  item: { id: 'item', name: 'LibraryItem', kind: 'abstract', attrs: ['title'], methods: ['loan_days()'], x: 350, y: 40 },
  book: { id: 'book', name: 'Book', attrs: ['pages'], methods: [], x: 130, y: 40 },
  dvd: { id: 'dvd', name: 'Dvd', methods: ['loan_days()'], x: 570, y: 40 },
  shelf: { id: 'shelf', name: 'Shelf', attrs: ['code'], methods: ['add()'], x: 350, y: 155 },
  member: { id: 'member', name: 'Member', attrs: ['name'], methods: [], x: 350, y: 275 },
  loan: { id: 'loan', name: 'Loan', attrs: ['member', 'item'], methods: [], x: 570, y: 155 },
  library: { id: 'library', name: 'Library', attrs: ['name'], methods: ['join()', 'remind()'], x: 130, y: 155 },
  mailer: { id: 'mailer', name: 'Mailer', methods: ['send()'], x: 130, y: 275 },
};

interface RelDef extends Rel {
  at: string;
  note: string;
  /** PlantUML-style arrow used in the result */
  arrow: string;
}

const RELS: RelDef[] = [
  { from: 'book', to: 'item', kind: 'inherits', label: 'is-a', at: 'book', arrow: '--|>', note: 'Book is-a LibraryItem: inheritance, hollow triangle' },
  { from: 'dvd', to: 'item', kind: 'inherits', label: 'is-a', at: 'dvd', arrow: '--|>', note: 'Dvd is-a LibraryItem: inheritance, hollow triangle' },
  { from: 'shelf', to: 'item', kind: 'aggregates', label: '◇ 0..*', at: 'shelf_items', arrow: 'o--', note: 'Shelf holds items it did not create: aggregation, hollow diamond' },
  { from: 'loan', to: 'member', kind: 'assoc', label: 'member  *..1', at: 'loan_member', arrow: '-->', note: 'Each Loan knows exactly one Member: association, multiplicity 1' },
  { from: 'loan', to: 'item', kind: 'assoc', label: 'item  *..1', at: 'loan_item', arrow: '-->', note: 'Each Loan knows exactly one item: association' },
  { from: 'library', to: 'shelf', kind: 'composes', label: '◆ 1..*', at: 'lib_shelf', arrow: '*--', note: 'Library creates its Shelves: composition, filled diamond' },
  { from: 'library', to: 'member', kind: 'aggregates', label: '◇ 0..*', at: 'lib_member', arrow: 'o--', note: 'Library keeps Members that exist on their own: aggregation' },
  { from: 'library', to: 'mailer', kind: 'depends', label: 'uses', at: 'lib_mailer', arrow: '..>', note: 'Library only receives a Mailer as a parameter: dependency, dashed arrow' },
];

const ORDER = Object.keys(CLASSES);
const name = (id: string): string => CLASSES[id].name;
const line = (r: Rel & { arrow: string }): string => `${name(r.from)} ${r.arrow} ${name(r.to)}`;

interface In {
  classes: string[];
}

function check(input: In): string[] {
  const ids = input.classes.map((s) => s.trim().toLowerCase());
  for (const id of ids) if (!CLASSES[id]) throw new Error(`Unknown class "${id}". Choose from: ${ORDER.join(', ')}`);
  if (new Set(ids).size !== ids.length) throw new Error('List each class only once');
  return ids;
}

function simulate(input: In) {
  const ids = check(input);
  const beats: Beat[] = [];
  const present: Cls[] = [];
  const rels: Rel[] = [];
  const results: string[] = [];
  const design = (): Design => ({ classes: present.map((c) => ({ ...c })), rels: rels.map((r) => ({ ...r })) });
  beats.push({ at: 'item', caption: 'Empty canvas: each class becomes a box, each relationship a line', design: design(), state: { classes: 0, relationships: 0 } });
  for (const id of ids) {
    present.push(CLASSES[id]);
    beats.push({ at: id, caption: `Add ${name(id)}: box with its attributes and methods`, design: design(), tones: { [id]: 'new' }, state: { classes: present.length, relationships: rels.length }, log: { text: `class ${name(id)}`, tone: 'new' } });
    for (const rel of RELS) {
      const have = (x: string) => present.some((c) => c.id === x);
      if (rels.includes(rel) || !have(rel.from) || !have(rel.to) || (rel.from !== id && rel.to !== id)) continue;
      rels.push(rel);
      results.push(line(rel));
      const edgeTones: Record<string, Tone> = { [`${rel.from}>${rel.to}`]: 'new' };
      beats.push({ at: rel.at, caption: rel.note, design: design(), tones: { [rel.from]: 'active', [rel.to]: 'active' }, edgeTones, state: { classes: present.length, relationships: rels.length }, log: { text: line(rel), tone: 'found' } });
    }
  }
  beats.push({ at: 'library', caption: `Done: ${present.length} classes, ${rels.length} relationships`, design: design(), tones: Object.fromEntries(present.map((c) => [c.id, 'done' as Tone])), state: { classes: present.length, relationships: rels.length } });
  return { beats, result: results.sort() };
}

function reference(input: In): string[] {
  const set = new Set(check(input));
  return RELS.filter((r) => set.has(r.from) && set.has(r.to))
    .map(line)
    .sort();
}

const viz = scenarioViz<In, string[]>({
  id: 'uml-diagrams',
  title: 'Building a UML class diagram from code',
  code,
  design: { classes: [], rels: [] },
  diagramTitle: 'Class diagram (grows as you read the code)',
  size: { width: 700, height: 330 },
  stateTitle: 'Diagram so far',
  logTitle: 'Read from the code',
  inputs: [{ key: 'classes', label: 'Classes to draw, in order', kind: 'strings', default: ORDER, maxItems: 8, help: `Any order of: ${ORDER.join(', ')}. Relationships appear when both ends exist.` }],
  presets: [
    { label: 'Inheritance first', input: { classes: ['item', 'book', 'dvd'] } },
    { label: 'Ownership', input: { classes: ['library', 'shelf', 'item', 'member'] } },
    { label: 'Loans', input: { classes: ['member', 'item', 'loan', 'mailer', 'library'] } },
  ],
  simulate,
  reference,
});

const RELATION_HARNESS_NOTE = 'creates = built inside __init__; holds = received and stored; uses = only a parameter or local';

const unit: Unit = {
  id: 'uml-diagrams',
  hook: 'Low-level design rounds end with "draw the class diagram". The marks that matter are small: which arrow is inheritance, who owns whose lifetime, and the multiplicities on each end.',
  predict: {
    prompt: '`Library.__init__` does `self.shelves = [Shelf("A")]`, while `Shelf.add(item)` stores an item created elsewhere. Which relationships do these two lines draw?',
    options: ['Library ◇ Shelf and Shelf ◆ item', 'Library ◆ Shelf (composition) and Shelf ◇ item (aggregation)', 'Both are inheritance', 'Both are dependencies because they are method-local'],
    answer: 1,
    explain: 'Creating the part inside the owner means the part dies with it: composition (filled diamond on the owner side). Storing something passed in means the part lives on its own: aggregation (hollow diamond).',
  },
  viz,
  deeper: {
    points: [
      'A class box has three compartments: **name**, **attributes**, **methods**. `+` public, `-` private, `#` protected; italics or `«abstract»` for abstract classes.',
      'Relationship strength, strongest to weakest: **inheritance** (hollow triangle) is a type relation; **composition** (filled diamond) owns the lifetime; **aggregation** (hollow diamond) groups independent parts; **association** (plain line) just knows; **dependency** (dashed arrow) uses briefly as a parameter or local.',
      '**Multiplicity** sits at each end: `1`, `0..1`, `*` or `0..*`, `1..*`. `Loan *..1 Member` reads "many loans, one member".',
      'Read the code to find the relation: created in `__init__` means composition; received and stored means aggregation or association; only in a method signature means dependency.',
      'In interviews draw the 4 to 6 core classes first, name the relationships, and add multiplicities last. Do not draw every getter.',
    ],
    pitfalls: ['Using inheritance where an association would do ("a Car is-a Engine")', 'Drawing the diamond on the wrong end (it always sits on the owner/whole)', 'Showing dependency arrows for everything, which turns the diagram into noise'],
  },
  practice: {
    language: 'python',
    fnName: 'describe_relations',
    statement:
      'Given `classes` mapping a class name to `{"extends": base or None, "creates": [...], "holds": [...], "uses": [...]}` (keys may be missing; ' +
      RELATION_HARNESS_NOTE +
      '), return a sorted list of relation strings: `"A --|> B"` for inheritance, `"A *-- B"` composition, `"A o-- B"` aggregation, `"A ..> B"` dependency. Ignore targets that are not keys of `classes`. If a class lists the same target in several lists keep only the strongest (creates, then holds, then uses).',
    signature: 'def describe_relations(classes):',
    solution: `def describe_relations(classes):
    out = []
    for name, info in classes.items():
        base = info.get('extends')
        if base in classes:
            out.append(@@name + ' --|> ' + base@@)
        seen = set()
        for key, arrow in (('creates', '*--'), ('holds', 'o--'), ('uses', '..>')):
            for target in info.get(key, []):
                if target in classes and @@target not in seen@@:
                    seen.add(target)
                    out.append(name + ' ' + arrow + ' ' + target)
    return @@sorted(out)@@`,
    tests: [
      { args: [{ Book: { extends: 'Item' }, Item: {} }], expected: ['Book --|> Item'], name: 'inheritance' },
      { args: [{ Library: { creates: ['Shelf'], holds: ['Member'], uses: ['Mailer'] }, Shelf: {}, Member: {}, Mailer: {} }], expected: ['Library *-- Shelf', 'Library ..> Mailer', 'Library o-- Member'], name: 'composition, aggregation and dependency' },
      { args: [{ A: { creates: ['B'], holds: ['B'], uses: ['B'] }, B: {} }], expected: ['A *-- B'], name: 'strongest relation wins' },
      { args: [{ A: { extends: 'object', holds: ['str', 'B'] }, B: { extends: null } }], expected: ['A o-- B'], name: 'unknown targets are ignored' },
      { args: [{}], expected: [], name: 'empty' },
      { args: [{ Z: { uses: ['A'] }, A: { holds: ['Z'] } }], expected: ['A o-- Z', 'Z ..> A'], name: 'sorted output, cyclic is fine' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'describe_relations',
    statement: 'A class that both stores a collaborator and creates it gets two lines in the generated diagram (`A *-- B` and `A o-- B`). Only the strongest relation should appear.',
    buggy: `def describe_relations(classes):
    out = []
    for name, info in classes.items():
        base = info.get('extends')
        if base in classes:
            out.append(name + ' --|> ' + base)
        seen = set()
        for key, arrow in (('creates', '*--'), ('holds', 'o--'), ('uses', '..>')):
            for target in info.get(key, []):
                if target in classes:
                    seen.add(target)
                    out.append(name + ' ' + arrow + ' ' + target)
    return sorted(out)`,
    fixed: `def describe_relations(classes):
    out = []
    for name, info in classes.items():
        base = info.get('extends')
        if base in classes:
            out.append(name + ' --|> ' + base)
        seen = set()
        for key, arrow in (('creates', '*--'), ('holds', 'o--'), ('uses', '..>')):
            for target in info.get(key, []):
                if target in classes and target not in seen:
                    seen.add(target)
                    out.append(name + ' ' + arrow + ' ' + target)
    return sorted(out)`,
    tests: [
      { args: [{ A: { creates: ['B'], holds: ['B'] }, B: {} }], expected: ['A *-- B'], name: 'creates beats holds' },
      { args: [{ A: { holds: ['B'], uses: ['B'] }, B: {} }], expected: ['A o-- B'], name: 'holds beats uses' },
      { args: [{ A: { creates: ['B'], uses: ['C'] }, B: {}, C: {} }], expected: ['A *-- B', 'A ..> C'], name: 'different targets stay' },
    ],
    bugType: 'unused guard',
    hint: 'The code records seen targets in a set. Where is that set read?',
    explanation: '`seen` is filled but never consulted, so every list emits its own line. Checking `target not in seen` keeps only the first, strongest relation because the lists are scanned strongest first.',
  },
  boss: {
    title: 'Composition cascade',
    statement:
      'With the same `classes` mapping as `describe_relations`, write `cascade(classes, name)`: the sorted list of classes destroyed when an instance of `name` is deleted. That is `name` itself plus everything it creates (`creates`), transitively, because composed parts die with their owner. `holds` and `uses` targets survive. Ignore targets that are not keys of `classes`. Return `[]` if `name` is unknown. Cycles must not loop forever.',
    language: 'python',
    fnName: 'cascade',
    starter: `def cascade(classes, name):
    pass
`,
    solution: `def cascade(classes, name):
    if name not in classes:
        return []
    seen = {name}
    stack = [name]
    while stack:
        cur = stack.pop()
        for part in classes[cur].get('creates', []):
            if part in classes and part not in seen:
                seen.add(part)
                stack.append(part)
    return sorted(seen)`,
    tests: [
      { args: [{ Library: { creates: ['Shelf'], holds: ['Member'] }, Shelf: { creates: ['Slot'] }, Slot: {}, Member: {} }, 'Library'], expected: ['Library', 'Shelf', 'Slot'], name: 'transitive parts die, members survive' },
      { args: [{ Library: { creates: ['Shelf'] }, Shelf: {} }, 'Shelf'], expected: ['Shelf'], name: 'a part alone' },
      { args: [{ A: { creates: ['B'] }, B: { creates: ['A'] } }, 'A'], expected: ['A', 'B'], name: 'cycle terminates' },
      { args: [{ A: { creates: ['str', 'B'] }, B: {} }, 'A'], expected: ['A', 'B'], name: 'unknown targets ignored' },
      { args: [{ A: {} }, 'Z'], expected: [], name: 'unknown class' },
      { args: [{ A: { creates: ['B', 'C'], uses: ['D'] }, B: { creates: ['C'] }, C: {}, D: {} }, 'A'], expected: ['A', 'B', 'C'], name: 'shared part counted once' },
    ],
    hints: ['This is graph reachability along `creates` edges only. Keep a seen set so cycles and shared parts are handled.', 'Start with {name}, use a stack or queue, push each unseen `creates` target that exists in classes, and return sorted(seen).'],
    combines: ['bfs', 'oop-principles'],
  },
  quiz: [
    {
      prompt: 'On a class diagram, `Order 1 ◆──── 1..* LineItem` says what?',
      options: ['An order may have no line items', 'Every order owns one or more line items, and they are deleted with it', 'Line items own orders', 'LineItem inherits from Order'],
      answer: 1,
      explain: 'Filled diamond on the Order end means composition; `1..*` on the LineItem end means at least one.',
    },
    {
      prompt: 'A method signature `def remind(self, mailer)` and no stored reference to the mailer. Which arrow?',
      options: ['Dashed arrow (dependency)', 'Filled diamond', 'Hollow triangle', 'Solid line with 1..* on both ends'],
      answer: 0,
      explain: 'The class only uses the mailer for the duration of a call: a dependency.',
    },
  ],
};

export default unit;
