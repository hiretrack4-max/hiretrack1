from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "HireTrack Core"

    def ready(self):
        # Register audit-logging and search-vector signal handlers.
        from . import signals  # noqa: F401
