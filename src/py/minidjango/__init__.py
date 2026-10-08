"""minidjango — a small teaching library that mirrors Django's names and behaviour.

It runs entirely in the browser (Pyodide), so lessons can execute and test real
Django-style code. It is a faithful simulation of the concepts, not Django.

    from minidjango import models, serializers, transaction
    from minidjango.http import App, path, JsonResponse, HttpRequest
    from minidjango.db import connection
"""
from . import db, exceptions, http, migrations, models, serializers, transaction  # noqa: F401
from .db import connection, reset_db  # noqa: F401
from .exceptions import Http404, PermissionDenied, ValidationError  # noqa: F401
from .http import App, HttpRequest, HttpResponse, JsonResponse, View, get_object_or_404, path  # noqa: F401


def query_log():
    """The SQL statements executed so far (strings)."""
    return [q["sql"] for q in db.connection.queries]


def reset():
    """Empty database, cleared query log, sessions and tokens."""
    db.reset_db()
    try:
        from . import auth

        auth.SESSIONS.clear()
        auth.TOKENS.clear()
    except Exception:  # noqa: BLE001
        pass
