from django.test import SimpleTestCase

from . import hos


def run(l1, l2, cycle=0, start=8.0):
    plan = hos.plan_trip(l1, l2, cycle, start)
    return plan, hos.build_daily_logs(plan, cycle)


class HosRules(SimpleTestCase):
    def check_invariants(self, plan):
        drive = since_break = 0
        shift_start = None
        for s in plan.segments:
            if s.kind in ("rest", "restart"):
                drive = since_break = 0
                shift_start = None
                continue
            if s.status in (hos.D, hos.ON) and shift_start is None:
                shift_start = s.start
            if s.status == hos.D:
                drive += s.minutes
                since_break += s.minutes
                self.assertLessEqual(drive, hos.DRIVE_LIMIT)
                self.assertLessEqual(since_break, hos.BREAK_AFTER)
                self.assertLessEqual(s.end - shift_start, hos.WINDOW)
            elif s.minutes >= hos.BREAK_LEN:
                since_break = 0

    def test_contiguous_and_covers_days(self):
        plan, logs = run((300, 300), (1500, 1500), 20)
        for a, b in zip(plan.segments, plan.segments[1:]):
            self.assertEqual(a.end, b.start)
        for log in logs:
            self.assertEqual(sum(log["totals_hours"].values()), 24)
            self.assertEqual(log["entries"][0]["start"], 0)
            self.assertEqual(log["entries"][-1]["end"], 1440)

    def test_short_trip_single_day(self):
        plan, logs = run((60, 60), (120, 120))
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["totals_hours"]["ON"], 2)
        self.assertEqual(logs[0]["totals_hours"]["D"], 3)
        self.check_invariants(plan)

    def test_30_min_break_after_8_hours(self):
        plan, _ = run((0.001, 1), (500, 600))
        kinds = [s.kind for s in plan.segments]
        self.assertIn("break", kinds)
        self.check_invariants(plan)

    def test_11_hour_limit_forces_10_hour_rest(self):
        plan, _ = run((1, 1), (45 * 20, 20 * 60))
        self.assertIn("rest", [s.kind for s in plan.segments])
        self.check_invariants(plan)

    def test_fuel_every_1000_miles(self):
        plan, _ = run((1, 1), (2500, 2500))
        since = 0
        for s in plan.segments:
            if s.kind == "fuel":
                since = 0
            since += s.mile_end - s.mile_start
            self.assertLessEqual(since, 1000.5)
        self.assertEqual(sum(s.kind == "fuel" for s in plan.segments), 2)

    def test_cycle_exhaustion_triggers_34h_restart(self):
        plan, logs = run((1, 1), (1500, 1500), cycle=60)
        self.assertIn("restart", [s.kind for s in plan.segments])
        self.check_invariants(plan)

    def test_cycle_already_full_restarts_first(self):
        plan, _ = run((100, 100), (100, 100), cycle=70)
        self.assertEqual(plan.segments[1].kind, "restart")

    def test_pickup_and_dropoff_one_hour(self):
        plan, _ = run((100, 100), (100, 100))
        on = {s.kind: s.minutes for s in plan.segments if s.status == hos.ON}
        self.assertEqual(on["pickup"], 60)
        self.assertEqual(on["dropoff"], 60)

    def test_total_miles(self):
        plan, _ = run((123, 120), (877, 800))
        self.assertAlmostEqual(plan.total_miles, 1000, delta=0.5)


from unittest import mock

from rest_framework.test import APIClient

from . import services

PLACES = {
    "chicago": {"query": "chicago", "name": "Chicago, Cook County, Illinois, United States", "lat": 41.88, "lng": -87.62},
    "st louis": {"query": "st louis", "name": "St. Louis, Missouri, United States", "lat": 38.63, "lng": -90.19},
    "denver": {"query": "denver", "name": "Denver, Colorado, United States", "lat": 39.74, "lng": -104.99},
}
GEOMETRY = [[41.88, -87.62], [38.63, -90.19], [39.74, -104.99]]


class PlanApi(SimpleTestCase):
    payload = {"current_location": "Chicago", "pickup_location": "St Louis", "dropoff_location": "Denver",
               "cycle_used_hours": 10}

    def post(self, data):
        return APIClient().post("/api/plan/", data, format="json")

    def test_validation_errors(self):
        r = self.post({"current_location": "", "cycle_used_hours": 99})
        self.assertEqual(r.status_code, 400)
        for f in ("current_location", "pickup_location", "dropoff_location", "cycle_used_hours"):
            self.assertIn(f, r.json()["errors"])

    @mock.patch("trips.services.route")
    @mock.patch("trips.services.geocode")
    def test_plan_success(self, geocode, route):
        geocode.side_effect = lambda q: PLACES[q.lower()]
        route.return_value = ([(300.0, 330), (850.0, 900)], GEOMETRY)
        r = self.post(self.payload)
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertAlmostEqual(d["summary"]["total_miles"], 1150, delta=1)
        self.assertEqual(d["stops"][0]["type"], "start")
        self.assertEqual(d["stops"][-1]["type"], "dropoff")
        self.assertEqual(len(d["logs"]), d["summary"]["total_days"])

    @mock.patch("trips.services.geocode", side_effect=services.ServiceError("Could not find location: 'x'"))
    def test_unknown_place(self, _):
        r = self.post(self.payload)
        self.assertEqual(r.status_code, 422)
        self.assertIn("Could not find", r.json()["errors"]["detail"])
