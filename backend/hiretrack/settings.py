"""
Django settings for the HireTrack HR Recruitment Portal.

Single-user application (one HR user). PostgreSQL backend, DRF API layer.
Configuration is driven by environment variables loaded from a `.env` file
located in the `backend/` directory (see `.env.example`).
"""
from pathlib import Path
import os

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths & environment
# ---------------------------------------------------------------------------
# BASE_DIR = .../backend
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from backend/.env (if present).
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
# https origins trusted for unsafe (CSRF-protected) requests — the deployed
# frontend and API domains. Required once the SPA is served from another host.
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # PostgreSQL specific features (SearchVector, GinIndex, etc.)
    "django.contrib.postgres",
    # Third-party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "django_filters",
    # Local apps
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves the collected static files (Django admin/DRF assets) directly from
    # the web process — no separate static host needed on Render's free tier.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Captures the acting user for audit logging (must run after Authentication).
    "core.middleware.CurrentUserMiddleware",
]

ROOT_URLCONF = "hiretrack.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "hiretrack.wsgi.application"
ASGI_APPLICATION = "hiretrack.asgi.application"

# ---------------------------------------------------------------------------
# Database (PostgreSQL)
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        # .strip() guards against stray whitespace pasted into a dashboard env
        # var (e.g. a leading space in POSTGRES_DB → 'database " neondb"' errors).
        "NAME": os.getenv("POSTGRES_DB", "hiretrack").strip(),
        "USER": os.getenv("POSTGRES_USER", "hiretrack").strip(),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "hiretrack"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost").strip(),
        "PORT": os.getenv("POSTGRES_PORT", "5432").strip(),
        "CONN_MAX_AGE": 60,
        # Neon (and most managed Postgres) require SSL. Default to "prefer" so a
        # plain local server still works; set POSTGRES_SSLMODE=require for Neon.
        "OPTIONS": {"sslmode": os.getenv("POSTGRES_SSLMODE", "prefer").strip()},
    }
}

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static & media files
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
# Resume uploads are stored under MEDIA_ROOT/resumes/ (see core.models.Resume).

# Media storage backend. Free hosts (Render) have an EPHEMERAL filesystem that
# is wiped on every redeploy, which would destroy uploaded resumes. When the
# R2_* env vars are set, media is stored in a Cloudflare R2 (S3-compatible)
# bucket instead; with them unset the app uses the local filesystem (dev).
R2_BUCKET = os.getenv("R2_BUCKET", "")

if R2_BUCKET:
    _media_storage = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "access_key": os.getenv("R2_ACCESS_KEY_ID", ""),
            "secret_key": os.getenv("R2_SECRET_ACCESS_KEY", ""),
            "bucket_name": R2_BUCKET,
            "endpoint_url": os.getenv("R2_ENDPOINT_URL", ""),
            "region_name": os.getenv("R2_REGION", "auto"),
            "signature_version": "s3v4",
            "default_acl": None,          # R2 has no ACLs; bucket stays private
            "querystring_auth": True,     # serve resumes via short-lived signed URLs
            "file_overwrite": False,      # never clobber an existing upload
        },
    }
else:
    _media_storage = {"BACKEND": "django.core.files.storage.FileSystemStorage"}

STORAGES = {
    "default": _media_storage,
    # WhiteNoise: compress + hash static filenames for far-future caching.
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Maximum resume upload size (10 MB) — enforced by the API layer later.
RESUME_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
RESUME_ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"]

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # Token auth FIRST: the SPA logs in once (/api/auth/login/) and sends
        # `Authorization: Token <key>` thereafter, so each authenticated request
        # is a single indexed token lookup with NO per-request PBKDF2 password
        # hashing (unlike Basic auth, which re-hashes the password every call).
        "rest_framework.authentication.TokenAuthentication",
        # Session + Basic kept as fallbacks so Django admin and existing flows
        # keep working.
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DATETIME_FORMAT": "iso-8601",
}

# ---------------------------------------------------------------------------
# CORS (React dev server — Vite defaults to :5173)
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:3000,http://127.0.0.1:3000",
)
# Allow the SPA to send the session cookie / basic-auth credentials.
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Production security (only when DEBUG is off, i.e. on the deployed host)
# ---------------------------------------------------------------------------
if not DEBUG:
    # Render/Vercel terminate TLS at the edge and forward X-Forwarded-Proto, so
    # Django can tell an HTTPS request from the proxied header.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_HSTS_SECONDS", "3600"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Claude / Anthropic — resume parsing (Modules 2 & 3)
# ---------------------------------------------------------------------------
# When ANTHROPIC_API_KEY is set, resumes are parsed with Claude; otherwise the
# pipeline falls back to the built-in regex/heuristic extractor. A Claude error
# at request time also falls back to the heuristic extractor automatically.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

# Feature flag: set RESUME_PARSING_ENABLED=False to store uploads without parsing.
RESUME_PARSING_ENABLED = env_bool("RESUME_PARSING_ENABLED", True)
# Wall-clock timeout (seconds) for the Claude call, to respect the 10s parse
# budget (BRD §5). Also the max tokens the extractor may generate.
RESUME_PARSE_TIMEOUT = float(os.getenv("RESUME_PARSE_TIMEOUT", "10"))
RESUME_PARSE_MAX_TOKENS = int(os.getenv("RESUME_PARSE_MAX_TOKENS", "2048"))

# ---------------------------------------------------------------------------
# Email (Module 10 — interview-scheduled HR notification)
# ---------------------------------------------------------------------------
# Best-effort email is sent to HR_NOTIFY_EMAIL when an interview is scheduled
# (see core.signals). With no SMTP credentials the default console backend just
# prints the message to the server log, so it works out of the box in dev. To
# actually deliver mail, set EMAIL_BACKEND to the SMTP backend and provide the
# EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD values in backend/.env.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv(
    "DEFAULT_FROM_EMAIL", "HireTrack <no-reply@hiretrack.local>"
)
# Recipient of interview-scheduled notification emails (the single HR user).
HR_NOTIFY_EMAIL = os.getenv("HR_NOTIFY_EMAIL", "avinash.selvan@skypointcloud.com")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
