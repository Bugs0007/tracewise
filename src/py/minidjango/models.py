"""A small, faithful subset of the Django ORM.

Supported: fields (Auto/Char/Text/Integer/Float/Boolean/DateTime/ForeignKey/
OneToOne/ManyToMany), managers, lazy chainable querysets (filter, exclude,
get, order_by, slicing, values, values_list, count, exists, first, last,
update, delete, select_related, prefetch_related), field lookups
(exact, iexact, gt, gte, lt, lte, contains, icontains, in, startswith, isnull)
including lookups across foreign keys (author__name="x"), reverse relations
via related_name, CASCADE / SET_NULL / PROTECT.

Every database hit is logged as SQL in `connection.queries`.
"""
import datetime as _dt

from . import db as _db

CASCADE = "CASCADE"
SET_NULL = "SET_NULL"
PROTECT = "PROTECT"

_registry = {}


class ObjectDoesNotExist(Exception):
    pass


class MultipleObjectsReturned(Exception):
    pass


class ProtectedError(Exception):
    pass


def _conn():
    return _db.connection


def _sql_value(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, tuple, set)):
        return "(" + ", ".join(_sql_value(x) for x in v) + ")"
    return "'" + str(v).replace("'", "''") + "'"


# ───────────────────────────── fields ─────────────────────────────


class Field:
    sql_type = "TEXT"
    is_relation = False

    def __init__(self, default=None, null=False, blank=False, unique=False, db_index=False, primary_key=False, max_length=None, choices=None):
        self.default = default
        self.null = null
        self.blank = blank
        self.unique = unique
        self.db_index = db_index
        self.primary_key = primary_key
        self.max_length = max_length
        self.choices = choices
        self.name = None
        self.model = None

    @property
    def column(self):
        return self.name

    def contribute(self, model, name):
        self.name = name
        self.model = model

    def get_default(self):
        return self.default() if callable(self.default) else self.default

    def to_python(self, value):
        return value

    def describe(self):
        bits = [type(self).__name__]
        if self.max_length:
            bits.append(f"max_length={self.max_length}")
        if self.unique:
            bits.append("unique")
        if self.null:
            bits.append("null")
        if self.db_index:
            bits.append("index")
        return "(".join([bits[0], ", ".join(bits[1:]) + ")"]) if len(bits) > 1 else bits[0] + "()"


class AutoField(Field):
    sql_type = "INTEGER PRIMARY KEY"


class CharField(Field):
    @property
    def sql_type(self):
        return f"VARCHAR({self.max_length or 255})"

    def to_python(self, value):
        return value if value is None else str(value)


class TextField(Field):
    sql_type = "TEXT"


class EmailField(CharField):
    pass


class SlugField(CharField):
    pass


class IntegerField(Field):
    sql_type = "INTEGER"

    def to_python(self, value):
        return value if value is None else int(value)


class PositiveIntegerField(IntegerField):
    pass


class FloatField(Field):
    sql_type = "REAL"


class DecimalField(FloatField):
    def __init__(self, max_digits=None, decimal_places=None, **kw):
        super().__init__(**kw)


class BooleanField(Field):
    sql_type = "BOOLEAN"

    def __init__(self, **kw):
        kw.setdefault("default", False)
        super().__init__(**kw)


class DateTimeField(Field):
    sql_type = "TIMESTAMP"

    def __init__(self, auto_now_add=False, auto_now=False, **kw):
        super().__init__(**kw)
        self.auto_now_add = auto_now_add
        self.auto_now = auto_now


class DateField(DateTimeField):
    sql_type = "DATE"


class ForeignKey(Field):
    is_relation = True
    sql_type = "INTEGER"

    def __init__(self, to, on_delete=CASCADE, related_name=None, **kw):
        super().__init__(**kw)
        self.to = to
        self.on_delete = on_delete
        self.related_name = related_name
        self.db_index = True

    @property
    def column(self):
        return self.name + "_id"

    def remote_model(self):
        if self.to == "self":
            return self.model
        if isinstance(self.to, str):
            return _registry[self.to.split(".")[-1]]
        return self.to

    def contribute(self, model, name):
        super().contribute(model, name)
        setattr(model, name, _ForwardDescriptor(self))

    def describe(self):
        to = self.to if isinstance(self.to, str) else self.to.__name__
        return f"ForeignKey({to}, on_delete={self.on_delete})"


class OneToOneField(ForeignKey):
    def __init__(self, to, on_delete=CASCADE, related_name=None, **kw):
        super().__init__(to, on_delete=on_delete, related_name=related_name, **kw)
        self.unique = True

    def describe(self):
        to = self.to if isinstance(self.to, str) else self.to.__name__
        return f"OneToOneField({to})"


