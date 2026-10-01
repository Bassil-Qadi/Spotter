from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import hos, services

STOP_KINDS = {"pickup", "dropoff", "fuel", "break", "rest", "restart"}


def _validate(data):
    errors = {}
    for f in ("current_location", "pickup_location", "dropoff_location"):
        if not str(data.get(f, "")).strip():
            errors[f] = "This field is required."
    try:
        cycle = float(data.get("cycle_used_hours"))
        if not 0 <= cycle <= 70:
            errors["cycle_used_hours"] = "Must be between 0 and 70."
    except (TypeError, ValueError):
        cycle = None
        errors["cycle_used_hours"] = "Enter a number between 0 and 70."
    try:
        start = float(data.get("start_hour", 8))
        if not 0 <= start < 24:
            raise ValueError
    except (TypeError, ValueError):
        start = 8.0
        errors["start_hour"] = "Must be between 0 and 24."
    return errors, cycle, start


@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


@api_view(["POST"])
def plan(request):
    errors, cycle, start_hour = _validate(request.data)
    if errors:
        return Response({"errors": errors}, status=400)
    try:
        places = [services.geocode(request.data[f].strip())
                  for f in ("current_location", "pickup_location", "dropoff_location")]
        legs, geometry = services.route(places)
    except services.ServiceError as e:
        return Response({"errors": {"detail": str(e)}}, status=422)

    result = hos.plan_trip(legs[0], legs[1], cycle, start_hour)
    logs = hos.build_daily_logs(result, cycle)
    line = services.Polyline(geometry, result.total_miles)

    start_min = int(round(start_hour * 60))
    stops = [{"type": "start", "label": "Current location", "name": places[0]["name"],
              "lat": places[0]["lat"], "lng": places[0]["lng"],
              "start": start_min, "end": start_min, "mile": 0}]
    for s in result.segments:
        if s.kind not in STOP_KINDS:
            continue
        if s.kind == "pickup":
            lat, lng, name = places[1]["lat"], places[1]["lng"], places[1]["name"]
        elif s.kind == "dropoff":
            lat, lng, name = places[2]["lat"], places[2]["lng"], places[2]["name"]
        else:
            (lat, lng), name = line.at(s.mile_start), ""
        stops.append({"type": s.kind, "label": s.label, "name": name, "lat": lat, "lng": lng,
                      "start": s.start, "end": s.end, "mile": round(s.mile_start, 1)})

    return Response({
        "inputs": {"cycle_used_hours": cycle, "start_hour": start_hour},
        "places": places,
        "route": {"geometry": geometry, "total_miles": result.total_miles},
        "segments": [{"status": s.status, "start": s.start, "end": s.end, "label": s.label,
                      "kind": s.kind} for s in result.segments],
        "stops": stops,
        "logs": logs,
        "summary": {
            "total_miles": result.total_miles,
            "total_days": len(logs),
            "driving_hours": round(sum(l["totals_hours"]["D"] for l in logs), 2),
            "end_minute": result.segments[-1].end,
        },
    })
