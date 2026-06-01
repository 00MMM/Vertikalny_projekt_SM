import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import models


class Device(models.Model):
    device_id = models.CharField(max_length=64, unique=True)
    token_hash = models.CharField(max_length=256)
    schema = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_token(self, raw_token: str):
        self.token_hash = make_password(raw_token)

    def check_token(self, raw_token: str) -> bool:
        return check_password(raw_token, self.token_hash)

    def __str__(self):
        return self.device_id


class DeviceMeasurement(models.Model):
    device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name="measurements"
    )
    data = models.JSONField(default=dict)
    received_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.device.device_id} @ {self.received_at}"


class AuthToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="auth_tokens")
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def generate(cls, user):
        token = secrets.token_hex(32)
        return cls.objects.create(user=user, token=token)

    def __str__(self):
        return f"{self.user.username} — {self.token[:8]}..."