class ManyToManyField(Field):
    is_relation = True

    def __init__(self, to, related_name=None, **kw):
        super().__init__(**kw)
        self.to = to
        self.related_name = related_name

    def remote_model(self):
        if isinstance(self.to, str):
            return _registry[self.model.__name__ if self.to == "self" else self.to.split(".")[-1]]
        return self.to

    @property
    def through(self):
        return f"{self.model._meta.table}_{self.name}"

    def contribute(self, model, name):
        super().contribute(model, name)
        setattr(model, name, _M2MDescriptor(self, forward=True))

    def describe(self):
        to = self.to if isinstance(self.to, str) else self.to.__name__
        return f"ManyToManyField({to})"


# ───────────────────────────── descriptors ─────────────────────────────


class _ForwardDescriptor:
    """book.author → loads the Author lazily (one query) unless select_related cached it."""

    def __init__(self, field):
        self.field = field

    def __get__(self, inst, owner):
        if inst is None:
            return self
        cache = inst.__dict__.setdefault("_cache", {})
        if self.field.name in cache:
            return cache[self.field.name]
        pk = inst.__dict__.get(self.field.column)
        if pk is None:
            return None
        obj = self.field.remote_model().objects.get(pk=pk)
        cache[self.field.name] = obj
        return obj

    def __set__(self, inst, value):
        cache = inst.__dict__.setdefault("_cache", {})
        cache[self.field.name] = value
        inst.__dict__[self.field.column] = None if value is None else value.pk


class _ReverseFKDescriptor:
    """author.books → manager filtered to this author (or a single object for one-to-one)."""

    def __init__(self, field):
        self.field = field

    def __get__(self, inst, owner):
        if inst is None:
            return self
        model = self.field.model
        if isinstance(self.field, OneToOneField):
            cache = inst.__dict__.setdefault("_cache", {})
            key = "_rev_" + self.field.related_name
            if key not in cache:
                cache[key] = model.objects.get(**{self.field.column: inst.pk})
            return cache[key]
        return _RelatedManager(model, {self.field.column: inst.pk}, inst, self.field.related_name)


class _M2MDescriptor:
    def __init__(self, field, forward):
        self.field = field
        self.forward = forward

    def __get__(self, inst, owner):
        if inst is None:
            return self
        return _M2MManager(self.field, inst, self.forward)


# ───────────────────────────── model base ─────────────────────────────


class Options:
    def __init__(self, model, meta):
        self.model = model
        self.table = getattr(meta, "db_table", None) or model.__name__.lower()
        self.ordering = list(getattr(meta, "ordering", []) or [])
        self.indexes = list(getattr(meta, "indexes", []) or [])
        self.fields = []
        self.m2m = []

    @property
    def concrete(self):
        return [f for f in self.fields if not isinstance(f, ManyToManyField)]

    def get_field(self, name):
        for f in self.fields + self.m2m:
            if f.name == name or f.column == name:
                return f
        raise FieldError(f"{self.model.__name__} has no field named '{name}'")


class FieldError(Exception):
    pass


class Index:
    def __init__(self, fields, name=None):
        self.fields = list(fields)
        self.name = name or "_".join(self.fields) + "_idx"


class ModelBase(type):
    def __new__(mcs, name, bases, attrs):
        if attrs.get("_abstract_base"):
            return super().__new__(mcs, name, bases, attrs)
        fields = {k: v for k, v in list(attrs.items()) if isinstance(v, Field)}
        for k in fields:
            attrs.pop(k)
        meta = attrs.pop("Meta", None)
        cls = super().__new__(mcs, name, bases, attrs)
        cls._meta = Options(cls, meta)
        if not any(f.primary_key for f in fields.values()):
            pk = AutoField(primary_key=True)
            pk.contribute(cls, "id")
            cls._meta.fields.append(pk)
        for fname, f in fields.items():
            f.contribute(cls, fname)
            (cls._meta.m2m if isinstance(f, ManyToManyField) else cls._meta.fields).append(f)
        cls.DoesNotExist = type("DoesNotExist", (ObjectDoesNotExist,), {})
        cls.MultipleObjectsReturned = type("MultipleObjectsReturned", (MultipleObjectsReturned,), {})
        cls.objects = Manager(cls)
        _registry[name] = cls
        # reverse accessors
        for f in cls._meta.fields:
            if isinstance(f, ForeignKey):
                _install_reverse(f)
        for f in cls._meta.m2m:
            _install_reverse_m2m(f)
        # resolve pending string references pointing at this model
        for other in list(_registry.values()):
            for f in getattr(other, "_meta", Options(other, None)).fields:
                if isinstance(f, ForeignKey) and isinstance(f.to, str) and f.to.split(".")[-1] == name:
                    _install_reverse(f)
        return cls


