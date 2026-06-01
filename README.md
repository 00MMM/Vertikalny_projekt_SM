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

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Django server standardne bezi na:

```text
http://127.0.0.1:8000
```

## Poznamky

- `frontend/node_modules/` a `frontend/dist/` sa necommitnuju.
- `backend/.env`, `backend/venv/` a `backend/db.sqlite3` sa necommitnuju.
- Frontend treba este napojit na aktualne backend endpointy (`/devices/api/`, `/devices/api/measurements/`, `/ws/devices/measurements/`).
