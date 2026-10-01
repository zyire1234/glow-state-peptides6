"""
Django settings for the Glow State Peptides backend.
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Core / security
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-dev-only-change-this-in-production",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",") if h.strip()
]

# Render sets RENDER_EXTERNAL_HOSTNAME automatically for every deploy.
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME and RENDER_EXTERNAL_HOSTNAME not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()
]
if RENDER_EXTERNAL_HOSTNAME:
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")

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
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"

# ---------------------------------------------------------------------------
# Logging — by default Django only prints tracebacks to the console when
# DEBUG=True, which means unhandled 500 errors in production leave no trace
# in the Render logs at all. This forces every unhandled exception to be
# printed to stdout/stderr (visible in Render's Logs tab) regardless of
# DEBUG, without ever exposing tracebacks to end users (that's controlled by
# DEBUG, unrelated to this).
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Database — PostgreSQL, configured via the DATABASE_URL environment
# variable (provided automatically by Render when a PostgreSQL database is
# attached to this service).
# ---------------------------------------------------------------------------
DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL",
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Public base URL of this backend service, used to build absolute image URLs
# for outbound emails (e.g. the logo) — emails have no "current page" to
# resolve a relative /static/... path against, so it needs the full domain.
SITE_URL = os.environ.get("SITE_URL", "https://glow-state-peptides6.onrender.com")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Product Certificate (COA) uploads are sent as base64 JSON (~33% larger
# than the original file). Certificates are capped at 5MB in views.py, so
# ~7MB comfortably covers the base64 overhead without letting a single
# request buffer an oversized body in memory (kept modest since the web
# service instance runs with a tight RAM ceiling).
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get("DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE", 7 * 1024 * 1024))

# ---------------------------------------------------------------------------
# Django REST Framework — powers the /api/products/, /api/orders/,
# /api/payments/ ModelViewSet endpoints (in addition to the existing plain
# Django views used by the storefront checkout flow).
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
}

# ---------------------------------------------------------------------------
# CORS — the frontend (Netlify) lives on a different origin than the API
# (Render), so it must be explicitly allowed.
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
# Convenient fallback for local frontend dev servers.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
]
# Allow all origins in local/dev by default so the frontend (Vite on any
# port) can always reach the API at http://127.0.0.1:8000/api/. Set
# CORS_ALLOW_ALL_ORIGINS=False in production and rely on CORS_ALLOWED_ORIGINS
# above instead.
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL_ORIGINS", "True").lower() == "true"
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
    "x-requested-with",
]

# ---------------------------------------------------------------------------
# Admin bootstrap credentials (used only to seed the first admin account)
# ---------------------------------------------------------------------------
DEFAULT_ADMIN_USERNAME = os.environ.get("ADMIN_DEFAULT_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_DEFAULT_PASSWORD", "glowstate2026")

# ---------------------------------------------------------------------------
# Outbound email (order notifications). All optional — if SMTP is not
# configured, notifications are simply logged to the Activity feed instead
# of being sent, exactly like the previous mocked-email behaviour.
# ---------------------------------------------------------------------------
EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "False").lower() == "true"
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("SMTP_HOST", "")
EMAIL_PORT = int(os.environ.get("SMTP_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("SMTP_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("SMTP_USE_TLS", "True").lower() == "true"
DEFAULT_FROM_EMAIL = os.environ.get("SMTP_FROM", "no-reply@glowstatepeptides.com")
ADMIN_NOTIFICATION_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", DEFAULT_FROM_EMAIL)

# ---------------------------------------------------------------------------
# PayPal REST API (Orders v2) — server-side only. The client ID is also
# exposed publicly via /api/payment-details so the frontend JS SDK can load
# (client IDs are not secret), but the client secret NEVER leaves the server.
# ---------------------------------------------------------------------------
PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "sandbox")  # "sandbox" or "live"
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "")

# ---------------------------------------------------------------------------
# Security headers (tightened automatically when DEBUG=False)
# ---------------------------------------------------------------------------
if not DEBUG:
    SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SSL_REDIRECT", "True").lower() == "true"
    # Tell Django to trust Render's "X-Forwarded-Proto" header so it correctly
    # recognizes real HTTPS requests (Render terminates TLS at the edge and
    # forwards internally as plain HTTP). Without this, Django thinks every
    # request — including Render's own health checks — is insecure and
    # 301-redirects it, which can cause repeated service restarts.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# Email campaigns (Feature 1: promotional message, Feature 2: returning-
# customer discount code). All optional / safe defaults.
# ---------------------------------------------------------------------------
# The business's local time zone. Django's own TIME_ZONE stays UTC so nothing
# existing changes; campaign deadlines are converted explicitly to this zone
# (daylight saving is handled automatically — Sydney moves to AEDT on
# Sunday 4 Oct 2026).
BUSINESS_TIMEZONE = os.environ.get("BUSINESS_TIMEZONE", "Australia/Sydney")

# Feature 1 — anyone who places an order up to this moment (business local
# time, ISO format) automatically receives the promo email at checkout.
PROMO_ORDER_WINDOW_END = os.environ.get("PROMO_ORDER_WINDOW_END", "2026-10-04T18:00:00")
# Set to "False" in Render to switch off the automatic at-checkout promo.
PROMO_AUTO_SEND_ON_ORDER = os.environ.get("PROMO_AUTO_SEND_ON_ORDER", "True").lower() == "true"

# Feature 1 — scheduled blast to everyone already on file. The web server
# checks the clock every 30 seconds and fires ONCE at this moment (business
# time zone). Leave blank ("") to switch the timer off. If the server happens
# to be down at that moment it still fires when it comes back, but only
# within PROMO_BLAST_GRACE_HOURS of the scheduled time.
PROMO_BLAST_AT = os.environ.get("PROMO_BLAST_AT", "2026-10-02T15:00:00")
PROMO_BLAST_GRACE_HOURS = int(os.environ.get("PROMO_BLAST_GRACE_HOURS", "12"))