def _install_reverse(f):
    try:
        remote = f.remote_model()
    except KeyError:
        return
    rel = f.related_name or (f.model.__name__.lower() + ("" if isinstance(f, OneToOneField) else "_set"))
    f.related_name = rel
    if not hasattr(remote, rel):
        setattr(remote, rel, _ReverseFKDescriptor(f))


def _install_reverse_m2m(f):
    try:
        remote = f.remote_model()
    except KeyError:
        return
    rel = f.related_name or (f.model.__name__.lower() + "_set")
    f.related_name = rel
    if not hasattr(remote, rel):
        setattr(remote, rel, _M2MDescriptor(f, forward=False))


def ensure_table(model):
    c = _conn()
    t = model._meta.table
    if t not in c.tables:
        cols = [f.column for f in model._meta.concrete]
        unique = [f.column for f in model._meta.concrete if f.unique and not f.primary_key]
        idx = [f.column for f in model._meta.concrete if f.db_index]
        for i in model._meta.indexes:
            idx.append(i.fields[0])
        c.create_table(t, cols, unique, idx)
    for f in model._meta.m2m:
        if f.through not in c.tables:
            a, b = model.__name__.lower() + "_id", f.remote_model().__name__.lower() + "_id"
            if a == b:
                a, b = "from_" + a, "to_" + b
            c.create_table(f.through, ["id", a, b], indexes=[a, b])
    return c.tables[t]


class Model(metaclass=ModelBase):
    _abstract_base = True

    def __init__(self, **kwargs):
        self.__dict__["_cache"] = {}
        for f in self._meta.concrete:
            if isinstance(f, ForeignKey):
                if f.name in kwargs:
                    setattr(self, f.name, kwargs.pop(f.name))
                else:
                    self.__dict__[f.column] = kwargs.pop(f.column, None)
            else:
                v = kwargs.pop(f.name, f.get_default())
                if isinstance(f, DateTimeField) and f.auto_now_add and v is None:
                    v = _now()
                self.__dict__[f.name] = v
        for k, v in kwargs.items():
            if any(m.name == k for m in self._meta.m2m):
                raise TypeError(f"Direct assignment to the forward side of a many-to-many set is prohibited. Use {k}.set() instead.")
            raise TypeError(f"{type(self).__name__}() got an unexpected keyword argument '{k}'")

    @property
    def pk(self):
        return self.__dict__.get("id")

    def _row(self):
        return {f.column: self.__dict__.get(f.column) for f in self._meta.concrete}

    def full_clean(self):
        errors = {}
        for f in self._meta.concrete:
            v = self.__dict__.get(f.column)
            if f.primary_key:
                continue
            if v is None and not f.null and f.get_default() is None and not isinstance(f, (DateTimeField,)):
                errors[f.name] = ["This field cannot be null."]
            elif isinstance(f, CharField) and f.max_length and v is not None and len(str(v)) > f.max_length:
                errors[f.name] = [f"Ensure this value has at most {f.max_length} characters (it has {len(str(v))})."]
            elif f.choices and v is not None and v not in [c[0] for c in f.choices]:
                errors[f.name] = [f"Value {v!r} is not a valid choice."]
        if errors:
            from .exceptions import ValidationError

            raise ValidationError(errors)

    def save(self):
        t = ensure_table(type(self))
        for f in self._meta.concrete:
            if isinstance(f, DateTimeField) and f.auto_now:
                self.__dict__[f.name] = _now()
        row = self._row()
        c = _conn()
        if self.pk is None or self.pk not in t.rows:
            cols = [k for k in row if k != "id" or row[k] is not None]
            c.log(f"INSERT INTO {t.name} ({', '.join(cols)}) VALUES ({', '.join(_sql_value(row[k]) for k in cols)})")
            self.__dict__["id"] = t.insert(row)
        else:
            sets = ", ".join(f"{k} = {_sql_value(v)}" for k, v in row.items() if k != "id")
            c.log(f"UPDATE {t.name} SET {sets} WHERE id = {self.pk}", 1, "id")
            t.update(self.pk, row)
        return self

    def delete(self):
        _delete_objects(type(self), [self.pk])
        self.__dict__["id"] = None

    def refresh_from_db(self):
        fresh = type(self).objects.get(pk=self.pk)
        self.__dict__.update({k: v for k, v in fresh.__dict__.items() if k != "_cache"})
        self.__dict__["_cache"] = {}

    def __eq__(self, other):
        return type(self) is type(other) and self.pk is not None and self.pk == other.pk

    def __hash__(self):
        return hash((type(self).__name__, self.pk))

    def __repr__(self):
        return f"<{type(self).__name__}: {self}>"

    def __str__(self):
        return f"{type(self).__name__} object ({self.pk})"


