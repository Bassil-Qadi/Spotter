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
