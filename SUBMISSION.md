# Spotter: Trip Planner & ELD Log Generator

- **Live app:** https://spotter-platform.netlify.app/
- **API:** https://spotter-1-byf9.onrender.com/ (Render free tier, so the first request after idle can take about 30 seconds)
- **Code:** https://github.com/Bassil-Qadi/Spotter
- **Loom walkthrough:** `<paste link>`

## What it does

Enter a current location, pickup, dropoff and the hours already used in the 70-hour/8-day cycle. The app returns:

- a map with the driving route and markers for every stop (pickup, fuel, 30-minute breaks, 10-hour rests, 34-hour restarts, dropoff);
- a day-by-day list of stops and rests;
- one filled-in Driver's Daily Log per day, drawn as SVG on the 24-hour grid. Each has duty-status lines, per-row and daily totals, mileage, remarks with times and places, and the 70-hour recap.

The sheets can be printed or saved as PDF. Optional carrier, address, truck and shipping details print on every sheet.

## How it works

React and TypeScript send one request to a Django REST API. The API geocodes the places (Nominatim), routes them (OSRM), runs an hours-of-service scheduler, and splits the result at midnight into daily logs. The map is Leaflet on OpenStreetMap. All the map, routing and geocoding services are free and need no API keys.

## HOS rules enforced (from the FMCSA Driver's Guide)

- 11-hour driving limit and the 14-hour window.
- A 30-minute break after 8 cumulative driving hours. Any non-driving stop of 30 minutes or more counts, including fuel and pickup.
- 10-hour rest between shifts.
- 70 hours in 8 days, counting the hours already used. A 34-hour restart is taken when the cycle runs out.
- Fuel at least every 1,000 miles.
- 1 hour on duty at pickup and 1 hour at dropoff.

## Accuracy checks

- The scheduler is pure Python, with 12 automated tests that assert the rules as invariants over generated schedules.
- A separate black-box checker, `backend/check_live.py`, ran against the hosted API on six trips and all passed: a short trip, 69 and 70 hours used, coast-to-coast, a midnight crossing, and pickup equal to the current location.

## Assumptions and limits

- The driver is a property-carrying driver on the 70-hour/8-day rule, with no adverse driving conditions.
- The trip starts at a user-chosen time after a full 10-hour rest.
- Truck speed is capped at 60 mph, since OSRM uses car speeds.
- Hours entered as "cycle used" never roll off during the trip, which is the conservative choice.
- On-duty (not driving) time at the end, such as the final dropoff, can take the 8-day total slightly past 70 hours, which the rules allow.
- The sleeper-berth split provision is not modelled.

## Stack and hosting

Django and DRF on Render (gunicorn, WhiteNoise, CORS). React, Vite and TypeScript on Netlify. Public OSM tiles, OSRM and Nominatim, throttled and cached to respect usage limits.
