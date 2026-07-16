import time
from functools import wraps

from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone

from .models import AdminSession


def get_bearer_token(request):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header[len("Bearer "):].strip()


def get_admin_session(request):
    token = get_bearer_token(request)
    if not token:
        return None
    try:
        session = AdminSession.objects.select_related("admin_user").get(token=token)
    except AdminSession.DoesNotExist:
        return None
    if not session.is_valid():
        return None
    return session


def require_admin(view_func):
    """Equivalent of the original Express `requireAdmin` middleware."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        session = get_admin_session(request)
        if session is None:
            return JsonResponse({"error": "Unauthorized administrative access."}, status=401)
        request.admin_session = session
        return view_func(request, *args, **kwargs)

    return wrapper


def rate_limit(key_prefix, max_attempts=10, window_seconds=60):
    """Very small fixed-window rate limiter backed by Django's cache framework.
    Protects sensitive endpoints (e.g. login) from brute-force abuse.
    """

    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            client_ip = request.META.get("REMOTE_ADDR", "unknown")
            cache_key = f"ratelimit:{key_prefix}:{client_ip}"
            attempts = cache.get(cache_key, 0)
            if attempts >= max_attempts:
                return JsonResponse(
                    {"error": "Too many requests. Please try again shortly."}, status=429
                )
            cache.set(cache_key, attempts + 1, timeout=window_seconds)
            return view_func(request, *args, **kwargs)

        return wrapper

    return decorator


from rest_framework.permissions import BasePermission


class IsAdminOrReadOnly(BasePermission):
    """DRF permission class: anyone can read (GET/HEAD/OPTIONS), but write
    methods require the same Bearer <AdminSession token> used by the rest of
    the API (admin login via /api/auth/login)."""

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    def has_permission(self, request, view):
        if request.method in self.SAFE_METHODS:
            return True
        return get_admin_session(request) is not None


class IsAdmin(BasePermission):
    """DRF permission class requiring a valid admin Bearer token for every
    method, including reads (used for the orders/payments viewsets, which
    contain customer PII and were admin-only in the original API)."""

    def has_permission(self, request, view):
        return get_admin_session(request) is not None
