# Spotter — Trip Planner & ELD Log Generator

Enter a current location, pickup, dropoff and the hours already used in the 70-hour/8-day cycle. Spotter maps the
route, schedules fuel stops, breaks and rests under FMCSA hours-of-service rules, and fills out a Driver's Daily Log
for every day of the trip.

**Stack:** Django + Django REST Framework · React + Vite + TypeScript · Leaflet / OpenStreetMap · OSRM routing ·
Nominatim geocoding (all free, no API keys).

## How it works

```
React form ──POST /api/plan/──▶ Django
                                 ├─ Nominatim: geocode 3 locations
                                 ├─ OSRM: route + geometry (current → pickup → dropoff)
                                 ├─ hos.plan_trip: simulate the trip minute by minute under HOS rules
                                 └─ hos.build_daily_logs: split at midnight into one log per day
React ◀── route, stops, daily logs ── map, timeline, SVG log sheets
```

### Hours-of-service rules modelled (`backend/trips/hos.py`)

| Rule | Behaviour |
| --- | --- |
| 11-hour driving limit | Driving stops at 11 h; 10 h sleeper-berth rest follows |
| 14-hour window | Starts at first on-duty time, never paused by breaks; no driving after it ends |
| 30-minute break | Inserted once 8 cumulative driving hours pass without a ≥ 30 min non-driving period (fuel/pickup stops count) |
| 70 h / 8 days | `Current cycle used` counts against the limit; at 70 h a 34-hour restart is taken |
| Fuel | At least once every 1,000 miles, 30 min on duty |
| Pickup / dropoff | 1 hour on duty each |

Assumptions: property-carrying driver, no adverse driving conditions, trip starts at the chosen time after a full
10-hour rest, hours entered as "cycle used" never roll off during the trip (conservative), average truck speed
capped at 60 mph. Not modelled: sleeper-berth split provision. On-duty (not driving) time such as the final
dropoff may take the 8-day total slightly past 70 h, which the rules permit — only driving is prohibited.

The scheduler is pure Python with no Django dependency and is covered by tests that assert the rules as invariants.

## Run locally

```bash
# backend  (http://localhost:8000)
cd backend
python -m venv .venv && .venv/Scripts/activate     # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python manage.py test trips
python manage.py runserver

# frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

The frontend talks to `http://localhost:8000` unless `VITE_API_URL` is set (see `frontend/.env.example`).

## Deploy

**Backend → Render** (free web service). Push the repo, then *New → Blueprint* and select it; `render.yaml` configures
everything. Set `CORS_ALLOWED_ORIGINS` to the Vercel URL and `NOMINATIM_USER_AGENT` to something identifying you
(see `backend/.env.example`).

**Frontend → Vercel.** Import the repo, set *Root Directory* to `frontend`, add the env var
`VITE_API_URL=https://<your-render-service>.onrender.com`, deploy. Any `*.vercel.app` or `*.netlify.app` origin is already allowed by CORS.

The free Render tier sleeps when idle, so the first request after a pause can take ~30 s.

## API

`POST /api/plan/`

```json
{ "current_location": "Chicago, IL", "pickup_location": "St. Louis, MO",
  "dropoff_location": "Los Angeles, CA", "cycle_used_hours": 30, "start_hour": 8 }
```

Returns `route` (geometry), `stops`, `logs` (per-day grid entries, totals, remarks, recap) and `summary`.
