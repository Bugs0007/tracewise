"""transaction.atomic: all-or-nothing blocks (nested blocks become savepoints)."""
import functools

from . import db as _db


class _Atomic:
    def __enter__(self):
        _db.connection.begin()
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            _db.connection.commit()
        else:
            _db.connection.rollback()
        return False  # re-raise

    def __call__(self, fn):
        @functools.wraps(fn)
        def wrapper(*a, **kw):
            with _Atomic():
                return fn(*a, **kw)

        return wrapper


def atomic(fn=None):
    """Use as `with transaction.atomic():` or as a `@transaction.atomic` decorator."""
    if callable(fn):
        return _Atomic()(fn)
    return _Atomic()
