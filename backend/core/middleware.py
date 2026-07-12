"""Middleware that records the acting user for audit logging."""
from .audit import clear_current_user, set_current_user


class CurrentUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        set_current_user(user if (user and user.is_authenticated) else None)
        try:
            response = self.get_response(request)
        finally:
            clear_current_user()
        return response
