"""In-memory database used by the mini ORM.

Every query the ORM runs is logged as readable SQL together with how many rows
were examined and whether an index was used, so lessons can count queries
(N+1), compare full scans with index lookups, and watch transactions.
"""
import copy


class IntegrityError(Exception):
    pass


class Table:
    def __init__(self, name, columns, unique=(), indexes=()):
        self.name = name
        self.columns = list(columns)
        self.rows = {}  # pk -> dict
        self.next_id = 1
        self.unique = set(unique)
        # column -> {value: set(pk)}
        self.indexes = {c: {} for c in set(indexes) | set(unique) | {"id"}}

    def _index_add(self, row):
        for col, idx in self.indexes.items():
            idx.setdefault(row.get(col), set()).add(row["id"])

    def _index_remove(self, row):
        for col, idx in self.indexes.items():
            s = idx.get(row.get(col))
            if s:
                s.discard(row["id"])
                if not s:
                    del idx[row.get(col)]

    def insert(self, values):
        row = dict(values)
        if row.get("id") is None:
            row["id"] = self.next_id
        self.next_id = max(self.next_id, row["id"] + 1)
        for col in self.unique:
            v = row.get(col)
            if v is not None and self.indexes[col].get(v):
                raise IntegrityError(f"UNIQUE constraint failed: {self.name}.{col}")
        if row["id"] in self.rows:
            raise IntegrityError(f"UNIQUE constraint failed: {self.name}.id")
        self.rows[row["id"]] = row
        self._index_add(row)
        return row["id"]

    def update(self, pk, values):
        old = self.rows[pk]
        new = dict(old)
        new.update(values)
        for col in self.unique:
            v = new.get(col)
            if v is not None and v != old.get(col) and self.indexes[col].get(v):
                raise IntegrityError(f"UNIQUE constraint failed: {self.name}.{col}")
        self._index_remove(old)
        self.rows[pk] = new
        self._index_add(new)

    def delete(self, pk):
        row = self.rows.pop(pk, None)
        if row:
            self._index_remove(row)

    def add_index(self, col):
        idx = {}
        for row in self.rows.values():
            idx.setdefault(row.get(col), set()).add(row["id"])
        self.indexes[col] = idx


class Database:
    def __init__(self):
        self.tables = {}
        self.queries = []
        self._snapshots = []

    # ── schema ──
    def create_table(self, name, columns, unique=(), indexes=()):
        if name not in self.tables:
            self.tables[name] = Table(name, columns, unique, indexes)
        return self.tables[name]

    def table(self, name):
        return self.tables[name]

    # ── query log ──
    def log(self, sql, rows_examined=0, index=None):
        self.queries.append({"sql": sql, "rows_examined": rows_examined, "index": index})

    def reset_queries(self):
        self.queries = []

    @property
    def query_count(self):
        return len([q for q in self.queries if q["sql"].split()[0] in ("SELECT", "INSERT", "UPDATE", "DELETE")])

    # ── scans ──
    def scan(self, table, eq=None):
        """Return candidate rows. If `eq` is (col, value) on an indexed column, use the index."""
        t = self.tables[table]
        if eq is not None and eq[0] in t.indexes:
            pks = t.indexes[eq[0]].get(eq[1], set())
            rows = [t.rows[pk] for pk in sorted(pks)]
            return rows, len(rows), eq[0]
        rows = [t.rows[pk] for pk in sorted(t.rows)]
        return rows, len(rows), None

    # ── transactions ──
    def begin(self):
        self._snapshots.append(copy.deepcopy(self.tables))
        self.log("BEGIN" if len(self._snapshots) == 1 else f"SAVEPOINT s{len(self._snapshots) - 1}")

    def commit(self):
        self._snapshots.pop()
        self.log("COMMIT" if not self._snapshots else f"RELEASE SAVEPOINT s{len(self._snapshots)}")

    def rollback(self):
        self.tables = self._snapshots.pop()
        self.log("ROLLBACK" if not self._snapshots else f"ROLLBACK TO SAVEPOINT s{len(self._snapshots)}")

    @property
    def in_transaction(self):
        return bool(self._snapshots)


connection = Database()


def reset_db():
    """Fresh, empty database (tables are recreated lazily by models)."""
    global connection
    connection.__init__()
    return connection