def _now():
    return _dt.datetime(2024, 1, 1, 12, 0, 0).isoformat()


def _delete_objects(model, pks):
    if not pks:
        return 0
    c = _conn()
    t = ensure_table(model)
    # handle relations pointing at these rows
    for other in list(_registry.values()):
        if not hasattr(other, "_meta"):
            continue
        for f in other._meta.fields:
            if isinstance(f, ForeignKey) and f.remote_model() is model:
                ot = ensure_table(other)
                dependents = [r["id"] for r in ot.rows.values() if r.get(f.column) in pks]
                if not dependents:
                    continue
                if f.on_delete == PROTECT:
                    raise ProtectedError(f"Cannot delete {model.__name__}: referenced by {other.__name__}.{f.name}")
                if f.on_delete == CASCADE:
                    _delete_objects(other, dependents)
                elif f.on_delete == SET_NULL:
                    for pk in dependents:
                        ot.update(pk, {f.column: None})
                    c.log(f"UPDATE {ot.name} SET {f.column} = NULL WHERE {f.column} IN {_sql_value(pks)}")
    c.log(f"DELETE FROM {t.name} WHERE id IN {_sql_value(sorted(pks))}", len(pks), "id")
    for pk in pks:
        t.delete(pk)
    return len(pks)


# ───────────────────────────── querysets ─────────────────────────────

