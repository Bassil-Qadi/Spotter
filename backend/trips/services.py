"""Geocoding (Nominatim) and routing (OSRM) using free, keyless public APIs."""
import math
import threading
import time
from functools import lru_cache

import requests
from django.conf import settings

TIMEOUT = 20
MAX_TRUCK_MPH = 60.0  # OSRM uses car speeds; cap so truck durations are realistic
M_PER_MILE = 1609.344


class ServiceError(Exception):
    pass


_throttle_lock = threading.Lock()
_last_call = 0.0


def _throttle(min_gap=1.05):
    """Nominatim's usage policy allows at most ~1 request per second."""
    global _last_call
    with _throttle_lock:
        wait = _last_call + min_gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


@lru_cache(maxsize=256)
def _geocode_cached(query):
    _throttle()
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "us,ca,mx"},
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        raise ServiceError(f"Geocoding service unavailable: {e}")
    if not data:
        raise ServiceError(f"Could not find location: '{query}'")
    hit = data[0]
    return {"query": query, "name": hit["display_name"], "lat": float(hit["lat"]), "lng": float(hit["lon"])}


def geocode(query):
    return dict(_geocode_cached(query.strip().lower()))


def route(points):
    """points: [{'lat','lng'}, ...] -> legs [(miles, minutes)] and [[lat,lng],...] geometry."""
    coords = ";".join(f"{p['lng']},{p['lat']}" for p in points)
    try:
        r = requests.get(
            f"https://router.project-osrm.org/route/v1/driving/{coords}",
            params={"overview": "full", "geometries": "geojson", "steps": "false"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        raise ServiceError(f"Routing service unavailable: {e}")
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ServiceError("No drivable route found between those locations.")
    rt = data["routes"][0]
    legs = []
    for leg in rt["legs"]:
        miles = leg["distance"] / M_PER_MILE
        minutes = max(leg["duration"] / 60.0, miles / MAX_TRUCK_MPH * 60.0)
        legs.append((miles, max(1, int(round(minutes)))))
    geometry = [[lat, lng] for lng, lat in rt["geometry"]["coordinates"]]
    return legs, geometry


def _hav(a, b):
    r = 3958.8
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


class Polyline:
    """Maps a distance along the route (miles) to a lat/lng point."""

    def __init__(self, geometry, total_miles):
        self.pts = geometry
        cum = [0.0]
        for a, b in zip(geometry, geometry[1:]):
            cum.append(cum[-1] + _hav(a, b))
        self.scale = (total_miles / cum[-1]) if cum[-1] else 1.0
        self.cum = [c * self.scale for c in cum]

    def at(self, mile):
        mile = max(0.0, min(mile, self.cum[-1]))
        lo, hi = 0, len(self.cum) - 1
        while lo < hi - 1:
            mid = (lo + hi) // 2
            if self.cum[mid] <= mile:
                lo = mid
            else:
                hi = mid
        span = self.cum[hi] - self.cum[lo]
        f = (mile - self.cum[lo]) / span if span else 0
        a, b = self.pts[lo], self.pts[hi]
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
