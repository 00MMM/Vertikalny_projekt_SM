# Vertikalny projekt SM

Projekt je rozdeleny na frontend a backend.

## Struktura

```text
SM_projekt_1/
  frontend/   React + Vite aplikacia
  backend/    Django backend
```

## Frontend

Frontend vyzaduje Node.js 20.19+ alebo 22.12+.

```bash
cd frontend
npm install
npm run dev
```

Vyvojovy server Vite standardne bezi na:

```text
http://localhost:5173
```

## Backend

Backend vyzaduje Python 3.12+, PostgreSQL, Docker a Docker Compose.

### Priprava prostredia

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Windows PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```


### Databaza

Pred spustenim Django prikazov musi bezat PostgreSQL. Na macOS cez Homebrew napriklad:

```bash
pg_ctl start -D /opt/homebrew/var/postgresql@17 -l /opt/homebrew/var/log/postgresql@17.log
```

Windows PowerShell priklad, ak je PostgreSQL nainstalovany ako Windows service:

```powershell
Get-Service postgresql*
Start-Service postgresql-x64-17
```

Nazov service sa moze lisit podla verzie PostgreSQL, napr. `postgresql-x64-16`.

Databaza musi zodpovedat hodnotam v `.env`, standardne:

```text
DB_NAME=verticalproject
DB_USER=postgres
DB_HOST=localhost
DB_PORT=5432
```

### Prve spustenie backendu

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py create_device django-listener
```

Token vypisany prikazom `create_device django-listener` skopiruj do `.env` ako `MQTT_TOKEN`.

### Spustenie backend sluzieb

Najprv zapni Docker daemon, napriklad Docker Desktop. Potom spusti tieto prikazy v samostatnych terminaloch:

```bash
# 1. Mosquitto + Redis (Docker)
docker compose up
```

```bash
# 2. Django / Daphne (ASGI - required for WebSocket support)
daphne -b 127.0.0.1 -p 8000 VerticalProject.asgi:application
```

```bash
# 3. MQTT listener (reads from broker, writes to DB, pushes to WebSocket)
python manage.py mqtt_listener
```

Windows PowerShell pouziva rovnake prikazy po aktivacii `.venv`:

```powershell
# 1. Mosquitto + Redis (Docker)
docker compose up
```

```powershell
# 2. Django / Daphne (ASGI - required for WebSocket support)
daphne -b 127.0.0.1 -p 8000 VerticalProject.asgi:application
```

```powershell
# 3. MQTT listener (reads from broker, writes to DB, pushes to WebSocket)
python manage.py mqtt_listener
```

Backend potom bezi na:

```text
http://127.0.0.1:8000
```

Pre WebSocket endpointy pouzivaj Daphne, nie `python manage.py runserver`.

## Poznamky

- `frontend/node_modules/` a `frontend/dist/` sa necommitnuju.
- `backend/.env`, `backend/venv/` a `backend/db.sqlite3` sa necommitnuju.
- Frontend treba napojit podla backend integracnej dokumentacie:
  https://github.com/00MMM/Vertikalny_projekt_SM/blob/main/backend/INTEGRATION.md

### TODO pre frontend

Aktualny frontend je napojeny na docasne endpointy `/api/dashboard/` a `/ws/data/`.
Tieto endpointy nie su cielova integracia. Frontend ich ma nahradit endpointmi z tabulky nizsie.

| Stranka / cast UI | Co ma robit | Endpointy |
|---|---|---|
| Login stranka | Formular pre admin prihlasenie. Posle `username` a `password`, ulozi vrateny token napriklad do `localStorage`. | `POST /api/auth/login/` |
| Logout akcia | Odhlasi admina, posle ulozeny token v hlavicke `Authorization: Token <token>` a potom vymaze token z aplikacie. | `POST /api/auth/logout/` |
| Registracia zariadenia | Formular pre pridanie noveho zariadenia. Endpoint vyzaduje admin token z loginu v hlavicke `Authorization: Token <token>`; frontend ho ma nacitat napriklad z `localStorage`. Posiela `device_id` a `schema`; po uspesnom vytvoreni musi zobrazit vrateny device token, lebo sa ukaze iba raz. | `POST /devices/add_device/` |
| Prehlad zariadeni | Zobrazi aktivne zariadenia a posledne merania pre kazde zariadenie. Musi pocitat s tym, ze polia merani su dynamicke podla `schema` zariadenia. | `GET /devices/api/?limit=<number>` |
| Prehlad merani | Zobrazi posledne merania napriec zariadeniami, pripadne filtruje podla konkretneho zariadenia. | `GET /devices/api/measurements/?device_id=<id>&limit=<number>` |
| Realtime pre vsetky zariadenia | WebSocket dashboard pre live merania zo vsetkych zariadeni. Na connect pride aktualny stav, potom nove merania. | `ws://localhost:8000/ws/devices/measurements/` |
| Realtime pre jedno zariadenie | Detail zariadenia s live meraniami iba pre vybrane `device_id`. | `ws://localhost:8000/ws/devices/<device_id>/measurements/` |
| Zoznam zariadeni cez WebSocket | Live zoznam aktivnych zariadeni. | `ws://localhost:8000/ws/devices/` |
| Django admin odkaz | Volitelny odkaz pre adminov na spravu dat v Django administracii. | `http://localhost:8000/admin/` |

Frontend by nemal byt napojeny na docasne a nedokumentovane endpointy typu `/api/dashboard/` alebo `/ws/data/`, pokial sa explicitne nedohodne opak. Aktualne zmluvne endpointy su tie z `backend/INTEGRATION.md`.
