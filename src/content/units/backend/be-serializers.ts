import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_MINIDJANGO, clip } from '@/content/lib/finish-m2m3';

const code = `
class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=12)          #@username
    email = serializers.EmailField()                                        #@email
    age = serializers.IntegerField(min_value=13, required=False, default=18)  #@age
    password = serializers.CharField(min_length=8, write_only=True)         #@password

    def validate_username(self, value):                                     #@hook
        if value.lower() == "admin":
            raise ValidationError("This username is reserved.")
        return value

    def validate(self, attrs):                                              #@object
        if attrs["username"].lower() in attrs["password"].lower():
            raise ValidationError({"password": ["Password may not contain the username."]})
        return attrs

s = SignupSerializer(data=request.data)
if s.is_valid():                                                            #@valid
    return JsonResponse(s.data, status=201)                                 #@data
return JsonResponse(s.errors, status=400)                                   #@errors
`;

type Payload = Record<string, unknown>;
type Errors = Record<string, string[]>;

interface In {
  payload: Payload;
}

const FIELDS = ['username', 'email', 'age', 'password'] as const;

const show = (v: unknown): string => (v === undefined ? '(missing)' : JSON.stringify(v));

/** Field-level rules, shared by the visualizer. Returns [error message | null, cleaned value]. */
function checkField(name: (typeof FIELDS)[number], raw: unknown): { error?: string; value?: unknown } {
  if (name === 'age') {
    if (raw === undefined) return { value: 18 };
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isInteger(n)) return { error: 'A valid integer is required.' };
    if (n < 13) return { error: 'Ensure this value is greater than or equal to 13.' };
    return { value: n };
  }
  if (raw === undefined) return { error: 'This field is required.' };
  if (raw === null) return { error: 'This field may not be null.' };
  if (typeof raw !== 'string' && typeof raw !== 'number') return { error: 'Not a valid string.' };
  const text = String(raw).trim();
  if (text === '') return { error: 'This field may not be blank.' };
  if (name === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? { value: text.toLowerCase() } : { error: 'Enter a valid email address.' };
  const [lo, hi] = name === 'username' ? [3, 12] : [8, Infinity];
  if (text.length > hi) return { error: `Ensure this field has no more than ${hi} characters.` };
  if (text.length < lo) return { error: `Ensure this field has at least ${lo} characters.` };
  return { value: text };
}

