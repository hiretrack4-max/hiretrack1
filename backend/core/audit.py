"""
Thread-local storage for the currently-acting user.

Because HireTrack records audit logs from model signals (which have no access
to the HTTP request), the acting user is stashed in a thread-local by
``core.middleware.CurrentUserMiddleware`` and read back here.
"""
from contextlib import contextmanager
from threading import local

_state = local()


def set_current_user(user):
    _state.user = user


def get_current_user():
    return getattr(_state, "user", None)


def clear_current_user():
    if hasattr(_state, "user"):
        del _state.user


@contextmanager
def acting_as(user):
    """Temporarily set the acting user (useful in management commands/tests)."""
    previous = get_current_user()
    set_current_user(user)
    try:
        yield
    finally:
        set_current_user(previous)
