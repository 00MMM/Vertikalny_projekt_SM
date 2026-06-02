import json

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from .models import Device, DeviceMeasurement
from .views import build_dashboard_payload

MEASUREMENTS_LIMIT = 30


def serialize_measurement(m):
    return {"received_at": m.received_at.isoformat(), **m.data}


@database_sync_to_async
def get_measurements(device_id):
    measurements = (
        DeviceMeasurement.objects
        .select_related("device")
        .filter(device__device_id=device_id)
        .order_by("-received_at")[:MEASUREMENTS_LIMIT]
    )
    return [serialize_measurement(m) for m in measurements]


@database_sync_to_async
def get_all_devices_with_measurements():
    devices = Device.objects.filter(is_active=True)
    result = []
    for device in devices:
        measurements = (
            DeviceMeasurement.objects
            .filter(device=device)
            .order_by("-received_at")[:MEASUREMENTS_LIMIT]
        )
        result.append({
            "device_id": device.device_id,
            "measurements": [serialize_measurement(m) for m in measurements],
        })
    return result


@database_sync_to_async
def get_device_ids():
    return list(Device.objects.filter(is_active=True).values_list("device_id", flat=True))


@database_sync_to_async
def get_dashboard_payload():
    return build_dashboard_payload()


class DashboardConsumer(AsyncWebsocketConsumer):
    """
    Compatibility endpoint for the current Vite dashboard.
    Sends the dashboard payload on connect.
    """

    async def connect(self):
        await self.accept()
        await self.send(json.dumps(await get_dashboard_payload()))


class DeviceMeasurementsConsumer(AsyncWebsocketConsumer):
    """
    ws://host/ws/devices/<device_id>/measurements/
    Sends last 30 measurements on connect, then live updates on new data.
    """

    async def connect(self):
        self.device_id = self.scope["url_route"]["kwargs"]["device_id"]
        self.group_name = f"device_{self.device_id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        measurements = await get_measurements(self.device_id)
        await self.send(json.dumps({"type": "initial", "device_id": self.device_id, "measurements": measurements}))

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def new_measurement(self, event):
        await self.send(json.dumps({"type": "new_measurement", "device_id": self.device_id, "measurement": event["measurement"]}))


class DeviceListConsumer(AsyncWebsocketConsumer):
    """
    ws://host/ws/devices/
    Sends list of active device IDs on connect, then updates when devices are added/removed.
    """

    async def connect(self):
        self.group_name = "device_list"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        device_ids = await get_device_ids()
        await self.send(json.dumps({"type": "initial", "devices": device_ids}))

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def device_list_update(self, event):
        await self.send(json.dumps({"type": "device_list_update", "devices": event["devices"]}))


class AllDevicesMeasurementsConsumer(AsyncWebsocketConsumer):
    """
    ws://host/ws/devices/measurements/
    Sends all active devices with last 30 measurements each on connect, then live updates.
    """

    async def connect(self):
        self.group_name = "all_devices"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        data = await get_all_devices_with_measurements()
        await self.send(json.dumps({"type": "initial", "devices": data}))

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def new_measurement(self, event):
        await self.send(json.dumps({"type": "new_measurement", "device_id": event["device_id"], "measurement": event["measurement"]}))
