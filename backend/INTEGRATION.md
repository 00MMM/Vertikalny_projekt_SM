# VerticalProject — Integration Guide

This guide explains how to integrate the VerticalProject IoT backend into your environment.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 6 (ASGI via Daphne) |
| WebSocket | Django Channels 4 |
| Message broker | Mosquitto (MQTT) with go-auth plugin |
| Channel layer | Redis 7 |
| Database | PostgreSQL |
| Device auth | Token-based (hashed, one-time issued) |
| Admin auth | Django Token Auth (custom) |

---

## Architecture Overview

```
[IoT Device] → publishes → [Mosquitto MQTT Broker] → forwards → [Django mqtt_listener]
                                    ↑                                      ↓
                         authenticates via HTTP                    [PostgreSQL DB]
                         /mqtt/auth/ & /mqtt/acl/                          ↓
                                                              [Redis Channel Layer]
                                                                           ↓
                                                         [Django Channels / WebSocket]
                                                                    ↓           ↓
                                                              [REST API]   [Frontend]
```

---

## How It Works

### Device registration
1. Admin logs in via `POST /api/auth/login/` → receives token
2. Admin sends `POST /devices/add_device/` with token and device schema
3. Backend generates a one-time token, stores its hash in DB, returns raw token
4. Raw token is flashed into the device firmware as `MQTT_AUTH_TOKEN`

### Device data flow
1. Device connects to Mosquitto with `device_id` + `MQTT_AUTH_TOKEN`
2. Mosquitto calls `POST /mqtt/auth/` — Django verifies token hash
3. Device publishes JSON payload to topic `devices/<device_id>/...`
4. `mqtt_listener` receives the message, validates fields against device schema
5. Valid measurement is saved to PostgreSQL
6. `mqtt_listener` pushes the measurement to Redis channel layer
7. Django Channels broadcasts it to all connected WebSocket clients

### Frontend data consumption
- Connect to a WebSocket endpoint → receive last 30 measurements immediately
- New measurements are pushed in real time as devices send data
- REST endpoints available for one-off queries without WebSocket

---

## Prerequisites

- Python 3.12+
- PostgreSQL
- Docker & Docker Compose
- pip packages: see `requirements.txt` (`channels`, `channels-redis`, `psycopg2-binary` included)

---

## Files to Copy

To run the MQTT broker via Docker, copy these into your project:

```
docker-compose.yml
mosquitto/
└── config/
    └── mosquitto.conf
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
DB_NAME=verticalproject
DB_USER=postgres
DB_PASSWORD=
DB_HOST=localhost
DB_PORT=5432

REDIS_HOST=localhost
REDIS_PORT=6379

MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_TOPIC=devices/#
MQTT_USERNAME=django-listener
MQTT_TOKEN=        # token for the django-listener device (see below)
```

---

## First-Time Setup

### 1. Apply database migrations

```bash
python manage.py migrate
```

### 2. Create a Django superuser (required to use the device registration API)

```bash
python manage.py createsuperuser
```

### 3. Register the django-listener as a device

The MQTT listener connects to the broker using its own credentials. Register it first:

```bash
python manage.py create_device django-listener
```

Copy the printed token into `.env` as `MQTT_TOKEN`.

---

## Starting the Server

Run all in separate terminals:

```bash
# 1. Mosquitto + Redis (Docker)
docker compose up

# 2. Django / Daphne (ASGI — required for WebSocket support)
daphne VerticalProject.asgi:application

# 3. MQTT listener (reads from broker, writes to DB, pushes to WebSocket)
python manage.py mqtt_listener
```

> For development you can use `python manage.py runserver` instead of Daphne, but WebSocket support requires Daphne in production.

---

## Registering a New Device

### Via API (requires admin session)

You must be logged into Django admin first (session cookie is used for auth).

The `schema` defines what fields the device will send. Field names are arbitrary — use any names that match your device data. Each field must have one of the allowed types.

**Allowed field types:** `int`, `float`, `string`, `bool`

```
schema: {
    "<any_field_name>": "<type>",
    ...
}
```

Example:
```json
{"temperature": "float", "co2": "int", "status": "string"}
```

```bash
POST /devices/add_device/
Content-Type: application/json
Authorization: Token a3f1c2...

{
    "device_id": "sensor_01",
    "schema": {
        "temperature": "float",
        "humidity": "float",
        "pressure": "float"
    }
}
```

**Response (201):**
```json
{
    "device_id": "sensor_01",
    "schema": {"temperature": "float", "humidity": "float", "pressure": "float"},
    "token": "16228dc1...",
    "warning": "Save this token now — it won't be shown again"
}
```

> **Important:** The raw token is shown only once. A hashed version is stored in the database — the original is never saved. Write it down immediately. This token is used as `MQTT_AUTH_TOKEN` in the device firmware (e.g. Arduino).

---

## Device Token Flow

1. Register the device → receive `token`
2. Store `device_id` and `token` on the physical device (e.g. in firmware constants)
3. Device connects to Mosquitto using `device_id` as username and `token` as password
4. Mosquitto calls `/mqtt/auth/` — Django verifies the token hash
5. If valid → device is allowed to publish

**Arduino example:**
```cpp
const char* MQTT_USERNAME   = "sensor_01";
const char* MQTT_AUTH_TOKEN = "16228dc1f47fbef1...";

mqtt.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_AUTH_TOKEN);
```

