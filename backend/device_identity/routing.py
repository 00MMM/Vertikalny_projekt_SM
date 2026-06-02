from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/data/$", consumers.DashboardConsumer.as_asgi()),
    re_path(r"^ws/devices/(?P<device_id>[^/]+)/measurements/$", consumers.DeviceMeasurementsConsumer.as_asgi()),
    re_path(r"^ws/devices/measurements/$", consumers.AllDevicesMeasurementsConsumer.as_asgi()),
    re_path(r"^ws/devices/$", consumers.DeviceListConsumer.as_asgi()),
]
