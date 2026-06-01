import json
import secrets

from django.core.management.base import BaseCommand, CommandError

from device_identity.models import Device

ALLOWED_TYPES = {"int", "float", "string", "bool"}


class Command(BaseCommand):
    help = "Create a device and print its token (shown only once)"

    def add_arguments(self, parser):
        parser.add_argument("device_id", type=str)
        parser.add_argument(
            "--schema",
            type=str,
            default="{}",
            help='JSON schema of device fields, e.g. \'{"temperature": "float", "humidity": "int"}\'',
        )

    def handle(self, *args, **kwargs):
        device_id = kwargs["device_id"]

        try:
            schema = json.loads(kwargs["schema"])
        except json.JSONDecodeError:
            raise CommandError("--schema must be valid JSON")

        if not isinstance(schema, dict):
            raise CommandError("--schema must be a JSON object")

        invalid_types = {k: v for k, v in schema.items() if v not in ALLOWED_TYPES}
        if invalid_types:
            raise CommandError(
                f"Invalid field types: {invalid_types}. Allowed: {ALLOWED_TYPES}"
            )

        if Device.objects.filter(device_id=device_id).exists():
            self.stderr.write(f"Device '{device_id}' already exists.")
            return

        raw_token = secrets.token_hex(32)
        device = Device(device_id=device_id, schema=schema)
        device.set_token(raw_token)
        device.save()

        self.stdout.write(f"Device created: {device_id}")
        if schema:
            self.stdout.write(f"Schema: {json.dumps(schema)}")
        self.stdout.write(f"Token (save it now, won't be shown again): {raw_token}")
