import json
import secrets

from django.contrib.auth import authenticate
from django.db.models import Count
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import AuthToken, Device, DeviceMeasurement


def get_auth_token(request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Token "):
        token = auth[6:]
        try:
            return AuthToken.objects.select_related("user").get(token=token)
        except AuthToken.DoesNotExist:
            pass
    return None


ALLOWED_TYPES = {"int", "float", "string", "bool"}
POLLUTANT_KEYS = ("aqi", "so2", "o3", "pm10", "no2")


def numeric_value(data, key, default=0):
    value = data.get(key, default)
    return value if isinstance(value, int | float) else default


def build_dashboard_payload():
    measurements = list(
        DeviceMeasurement.objects.select_related("device").order_by("-received_at")[:30]
    )
    history_source = list(reversed(measurements))

    history = [
        {
            "label": m.received_at.strftime("%H:%M"),
            **{key: numeric_value(m.data, key) for key in POLLUTANT_KEYS},
        }
        for m in history_source
    ]

    latest = measurements[0] if measurements else None
    latest_data = latest.data if latest else {}
    latest_aqi = numeric_value(latest_data, "aqi")
    aqi_values = [point["aqi"] for point in history]
    average_aqi = round(sum(aqi_values) / len(aqi_values), 1) if aqi_values else 0

    def card_for(key, label, unit=""):
        current = numeric_value(latest_data, key)
        previous = history[-2][key] if len(history) > 1 else current
        return {
            "key": key,
            "label": label,
            "value": current,
            "unit": unit,
            "trend": round(current - previous, 1),
        }

    table = [
        {
            "id": m.id,
            "time": m.received_at.isoformat(),
            "city": m.device.device_id,
            **{key: numeric_value(m.data, key) for key in POLLUTANT_KEYS},
        }
        for m in measurements[:10]
    ]

    return {
        "city": "Bratislava",
        "latest": {
            "aqi": latest_aqi,
            "time": latest.received_at.isoformat() if latest else None,
        },
        "summary": {
            "status": "Air quality",
            "measurements": DeviceMeasurement.objects.aggregate(count=Count("id"))["count"],
            "average_aqi": average_aqi,
            "max_aqi": max(aqi_values) if aqi_values else 0,
        },
        "cards": [
            card_for("aqi", "AQI"),
            card_for("pm10", "PM10"),
            card_for("o3", "O3"),
            card_for("no2", "NO2"),
        ],
        "history": history,
        "table": table,
    }


@csrf_exempt
@require_POST
def mqtt_auth(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        data = request.POST
    try:
        device = Device.objects.get(device_id=data.get("username", ""), is_active=True)
        if device.check_token(data.get("password", "")):
            return HttpResponse(status=200)
    except Device.DoesNotExist:
        pass

    return HttpResponse(status=403)


@csrf_exempt
@require_POST
def mqtt_acl(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        data = request.POST

    username = data.get("username", "")

    if Device.objects.filter(device_id=username, is_active=True).exists():
        return HttpResponse(status=200)

    return HttpResponse(status=403)


@csrf_exempt
@require_POST
def login_api(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    user = authenticate(username=body.get("username", ""), password=body.get("password", ""))
    if user is None or not user.is_staff:
        return JsonResponse({"error": "Invalid credentials"}, status=403)

    token = AuthToken.generate(user)
    return JsonResponse({"token": token.token})


@csrf_exempt
@require_POST
def logout_api(request):
    auth_token = get_auth_token(request)
    if auth_token is None:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    auth_token.delete()
    return JsonResponse({"detail": "Logged out"})


@csrf_exempt
@require_POST
def add_device(request):
    auth_token = get_auth_token(request)
    if auth_token is None or not auth_token.user.is_staff:
        return JsonResponse({"error": "Forbidden"}, status=403)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    device_id = body.get("device_id", "").strip()
    schema = body.get("schema", {})

    if not device_id:
        return JsonResponse({"error": "device_id is required"}, status=400)

    if not isinstance(schema, dict):
        return JsonResponse({"error": "schema must be an object"}, status=400)

    invalid_types = {k: v for k, v in schema.items() if v not in ALLOWED_TYPES}
    if invalid_types:
        return JsonResponse(
            {"error": f"Invalid types: {invalid_types}. Allowed: {ALLOWED_TYPES}"},
            status=400,
        )

    if Device.objects.filter(device_id=device_id).exists():
        return JsonResponse({"error": f"Device '{device_id}' already exists"}, status=409)

    raw_token = secrets.token_hex(32)
    device = Device(device_id=device_id, schema=schema)
    device.set_token(raw_token)
    device.save()

    return JsonResponse(
        {
            "device_id": device_id,
            "schema": schema,
            "token": raw_token,
            "warning": "Save this token now — it won't be shown again",
        },
        status=201,
    )


def measurements_api(request):
    device_id = request.GET.get("device_id")
    limit = int(request.GET.get("limit", 10))

    measurements = DeviceMeasurement.objects.select_related("device").order_by("-received_at")
    if device_id:
        measurements = measurements.filter(device__device_id=device_id)
    total_count = measurements.count()
    measurements = measurements[:limit]

    data = [
        {
            "device_id": m.device.device_id,
            "received_at": m.received_at.isoformat(),
            **m.data,
        }
        for m in measurements
    ]

    return JsonResponse({"count": len(data), "total_count": total_count, "measurements": data})


def devices_api(request):
    limit = int(request.GET.get("limit", 10))

    devices = Device.objects.filter(is_active=True).annotate(total_measurements=Count("measurements"))

    data = []
    for device in devices:
        measurements = DeviceMeasurement.objects.filter(device=device).order_by("-received_at")[:limit]
        data.append({
            "device_id": device.device_id,
            "total_measurements": device.total_measurements,
            "measurements": [
                {
                    "received_at": m.received_at.isoformat(),
                    **m.data,
                }
                for m in measurements
            ],
        })

    return JsonResponse({"count": len(data), "devices": data})


def dashboard_api(request):
    return JsonResponse(build_dashboard_payload())