_LOOKUPS = {"exact", "iexact", "gt", "gte", "lt", "lte", "contains", "icontains", "in", "startswith", "endswith", "isnull", "ne"}
_OPS = {"exact": "=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "ne": "!=", "in": "IN", "contains": "LIKE", "icontains": "ILIKE", "startswith": "LIKE", "endswith": "LIKE", "iexact": "ILIKE"}


def _match(value, op, arg):
    if op == "isnull":
        return (value is None) == bool(arg)
    if value is None:
        return op == "exact" and arg is None
    if op == "exact":
        return value == arg
    if op == "ne":
        return value != arg
    if op == "iexact":
        return str(value).lower() == str(arg).lower()
    if op == "gt":
        return value > arg
    if op == "gte":
        return value >= arg
    if op == "lt":
        return value < arg
    if op == "lte":
        return value <= arg
    if op == "contains":
        return str(arg) in str(value)
    if op == "icontains":
        return str(arg).lower() in str(value).lower()
    if op == "in":
        return value in list(arg)
    if op == "startswith":
        return str(value).startswith(str(arg))
    if op == "endswith":
        return str(value).endswith(str(arg))
    raise FieldError(f"Unsupported lookup '{op}'")


class Q:
    """Combine lookups with | (OR), & (AND) and ~ (NOT)."""

    def __init__(self, **kw):
        self.children = [("leaf", kw)]
        self.connector = "AND"
        self.negated = False

    def _combine(self, other, conn):
        q = Q()
        q.children = [("q", self), ("q", other)]
        q.connector = conn
        return q

    def __or__(self, other):
        return self._combine(other, "OR")

    def __and__(self, other):
        return self._combine(other, "AND")

    def __invert__(self):
        q = Q()
        q.children = [("q", self)]
        q.negated = True
        return q


class QuerySet:
    def __init__(self, model, conds=None, order=None, low=0, high=None, select=None, prefetch=None, values=None, flat=False):
        self.model = model
        self._conds = conds or []  # list of (negated, Q)
        self._order = order
        self._low = low
        self._high = high
        self._select = select or []
        self._prefetch = prefetch or []
        self._values = values
        self._flat = flat
        self._result_cache = None

    def _clone(self, **kw):
        d = dict(conds=list(self._conds), order=self._order, low=self._low, high=self._high, select=list(self._select), prefetch=list(self._prefetch), values=self._values, flat=self._flat)
        d.update(kw)
        return QuerySet(self.model, **d)

    # ── chaining (lazy: nothing hits the database here) ──
    def all(self):
        return self._clone()

    def filter(self, *qs, **kw):
        conds = list(self._conds)
        for q in qs:
            conds.append((False, q))
        if kw:
            conds.append((False, Q(**kw)))
        return self._clone(conds=conds)

    def exclude(self, *qs, **kw):
        conds = list(self._conds)
        for q in qs:
            conds.append((True, q))
        if kw:
            conds.append((True, Q(**kw)))
        return self._clone(conds=conds)

    def order_by(self, *fields):
        return self._clone(order=list(fields))

    def select_related(self, *fields):
        return self._clone(select=self._select + list(fields))

    def prefetch_related(self, *fields):
        return self._clone(prefetch=self._prefetch + list(fields))

    def values(self, *fields):
        return self._clone(values=list(fields) or [f.name if not isinstance(f, ForeignKey) else f.column for f in self.model._meta.concrete], flat=False)

    def values_list(self, *fields, flat=False):
        if flat and len(fields) != 1:
            raise TypeError("'flat' is only valid when values_list is called with a single field.")
        return self._clone(values=list(fields), flat="flat" if flat else "tuple")

    def __getitem__(self, k):
        if isinstance(k, slice):
            if k.step:
                raise ValueError("Step is not supported")
            low = self._low + (k.start or 0)
            high = self._low + k.stop if k.stop is not None else self._high
            if self._high is not None and high is not None:
                high = min(high, self._high)
            return self._clone(low=low, high=high)
        if k < 0:
            raise ValueError("Negative indexing is not supported.")
        return list(self._clone(low=self._low + k, high=self._low + k + 1))[0]

    # ── SQL text ──
    def _where_sql(self):
        parts = []
        for negated, q in self._conds:
            s = self._q_sql(q)
            parts.append(f"NOT ({s})" if negated else s)
        return " AND ".join(parts)

    def _q_sql(self, q):
        out = []
        for kind, item in q.children:
            if kind == "leaf":
                for key, val in item.items():
                    col, op = self._lookup_sql(key)
                    if op == "isnull":
                        out.append(f"{col} IS {'NULL' if val else 'NOT NULL'}")
                    elif op in ("contains", "icontains"):
                        out.append(f"{col} {_OPS[op]} '%{val}%'")
                    elif op == "startswith":
                        out.append(f"{col} LIKE '{val}%'")
                    elif op == "endswith":
                        out.append(f"{col} LIKE '%{val}'")
                    else:
                        out.append(f"{col} {_OPS[op]} {_sql_value(val.pk if isinstance(val, Model) else val)}")
            else:
                out.append("(" + self._q_sql(item) + ")")
        s = f" {q.connector} ".join(out)
        return f"NOT ({s})" if q.negated else s

    def _lookup_sql(self, key):
        parts = key.split("__")
        op = "exact"
        if len(parts) > 1 and parts[-1] in _LOOKUPS:
            op = parts.pop()
        model = self.model
        table = model._meta.table
        for i, p in enumerate(parts):
            if p == "pk":
                p = "id"
            f = model._meta.get_field(p)
            if isinstance(f, ForeignKey) and i < len(parts) - 1:
                model = f.remote_model()
                table = model._meta.table
                continue
            return f"{table}.{f.column}", op
        return f"{table}.id", op

    def _joins(self):
        joins = []
        for negated, q in self._conds:
            for key in _q_keys(q):
                parts = key.split("__")
                model = self.model
                for p in parts[:-1]:
                    try:
                        f = model._meta.get_field(p)
                    except FieldError:
                        break
                    if isinstance(f, ForeignKey):
                        rm = f.remote_model()
                        j = f"INNER JOIN {rm._meta.table} ON {model._meta.table}.{f.column} = {rm._meta.table}.id"
                        if j not in joins:
                            joins.append(j)
                        model = rm
        for name in self._select:
            model = self.model
            for p in name.split("__"):
                f = model._meta.get_field(p)
                rm = f.remote_model()
                j = f"LEFT OUTER JOIN {rm._meta.table} ON {model._meta.table}.{f.column} = {rm._meta.table}.id"
                if j not in joins:
                    joins.append(j)
                model = rm
        return joins

    @property
    def query(self):
        return self._sql()

    def _sql(self, count=False):
        t = self.model._meta.table
        if count:
            cols = "COUNT(*)"
        elif self._values is not None:
            cols = ", ".join(f"{t}.{c}" for c in self._values)
        else:
            cols = ", ".join([f"{t}.*"] + [f"{self._rel_model(n)._meta.table}.*" for n in self._select])
        sql = f"SELECT {cols} FROM {t}"
        joins = self._joins()
        if joins:
            sql += " " + " ".join(joins)
        where = self._where_sql()
        if where:
            sql += f" WHERE {where}"
        order = self._effective_order()
        if order and not count:
            sql += " ORDER BY " + ", ".join(f"{t}.{o.lstrip('-')} {'DESC' if o.startswith('-') else 'ASC'}" for o in order)
        if self._high is not None and not count:
            sql += f" LIMIT {self._high - self._low}"
        if self._low and not count:
            sql += f" OFFSET {self._low}"
        return sql

    def _rel_model(self, path):
        model = self.model
        for p in path.split("__"):
            model = model._meta.get_field(p).remote_model()
        return model

    def _effective_order(self):
        return self._order if self._order is not None else self.model._meta.ordering

    # ── evaluation ──
    def _eq_hint(self):
        """Pick a simple equality condition usable with an index (col, value)."""
        for negated, q in self._conds:
            if negated or q.connector != "AND" or q.negated:
                continue
            for kind, item in q.children:
                if kind != "leaf":
                    continue
                for key, val in item.items():
                    parts = key.split("__")
                    if len(parts) == 2 and parts[1] == "exact":
                        parts = parts[:1]
                    if len(parts) == 1:
                        name = "id" if parts[0] == "pk" else parts[0]
                        try:
                            f = self.model._meta.get_field(name)
                        except FieldError:
                            continue
                        return f.column, val.pk if isinstance(val, Model) else val
        return None

    def _rows(self):
        ensure_table(self.model)
        c = _conn()
        rows, _, index = c.scan(self.model._meta.table, self._eq_hint())
        examined = len(rows)
        out = [r for r in rows if self._row_matches(r)]
        order = self._effective_order()
        for o in reversed(order or []):
            name = o.lstrip("-")
            col = "id" if name == "pk" else self.model._meta.get_field(name).column
            out.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=o.startswith("-"))
        out = out[self._low : self._high] if self._high is not None else out[self._low :]
        return out, examined, index

    def _row_matches(self, row):
        for negated, q in self._conds:
            ok = self._q_match(q, row)
            if ok == negated:
                return False
        return True

    def _q_match(self, q, row):
        results = []
        for kind, item in q.children:
            if kind == "leaf":
                results.append(all(self._lookup_match(row, k, v) for k, v in item.items()))
            else:
                results.append(self._q_match(item, row))
        r = all(results) if q.connector == "AND" else any(results)
        return not r if q.negated else r

    def _lookup_match(self, row, key, arg):
        parts = key.split("__")
        op = "exact"
        if len(parts) > 1 and parts[-1] in _LOOKUPS:
            op = parts.pop()
        if isinstance(arg, Model):
            arg = arg.pk
        model = self.model
        cur = row
        for i, p in enumerate(parts):
            if p == "pk":
                p = "id"
            f = model._meta.get_field(p)
            if isinstance(f, ManyToManyField):
                rm = f.remote_model()
                t = _conn().tables.get(f.through)
                a, b = _m2m_cols(f)
                ids = [r[b] for r in t.rows.values() if r[a] == cur["id"]] if t else []
                rest = "__".join(parts[i + 1 :]) or "id"
                sub = rm.objects.filter(**{rest + "__" + op: arg})
                return any(r["id"] in ids for r in sub._rows_silent())
            if isinstance(f, ForeignKey) and i < len(parts) - 1:
                fk = cur.get(f.column)
                if fk is None:
                    return op == "isnull" and arg
                model = f.remote_model()
                cur = _conn().tables[model._meta.table].rows.get(fk)
                if cur is None:
                    return False
                continue
            return _match(cur.get(f.column), op, arg)
        return _match(cur.get("id"), op, arg)

    def _rows_silent(self):
        rows, _, _ = self._rows()
        return rows

    def _fetch_all(self):
        if self._result_cache is not None:
            return
        rows, examined, index = self._rows()
        _conn().log(self._sql(), examined, index)
        if self._values is not None:
            if self._flat == "flat":
                self._result_cache = [self._value(r, self._values[0]) for r in rows]
            elif self._flat == "tuple":
                self._result_cache = [tuple(self._value(r, f) for f in self._values) for r in rows]
            else:
                self._result_cache = [{f: self._value(r, f) for f in self._values} for r in rows]
            return
        objs = [_from_row(self.model, r) for r in rows]
        for path in self._select:
            for o in objs:
                _attach_select(o, path)
        for name in self._prefetch:
            _prefetch(self.model, objs, name)
        self._result_cache = objs

    def _value(self, row, name):
        if "__" in name:
            parts = name.split("__")
            model, cur = self.model, row
            for p in parts[:-1]:
                f = model._meta.get_field(p)
                model = f.remote_model()
                cur = _conn().tables[model._meta.table].rows.get(cur.get(f.column)) or {}
            return cur.get(model._meta.get_field(parts[-1]).column)
        if name == "pk":
            return row["id"]
        return row.get(self.model._meta.get_field(name).column)

    def __iter__(self):
        self._fetch_all()
        return iter(self._result_cache)

    def __len__(self):
        self._fetch_all()
        return len(self._result_cache)

    def __bool__(self):
        self._fetch_all()
        return bool(self._result_cache)

    def __repr__(self):
        self._fetch_all()
        items = self._result_cache[:20]
        return f"<QuerySet {items!r}>"

    def count(self):
        if self._result_cache is not None:
            return len(self._result_cache)
        rows, examined, index = self._rows()
        _conn().log(self._sql(count=True), examined, index)
        return len(rows)

    def exists(self):
        if self._result_cache is not None:
            return bool(self._result_cache)
        rows, examined, index = self._rows()
        where = f" WHERE {self._where_sql()}" if self._conds else ""
        _conn().log(f"SELECT 1 FROM {self.model._meta.table}{where} LIMIT 1", examined, index)
        return bool(rows)

    def get(self, *qs, **kw):
        qset = self.filter(*qs, **kw) if (qs or kw) else self
        rows = list(qset._clone(low=qset._low, high=qset._high))
        if not rows:
            raise self.model.DoesNotExist(f"{self.model.__name__} matching query does not exist.")
        if len(rows) > 1:
            raise self.model.MultipleObjectsReturned(f"get() returned more than one {self.model.__name__} -- it returned {len(rows)}!")
        return rows[0]

    def first(self):
        qs = self if self._effective_order() else self.order_by("id")
        rows = list(qs[:1])
        return rows[0] if rows else None

    def last(self):
        order = self._effective_order() or ["id"]
        flipped = [o[1:] if o.startswith("-") else "-" + o for o in order]
        rows = list(self.order_by(*flipped)[:1])
        return rows[0] if rows else None

    def create(self, **kw):
        return self.model(**kw).save()

    def get_or_create(self, defaults=None, **kw):
        try:
            return self.get(**kw), False
        except self.model.DoesNotExist:
            return self.create(**{**kw, **(defaults or {})}), True

    def update(self, **kw):
        rows, examined, index = self._rows()
        t = ensure_table(self.model)
        vals = {}
        for k, v in kw.items():
            f = self.model._meta.get_field(k)
            vals[f.column] = v.pk if isinstance(v, Model) else v
        where = self._where_sql()
        _conn().log(f"UPDATE {t.name} SET " + ", ".join(f"{k} = {_sql_value(v)}" for k, v in vals.items()) + (f" WHERE {where}" if where else ""), examined, index)
        for r in rows:
            t.update(r["id"], vals)
        return len(rows)

    def delete(self):
        rows, _, _ = self._rows()
        return _delete_objects(self.model, [r["id"] for r in rows])

    def in_bulk(self, ids):
        return {o.pk: o for o in self.filter(id__in=list(ids))}

    def aggregate_count(self):
        return self.count()


