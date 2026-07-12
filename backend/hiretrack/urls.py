"""
Root URL configuration for HireTrack.

Django admin, a lightweight health-check endpoint, and the REST API
(serializers/viewsets/routers) mounted under `/api/` (see `core/urls.py`).
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def healthz(_request):
    """Simple liveness probe."""
    return JsonResponse({"status": "ok", "service": "hiretrack-backend"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz/", healthz, name="healthz"),
    path("api/", include("core.urls")),
]

# Serve uploaded resumes during development only.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
