from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include


def health_check(request):
    return JsonResponse({"status": "ok", "service": "glow-state-peptides-api"})


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("", health_check),
    path("api/", include("api.urls")),
]
