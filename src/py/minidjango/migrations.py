"""makemigrations, simplified: diff two schema states into operations + SQL."""
from . import models as m


def model_state(model):
    """{'name': 'Article', 'table': 'article', 'fields': {'title': 'CharField(max_length=200)', ...}}"""
    fields = {f.name: f.describe() for f in model._meta.concrete if not f.primary_key}
    for f in model._meta.m2m:
        fields[f.name] = f.describe()
    return {"name": model.__name__, "table": model._meta.table, "fields": fields}


def project_state(*models):
    return {mod.__name__: model_state(mod) for mod in models}


def diff(old, new):
    """Return operations (as readable strings) that turn schema `old` into `new`."""
    ops = []
    for name in new:
        if name not in old:
            cols = ", ".join(f"{k}={v}" for k, v in new[name]["fields"].items())
            ops.append(f"CreateModel {name}({cols})")
    for name in new:
        if name not in old:
            continue
        of, nf = old[name]["fields"], new[name]["fields"]
        for k in nf:
            if k not in of:
                ops.append(f"AddField {name}.{k} {nf[k]}")
            elif of[k] != nf[k]:
                ops.append(f"AlterField {name}.{k} {of[k]} -> {nf[k]}")
        for k in of:
            if k not in nf:
                ops.append(f"RemoveField {name}.{k}")
    for name in old:
        if name not in new:
            ops.append(f"DeleteModel {name}")
    return ops


def sql_for(op, new_state=None):
    """Approximate SQL for one operation string."""
    kind, rest = op.split(" ", 1)
    if kind == "CreateModel":
        name = rest.split("(", 1)[0]
        return f"CREATE TABLE {name.lower()} (...);"
    if kind == "DeleteModel":
        return f"DROP TABLE {rest.lower()};"
    target = rest.split(" ", 1)[0]
    table, col = target.split(".")
    if kind == "AddField":
        return f"ALTER TABLE {table.lower()} ADD COLUMN {col} ...;"
    if kind == "RemoveField":
        return f"ALTER TABLE {table.lower()} DROP COLUMN {col};"
    return f"ALTER TABLE {table.lower()} ALTER COLUMN {col} ...;"


__all__ = ["model_state", "project_state", "diff", "sql_for", "m"]
