from django.contrib import admin
from .models import Device, DeviceMeasurement

admin.site.register(Device)
admin.site.register(DeviceMeasurement)