def _q_keys(q):
    for kind, item in q.children:
        if kind == "leaf":
            yield from item.keys()
        else:
            yield from _q_keys(item)


def _from_row(model, row):
    obj = model.__new__(model)
    obj.__dict__["_cache"] = {}
    for f in model._meta.concrete:
        obj.__dict__[f.column] = row.get(f.column)
    return obj


def _attach_select(obj, path):
    cur = obj
    for p in path.split("__"):
        f = type(cur)._meta.get_field(p)
        fk = cur.__dict__.get(f.column)
        rm = f.remote_model()
        row = _conn().tables[rm._meta.table].rows.get(fk) if fk is not None else None
        rel = _from_row(rm, row) if row else None
        cur.__dict__["_cache"][f.name] = rel
        if rel is None:
            return
        cur = rel


def _m2m_cols(f):
    a, b = f.model.__name__.lower() + "_id", f.remote_model().__name__.lower() + "_id"
    if a == b:
        a, b = "from_" + a, "to_" + b
    return a, b


def _prefetch(model, objs, name):
    """One extra query for the whole batch instead of one per object."""
    if not objs:
        return
    ids = [o.pk for o in objs]
    # reverse FK (author.book_set / related_name)
    for other in list(_registry.values()):
        for f in getattr(other, "_meta").fields:
            if isinstance(f, ForeignKey) and f.related_name == name and f.remote_model() is model:
                children = list(other.objects.filter(**{f.column + "__in": ids}))
                for o in objs:
                    o.__dict__["_cache"]["_pf_" + name] = [c for c in children if c.__dict__.get(f.column) == o.pk]
                return
    f = model._meta.get_field(name)
    if isinstance(f, ManyToManyField):
        ensure_table(model)
        t = _conn().tables[f.through]
        a, b = _m2m_cols(f)
        links = [r for r in t.rows.values() if r[a] in ids]
        _conn().log(f"SELECT {f.through}.* FROM {f.through} WHERE {a} IN {_sql_value(ids)}", len(t.rows), a)
        targets = {x.pk: x for x in f.remote_model().objects.filter(id__in=sorted({r[b] for r in links}))}
        for o in objs:
            o.__dict__["_cache"]["_pf_" + name] = [targets[r[b]] for r in links if r[a] == o.pk and r[b] in targets]
        return
    if isinstance(f, ForeignKey):
        rel_ids = sorted({o.__dict__.get(f.column) for o in objs if o.__dict__.get(f.column) is not None})
        targets = {x.pk: x for x in f.remote_model().objects.filter(id__in=rel_ids)}
        for o in objs:
            o.__dict__["_cache"][f.name] = targets.get(o.__dict__.get(f.column))
        return
    raise FieldError(f"Cannot prefetch '{name}'")


