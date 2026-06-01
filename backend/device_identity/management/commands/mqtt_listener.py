import json
import logging
import os

import paho.mqtt.client as mqtt
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.management.base import BaseCommand
from dotenv import load_dotenv

from device_identity.models import Device, DeviceMeasurement

channel_layer = get_channel_layer()

load_dotenv()

logger = logging.getLogger(__name__)

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "devices/#")
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "django-listener")
MQTT_TOKEN = os.getenv("MQTT_TOKEN")

TYPE_VALIDATORS = {
    "int":    lambda v: isinstance(v, int) and not isinstance(v, bool),
    "float":  lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "string": lambda v: isinstance(v, str),
    "bool":   lambda v: isinstance(v, bool),
}


def validate_against_schema(data: dict, schema: dict) -> bool:
    for field, expected_type in schema.items():
        if field not in data:
            logger.warning(f"Missing field: {field}")
            return False
        validator = TYPE_VALIDATORS.get(expected_type)
        if validator and not validator(data[field]):
            logger.warning(f"Field '{field}' expected {expected_type}, got {type(data[field]).__name__}: {data[field]}")
            return False
    return True


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("MQTT connected successfully")
        client.subscribe(MQTT_TOPIC)
    else:
        print(f"MQTT connection failed, rc={rc}")


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.warning(f"Invalid JSON from topic {msg.topic}")
        return

    device_id = data.get("device_id")
    if not device_id:
        logger.warning("Payload missing device_id")
        return

    try:
        device = Device.objects.get(device_id=device_id, is_active=True)
    except Device.DoesNotExist:
        logger.warning(f"Unknown device: {device_id}")
        return

    if not validate_against_schema(data, device.schema):
        return

    measurement_data = {k: data[k] for k in device.schema if k in data}
    measurement = DeviceMeasurement.objects.create(device=device, data=measurement_data)
    print(f"Saved measurement from {device.device_id}: {measurement_data}")

    payload = {"received_at": measurement.received_at.isoformat(), **measurement_data}
    async_to_sync(channel_layer.group_send)(
        f"device_{device_id}",
        {"type": "new_measurement", "measurement": payload},
    )
    async_to_sync(channel_layer.group_send)(
        "all_devices",
        {"type": "new_measurement", "device_id": device_id, "measurement": payload},
    )


class Command(BaseCommand):
    help = "Listen to MQTT and save device measurements to DB"

    def handle(self, *args, **kwargs):
        client = mqtt.Client()
        client.username_pw_set(MQTT_USERNAME, MQTT_TOKEN)
        client.on_connect = on_connect
        client.on_message = on_message
        client.connect(MQTT_HOST, MQTT_PORT)
        self.stdout.write("MQTT listener started...")
        client.loop_forever()