const viz: VizDef<In> = {
  id: 'be-serializers',
  title: 'Serializer validation, step by step',
  code,
  language: 'python',
  inputs: [{ key: 'payload', label: 'Request body (JSON)', kind: 'json', default: { username: 'ad', email: 'ana-at-mail.com', age: '12', password: 'short' } }],
  presets: [
    { label: 'Everything wrong', input: { payload: { username: 'ad', email: 'ana-at-mail.com', age: '12', password: 'short' } } },
    { label: 'Valid', input: { payload: { username: 'ana', email: 'Ana@Mail.com', password: 'hunter2hunter2' } } },
    { label: 'Reserved name', input: { payload: { username: 'Admin', email: 'a@mail.com', password: 'longenough1' } } },
    { label: 'Object-level rule', input: { payload: { username: 'ana', email: 'a@mail.com', password: 'ana-secret-1' } } },
    { label: 'Empty body', input: { payload: {} } },
  ],
  run({ payload }) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('The request body must be a JSON object');
    const r = new Recorder(code);
    const status: Record<string, { tone: Tone; text: string }> = {};
    const errors: Errors = {};
    const clean: Record<string, unknown> = {};
    const input = (): KVPanel => ({ type: 'kv', title: 'request.data', entries: FIELDS.map((f) => ({ k: f, v: show(payload[f]) })) });
    const results = (): KVPanel => ({
      type: 'kv',
      title: 'Field results',
      entries: FIELDS.map((f) => ({ k: f, v: status[f]?.text ?? 'not checked yet', tone: status[f]?.tone ?? 'muted' })),
    });
    const errPanel = (): KVPanel => ({
      type: 'kv',
      title: 'serializer.errors',
      entries: Object.keys(errors).length ? Object.entries(errors).map(([k, v]) => ({ k, v: v.join(' '), tone: 'error' as Tone })) : [{ k: '(none yet)', v: '-', tone: 'muted' as Tone }],
    });
    const panels = (): Panel[] => [input(), results(), errPanel()];
    r.step('username', 'is_valid() starts: each declared field is checked in order', panels(), { fields: FIELDS.length });

    for (const f of FIELDS) {
      r.op();
      const res = checkField(f, payload[f]);
      if (res.error) {
        errors[f] = [res.error];
        status[f] = { tone: 'error', text: res.error };
        r.step(f, clip(`${f}: ${show(payload[f])} fails: ${res.error}`), panels(), { field: f });
        continue;
      }
      if (f === 'age' && payload.age === undefined) {
        clean.age = 18;
        status.age = { tone: 'done', text: 'missing, default 18 used' };
        r.step('age', 'age is optional and missing, so the default 18 is used', panels(), { field: f });
        continue;
      }
      if (f === 'username') {
        status[f] = { tone: 'compare', text: 'field rules passed, running validate_username' };
        r.step(f, clip(`username ${show(payload.username)} passes the field rules (length 3-12)`), panels(), { field: f });
        const reserved = String(res.value).toLowerCase() === 'admin';
        if (reserved) {
          errors[f] = ['This username is reserved.'];
          status[f] = { tone: 'error', text: 'This username is reserved.' };
          r.step('hook', 'validate_username raises ValidationError: the name is reserved', panels(), { field: f });
          continue;
        }
        r.step('hook', 'validate_username is called with the cleaned value and returns it', panels(), { field: f });
      }
      clean[f] = res.value;
      status[f] = { tone: 'done', text: `ok: ${show(res.value)}` };
      if (f !== 'username') r.step(f, clip(`${f} is valid${f === 'email' ? ' (lower-cased)' : ''}: ${show(res.value)}`), panels(), { field: f });
    }

    if (Object.keys(errors).length) {
      r.step('object', clip(`Field errors exist, so validate() is skipped (${Object.keys(errors).length} field${Object.keys(errors).length > 1 ? 's' : ''} failed)`), panels(), { errors: Object.keys(errors).length });
      r.step('errors', clip(`is_valid() is False: the view returns 400 with ${Object.keys(errors).join(', ')}`), [errPanel()], { status: 400 });
      return { frames: r.frames, result: { ok: false, errors, data: {} } };
    }
    const bad = String(clean.username).toLowerCase().length > 0 && String(clean.password).toLowerCase().includes(String(clean.username).toLowerCase());
    if (bad) {
      errors.password = ['Password may not contain the username.'];
      status.password = { tone: 'error', text: errors.password[0] };
      r.step('object', 'validate() sees all cleaned values together and finds the password contains the username', panels(), { errors: 1 });
      r.step('errors', 'is_valid() is False: 400 with the error filed under "password"', [errPanel()], { status: 400 });
      return { frames: r.frames, result: { ok: false, errors, data: {} } };
    }
    r.step('object', 'validate() compares fields with each other and finds no conflict', panels(), { errors: 0 });
    const data: Record<string, unknown> = { username: clean.username, email: clean.email, age: clean.age };
    r.step('data', 'is_valid() is True: .data shows the cleaned values (write_only password left out)', [{ type: 'kv', title: 'serializer.data', entries: Object.entries(data).map(([k, v]) => ({ k, v: show(v), tone: 'found' as Tone })) }], { status: 201 });
    return { frames: r.frames, result: { ok: true, errors: {}, data } };
  },
  reference({ payload }) {
    // independent: a rule table plus a single pass
    const rules: Record<string, (v: unknown) => string | { v: unknown }> = {
      username: (v) => {
        if (v === undefined) return 'This field is required.';
        const s = String(v).trim();
        if (v === null) return 'This field may not be null.';
        if (typeof v === 'object' || typeof v === 'boolean') return 'Not a valid string.';
        if (!s) return 'This field may not be blank.';
        if (s.length > 12) return 'Ensure this field has no more than 12 characters.';
        if (s.length < 3) return 'Ensure this field has at least 3 characters.';
        return s.toLowerCase() === 'admin' ? 'This username is reserved.' : { v: s };
      },
      email: (v) => {
        if (v === undefined) return 'This field is required.';
        if (v === null) return 'This field may not be null.';
        if (typeof v === 'object' || typeof v === 'boolean') return 'Not a valid string.';
        const s = String(v).trim();
        if (!s) return 'This field may not be blank.';
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? { v: s.toLowerCase() } : 'Enter a valid email address.';
      },
      age: (v) => {
        if (v === undefined) return { v: 18 };
        const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : v;
        if (typeof n !== 'number' || !Number.isInteger(n)) return 'A valid integer is required.';
        return n >= 13 ? { v: n } : 'Ensure this value is greater than or equal to 13.';
      },
      password: (v) => {
        if (v === undefined) return 'This field is required.';
        if (v === null) return 'This field may not be null.';
        if (typeof v === 'object' || typeof v === 'boolean') return 'Not a valid string.';
        const s = String(v).trim();
        if (!s) return 'This field may not be blank.';
        return s.length >= 8 ? { v: s } : 'Ensure this field has at least 8 characters.';
      },
    };
    const errors: Errors = {};
    const vals: Record<string, unknown> = {};
    for (const [name, rule] of Object.entries(rules)) {
      const out = rule(payload[name]);
      if (typeof out === 'string') errors[name] = [out];
      else vals[name] = out.v;
    }
    if (!Object.keys(errors).length && String(vals.password).toLowerCase().includes(String(vals.username).toLowerCase())) errors.password = ['Password may not contain the username.'];
    if (Object.keys(errors).length) return { ok: false, errors, data: {} };
    return { ok: true, errors: {}, data: { username: vals.username, email: vals.email, age: vals.age } };
  },
};

