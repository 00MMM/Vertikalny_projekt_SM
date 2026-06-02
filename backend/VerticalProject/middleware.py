from django.conf import settings
from django.http import HttpResponse


class LocalhostCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        if request.method == "OPTIONS" and origin in settings.CORS_ALLOWED_ORIGINS:
            response = HttpResponse()
        else:
            response = self.get_response(request)

        if origin in settings.CORS_ALLOWED_ORIGINS:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Allow-Headers"] = "authorization, content-type"
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

        return response
