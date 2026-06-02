from django.urls import path
from . import views

urlpatterns = [
    path("mqtt/auth/", views.mqtt_auth, name="mqtt_auth"),
    path("mqtt/acl/", views.mqtt_acl, name="mqtt_acl"),
    path("devices/api/measurements/", views.measurements_api, name="measurements_api"),
    path("devices/api/", views.devices_api, name="devices_api"),
    path("api/dashboard/", views.dashboard_api, name="dashboard_api"),
    path("devices/add_device/", views.add_device, name="add_device"),
    path("api/auth/login/", views.login_api, name="login_api"),
    path("api/auth/logout/", views.logout_api, name="logout_api"),
]
