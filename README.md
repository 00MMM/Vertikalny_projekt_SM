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