class Manager:
    def __init__(self, model):
        self.model = model

    def get_queryset(self):
        return QuerySet(self.model)

    def __getattr__(self, name):
        return getattr(self.get_queryset(), name)

    def __iter__(self):
        raise TypeError("'Manager' object is not iterable — use .all()")


class _RelatedManager(Manager):
    def __init__(self, model, filt, instance, name):
        super().__init__(model)
        self._filt = filt
        self._instance = instance
        self._name = name

    def get_queryset(self):
        cached = self._instance.__dict__.get("_cache", {}).get("_pf_" + self._name)
        qs = QuerySet(self.model).filter(**self._filt)
        if cached is not None:
            qs._result_cache = list(cached)
        return qs

    def create(self, **kw):
        kw.update(self._filt)
        return self.model(**kw).save()

    def all(self):
        return self.get_queryset()


class _M2MManager:
    def __init__(self, field, instance, forward):
        self.field = field
        self.instance = instance
        self.forward = forward
        self.target = field.remote_model() if forward else field.model
        ensure_table(field.model)

    def _cols(self):
        a, b = _m2m_cols(self.field)
        return (a, b) if self.forward else (b, a)

    def _links(self):
        t = _conn().tables[self.field.through]
        mine, other = self._cols()
        return t, mine, other

    def get_queryset(self):
        name = self.field.name if self.forward else self.field.related_name
        cached = self.instance.__dict__.get("_cache", {}).get("_pf_" + name)
        t, mine, other = self._links()
        _conn().log(f"SELECT {other} FROM {self.field.through} WHERE {mine} = {self.instance.pk}", len(t.rows), mine)
        ids = [r[other] for r in t.rows.values() if r[mine] == self.instance.pk]
        qs = self.target.objects.filter(id__in=ids)
        if cached is not None:
            qs._result_cache = list(cached)
        return qs

    def all(self):
        return self.get_queryset()

    def __getattr__(self, name):
        return getattr(self.get_queryset(), name)

    def add(self, *objs):
        t, mine, other = self._links()
        existing = {r[other] for r in t.rows.values() if r[mine] == self.instance.pk}
        for o in objs:
            pk = o.pk if isinstance(o, Model) else o
            if pk not in existing:
                t.insert({mine: self.instance.pk, other: pk})
                _conn().log(f"INSERT INTO {self.field.through} ({mine}, {other}) VALUES ({self.instance.pk}, {pk})")
                existing.add(pk)

    def remove(self, *objs):
        t, mine, other = self._links()
        pks = {o.pk if isinstance(o, Model) else o for o in objs}
        for r in list(t.rows.values()):
            if r[mine] == self.instance.pk and r[other] in pks:
                t.delete(r["id"])
        _conn().log(f"DELETE FROM {self.field.through} WHERE {mine} = {self.instance.pk} AND {other} IN {_sql_value(sorted(pks))}")

    def clear(self):
        t, mine, other = self._links()
        for r in list(t.rows.values()):
            if r[mine] == self.instance.pk:
                t.delete(r["id"])
        _conn().log(f"DELETE FROM {self.field.through} WHERE {mine} = {self.instance.pk}")

    def set(self, objs):
        self.clear()
        self.add(*objs)

    def count(self):
        return self.get_queryset().count()


def model_to_dict(obj, fields=None):
    out = {}
    for f in obj._meta.concrete:
        if fields and f.name not in fields:
            continue
        out[f.name] = obj.__dict__.get(f.column)
    return out