const HARNESS = `
from minidjango import serializers
from minidjango.exceptions import ValidationError

def run_serializer(cls, payload):
    s = cls(data=payload)
    if s.is_valid():
        return [True, s.data]
    return [False, s.errors]

def run_register(cls, payload):
    s = cls(data=payload)
    if s.is_valid():
        return [True, {"username": s.validated_data["username"], "email": s.validated_data["email"]}]
    return [False, s.errors]
`;

const unit: Unit = {
  id: 'be-serializers',
  hook: 'Never trusting request data is the first rule of API design. Interviewers ask where validation lives and how a field error differs from an object-level error, because that shows whether you can design a clean, predictable error response.',
  simulationNote: SIM_MINIDJANGO,
  predict: {
    prompt: 'A request has a bad email AND a password that contains the username. Which errors does serializer.errors contain?',
    options: ['Both: field errors and the object-level error are collected together', 'Only the email error: validate() runs only when every field is already valid', 'Only the password error, because validate() runs first', 'Neither: errors are raised as the first exception'],
    answer: 1,
    explain: 'Fields are validated first (and each validate_<field> hook runs right after its field). The object-level validate() needs cleaned values for every field, so it is skipped when any field already failed. The client fixes the field errors, then sees the cross-field error.',
  },
  viz,
  deeper: {
    points: [
      'Validation order: field rules (type, length, range) then `validate_<field>` for that field, and only when all fields pass the object-level `validate(attrs)`.',
      '`errors` is a dict of field name to a list of messages, so a client can show every problem at once next to the right input.',
      'Use `validate_<field>` for rules about one value (reserved names) and `validate()` for rules that compare fields (password confirmation, date ranges).',
      'A hook must return the (possibly cleaned) value. Returning nothing replaces the field with None.',
      '`.data` is the output representation: write-only fields such as passwords are never echoed back.',
    ],
    pitfalls: ['Forgetting `return value` in validate_<field>', 'Doing cross-field checks inside a field hook, where other fields may not be cleaned yet', 'Validating only in the front end', 'Reporting one error at a time so users must submit repeatedly'],
  },
  practice: {
    language: 'python',
    fnName: 'TicketSerializer',
    statement: 'Define `TicketSerializer`: `title` (CharField, max 20, required), `priority` (IntegerField 1-5, optional, default 3), `due` (CharField, optional). `validate_title` rejects titles starting with "test" (any case) with "Title may not start with \'test\'.". `validate` requires `due` when priority is 5, with the error `{"due": ["Urgent tickets need a due date."]}`. `serializers` and `ValidationError` are imported.',
    signature: 'class TicketSerializer(serializers.Serializer):',
    solution: `class TicketSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=@@20@@)
    priority = serializers.IntegerField(min_value=1, max_value=5, @@required=False, default=3@@)
    due = serializers.CharField(required=False)

    def validate_title(self, value):
        if value.lower().@@startswith("test")@@:
            raise ValidationError("Title may not start with 'test'.")
        return value

    def validate(self, attrs):
        if attrs["priority"] == 5 and @@not attrs.get("due")@@:
            raise ValidationError({"due": ["Urgent tickets need a due date."]})
        return attrs`,
    harness: HARNESS,
    adapter: 'run_serializer',
    tests: [
      { args: [{ title: 'Fix bug' }], expected: [true, { title: 'Fix bug', priority: 3 }], name: 'default priority' },
      { args: [{}], expected: [false, { title: ['This field is required.'] }], name: 'title required' },
      { args: [{ title: 'x'.repeat(21) }], expected: [false, { title: ['Ensure this field has no more than 20 characters.'] }], name: 'title too long' },
      { args: [{ title: 'Test run' }], expected: [false, { title: ["Title may not start with 'test'."] }], name: 'field hook' },
      { args: [{ title: 'Ok', priority: 9 }], expected: [false, { priority: ['Ensure this value is less than or equal to 5.'] }], name: 'range check' },
      { args: [{ title: 'Deploy', priority: 5 }], expected: [false, { due: ['Urgent tickets need a due date.'] }], name: 'object-level rule' },
      { args: [{ title: 'Deploy', priority: 5, due: 'friday' }], expected: [true, { title: 'Deploy', priority: 5, due: 'friday' }], name: 'urgent with due date' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'NoteSerializer',
    statement: '`NoteSerializer` should tidy titles into Title Case ("buy milk" becomes "Buy Milk"), but every valid note comes back with `"title": null`. Fix it.',
    buggy: `class NoteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=30)
    body = serializers.CharField(required=False, allow_blank=True)

    def validate_title(self, value):
        if "<" in value:
            raise ValidationError("Title may not contain markup.")
        value.title()`,
    fixed: `class NoteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=30)
    body = serializers.CharField(required=False, allow_blank=True)

    def validate_title(self, value):
        if "<" in value:
            raise ValidationError("Title may not contain markup.")
        return value.title()`,
    harness: HARNESS,
    adapter: 'run_serializer',
    tests: [
      { args: [{ title: 'buy milk' }], expected: [true, { title: 'Buy Milk' }], name: 'title is tidied' },
      { args: [{ title: 'call ana', body: 'at noon' }], expected: [true, { title: 'Call Ana', body: 'at noon' }], name: 'with body' },
      { args: [{ title: '<b>hi' }], expected: [false, { title: ['Title may not contain markup.'] }], name: 'markup rejected' },
      { args: [{}], expected: [false, { title: ['This field is required.'] }], name: 'required' },
    ],
    bugType: 'validate hook forgot to return',
    hint: 'A validate_<field> hook replaces the field value with whatever it returns. What does this one return?',
    explanation: 'The hook computes value.title() and throws it away, so Python returns None and the serializer stores None. A hook must `return` the value it wants to keep, cleaned or not.',
  },
  boss: {
    title: 'Registration serializer',
    statement: 'Define `RegistrationSerializer` with `username` (CharField 3-12), `email` (EmailField), `password` (CharField, min 8, write_only) and `password2` (CharField, write_only). `validate_username` rejects "admin" in any case with "This username is reserved.". `validate` first checks the passwords match (error `{"password2": ["Passwords do not match."]}`), then that the password does not contain the username in any case (plain message "Password may not contain the username.", which becomes `non_field_errors`). `serializers` and `ValidationError` are imported.',
    language: 'python',
    fnName: 'RegistrationSerializer',
    starter: `class RegistrationSerializer(serializers.Serializer):
    # your code here
    pass
`,
    solution: `class RegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=12)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    password2 = serializers.CharField(write_only=True)

    def validate_username(self, value):
        if value.lower() == "admin":
            raise ValidationError("This username is reserved.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise ValidationError({"password2": ["Passwords do not match."]})
        if attrs["username"].lower() in attrs["password"].lower():
            raise ValidationError("Password may not contain the username.")
        return attrs`,
    harness: HARNESS,
    adapter: 'run_register',
    tests: [
      { args: [{ username: 'ana', email: 'Ana@Example.com', password: 's3cretpass', password2: 's3cretpass' }], expected: [true, { username: 'ana', email: 'ana@example.com' }], name: 'valid, email lower-cased' },
      {
        args: [{}],
        expected: [false, { username: ['This field is required.'], email: ['This field is required.'], password: ['This field is required.'], password2: ['This field is required.'] }],
        name: 'everything missing',
      },
      { args: [{ username: 'Admin', email: 'a@b.co', password: 'longenough1', password2: 'longenough1' }], expected: [false, { username: ['This username is reserved.'] }], name: 'reserved name' },
      { args: [{ username: 'ana', email: 'a@b.co', password: 'longenough1', password2: 'different11' }], expected: [false, { password2: ['Passwords do not match.'] }], name: 'passwords differ' },
      { args: [{ username: 'ana', email: 'a@b.co', password: 'ana12345', password2: 'ana12345' }], expected: [false, { non_field_errors: ['Password may not contain the username.'] }], name: 'password contains username' },
      { args: [{ username: 'ana', email: 'a@b.co', password: 'ana12345', password2: 'other999' }], expected: [false, { password2: ['Passwords do not match.'] }], name: 'mismatch is reported first' },
      { args: [{ username: 'ana', email: 'a@b.co', password: 'short', password2: 'short' }], expected: [false, { password: ['Ensure this field has at least 8 characters.'] }], name: 'field error stops the object check' },
    ],
    hints: ['Declare the four fields, then a `validate_username` hook and an object-level `validate(self, attrs)`.', 'In validate(): compare password and password2 first and raise a dict error for password2; then check the containment and raise a plain-string ValidationError (it lands in non_field_errors).'],
    combines: ['be-rest-methods'],
  },
  quiz: [
    {
      prompt: 'Where does the rule "end_date must be after start_date" belong?',
      options: ['validate_end_date, because it concerns end_date', 'The object-level validate(), because it compares two fields', 'In the model __str__ method', 'In the URL pattern'],
      answer: 1,
      explain: 'A field hook only sees one value. The object-level validate() receives all cleaned fields, so cross-field rules go there.',
    },
  ],
};

export default unit;