---

## Publishing Data from a Device

Devices publish JSON to topic `devices/<device_id>/...`

The payload must include `device_id` and all fields declared in the device schema:

```json
{
    "device_id": "sensor_01",
    "temperature": 23.5,
    "humidity": 61.2,
    "pressure": 1012.4
}
```

The listener validates the payload against the device schema. Messages with missing or wrong-typed fields are discarded.

---

## API Endpoints

Base URL: `http://<host>:8000`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login/` | — | Get admin token |
| `POST` | `/api/auth/logout/` | Token | Invalidate token |
| `POST` | `/devices/add_device/` | Token | Register a new device |
| `GET` | `/devices/api/measurements/` | None | Get last N measurements |
| `GET` | `/devices/api/` | None | Get all devices with last N measurements each |
| `POST` | `/mqtt/auth/` | — | Mosquitto auth hook (internal) |
| `POST` | `/mqtt/acl/` | — | Mosquitto ACL hook (internal) |

---

### `POST /api/auth/login/`

```json
{"username": "admin", "password": "your_password"}
```

**Response:**
```json
{"token": "a3f1c2..."}
```

---

### `POST /api/auth/logout/`

```
Authorization: Token a3f1c2...
```

**Response:**
```json
{"detail": "Logged out"}
```

---

### `GET /devices/api/measurements/`

Returns the last N measurements across all devices, or filtered by a specific device.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `device_id` | — | Filter by device |
| `limit` | `10` | Number of records to return |

**Example:**
```
GET /devices/api/measurements/?device_id=sensor_01&limit=5
```

**Response:**
```json
{
    "count": 2,
    "measurements": [
        {
            "device_id": "sensor_01",
            "received_at": "2026-05-12T14:00:00Z",
            "temperature": 23.5,
            "humidity": 61.2,
            "pressure": 1012.4
        }
    ]
}
```

---

### `GET /devices/api/`

Returns all active devices, each with their last N measurements.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `10` | Number of measurements per device |

**Example:**
```
GET /devices/api/?limit=3
```

**Response:**
```json
{
    "count": 2,
    "devices": [
        {
            "device_id": "sensor_01",
            "measurements": [
                {
                    "received_at": "2026-05-12T14:00:00Z",
                    "temperature": 23.5,
                    "humidity": 61.2,
                    "pressure": 1012.4
                }
            ]
        }
    ]
}
```

---

## Admin Panel

Django admin is available at `http://localhost:8000/admin/`

Use it to:
- View and manage registered devices
- Activate / deactivate devices
- Browse stored measurements

---

## WebSocket Endpoints (for frontend)

> **These are the primary endpoints for frontend integration.**
> Connect via WebSocket. On connect you immediately receive the current state, then live updates are pushed automatically as new data arrives from devices.

Base URL: `ws://<host>:8000`

---

### `ws://host/ws/devices/<device_id>/measurements/`

Subscribe to a specific device. Receive last 30 measurements on connect, then each new measurement in real time.

**On connect:**
```json
{
    "type": "initial",
    "device_id": "sensor_01",
    "measurements": [
        {
            "received_at": "2026-05-14T10:00:00Z",
            "temperature": 23.5,
            "humidity": 61.2,
            "pressure": 1012.4
        }
    ]
}
```

**On new data:**
```json
{
    "type": "new_measurement",
    "device_id": "sensor_01",
    "measurement": {
        "received_at": "2026-05-14T10:00:05Z",
        "temperature": 24.1,
        "humidity": 60.8,
        "pressure": 1012.1
    }
}
```

---

### `ws://host/ws/devices/measurements/`

Subscribe to all devices at once. Receive all devices with last 30 measurements each on connect, then live updates from any device.

**On connect:**
```json
{
    "type": "initial",
    "devices": [
        {
            "device_id": "sensor_01",
            "measurements": ["..."]
        },
        {
            "device_id": "sensor_02",
            "measurements": ["..."]
        }
    ]
}
```

**On new data:**
```json
{
    "type": "new_measurement",
    "device_id": "sensor_01",
    "measurement": {
        "received_at": "2026-05-14T10:00:05Z",
        "temperature": 24.1,
        "humidity": 60.8,
        "pressure": 1012.1
    }
}
```

---

### `ws://host/ws/devices/`

Receive the list of all active device IDs on connect.

**On connect:**
```json
{
    "type": "initial",
    "devices": ["sensor_01", "sensor_02"]
}
```

---

### JavaScript connection example

```js
const ws = new WebSocket("ws://localhost:8000/ws/devices/sensor_01/measurements/");

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "initial") {
        // render initial data
    } else if (msg.type === "new_measurement") {
        // append new point to chart
    }
};
```

> **Note:** Field names in measurement payloads (`temperature`, `humidity`, etc.) are dynamic — they depend on the schema defined when the device was registered. Always handle them generically based on the keys present in the object.

---

## Frontend TODO

The following UI needs to be implemented on the frontend side:

- [ ] **Login form** — sends `POST /api/auth/login/` with `username` + `password`, saves the returned `token` (e.g. in `localStorage`)
- [ ] **Device registration form** — sends `POST /devices/add_device/` with `Authorization: Token <token>` header and `device_id` + `schema` body. Display the returned token to the user immediately — it will not be shown again
- [ ] **Logout button** — sends `POST /api/auth/logout/` with `Authorization: Token <token>`, then clears the saved token
