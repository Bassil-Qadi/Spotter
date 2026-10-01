"""Hours-of-Service scheduler for a property-carrying driver (70h/8-day).

Pure Python, no Django imports. Works in whole minutes since 00:00 of day 1.

Rules enforced (49 CFR 395.3, FMCSA Interstate Truck Driver's Guide):
  * 11-hour driving limit after 10 consecutive hours off duty
  * 14-hour driving window (starts at first on-duty time, never paused)
  * 30-minute break once 8 cumulative driving hours pass without a >=30-min
    non-driving interruption
  * 70 hours on duty in 8 days, cleared by a 34-hour restart
  * Fuel at least every 1,000 miles; 1 hour on duty at pickup and at dropoff
Not modelled: sleeper-berth split, adverse-driving exception, 8-day roll-off of
the hours reported in `cycle_used` (treated as non-expiring, the conservative choice).
"""
from dataclasses import dataclass, field, asdict
from math import floor

OFF, SB, D, ON = "OFF", "SB", "D", "ON"

DRIVE_LIMIT = 11 * 60
WINDOW = 14 * 60
BREAK_AFTER = 8 * 60
BREAK_LEN = 30
REST_LEN = 10 * 60
RESTART_LEN = 34 * 60
CYCLE_LIMIT = 70 * 60
FUEL_EVERY_MILES = 1000.0
FUEL_STOP_LEN = 30
PICKUP_LEN = 60
DROPOFF_LEN = 60
DAY = 24 * 60


@dataclass
class Segment:
    status: str
    start: int            # minutes since day-1 00:00
    end: int
    label: str = ""       # human description, e.g. "Pickup", "Fuel stop"
    kind: str = ""        # drive|pickup|dropoff|fuel|break|rest|restart|idle
    mile_start: float = 0.0
    mile_end: float = 0.0

    @property
    def minutes(self):
        return self.end - self.start


@dataclass
class Plan:
    segments: list = field(default_factory=list)
    total_miles: float = 0.0

    def to_dict(self):
        return {"segments": [asdict(s) for s in self.segments], "total_miles": self.total_miles}


class _Sim:
    def __init__(self, cycle_used_hours, start_minute):
        self.t = start_minute
        self.segs = []
        self.miles = 0.0
        self.cycle = int(round(cycle_used_hours * 60))
        self.shift_start = None
        self.drive_shift = 0
        self.since_break = 0
        self.since_fuel = 0.0
        if start_minute > 0:
            self._add(OFF, start_minute, "Off duty", "idle", at=0)

    # -- primitives ---------------------------------------------------------
    def _add(self, status, minutes, label, kind, at=None, miles=0.0):
        start = self.t if at is None else at
        end = start + minutes
        m0 = self.miles
        self.segs.append(Segment(status, start, end, label, kind, m0, m0 + miles))
        if at is None:
            self.t = end

    def _start_shift(self):
        if self.shift_start is None:
            self.shift_start = self.t

    def _reset_shift(self):
        self.shift_start = None
        self.drive_shift = 0
        self.since_break = 0

    # -- non-driving events -------------------------------------------------
    def on_duty(self, minutes, label, kind):
        self._start_shift()
        self._add(ON, minutes, label, kind)
        self.cycle += minutes
        if minutes >= BREAK_LEN:
            self.since_break = 0

    def rest(self):
        self._add(SB, REST_LEN, "10-hr rest (sleeper berth)", "rest")
        self._reset_shift()

    def restart(self):
        self._add(OFF, RESTART_LEN, "34-hr restart (resets 70-hr cycle)", "restart")
        self._reset_shift()
        self.cycle = 0

    def short_break(self):
        self._add(OFF, BREAK_LEN, "30-min break", "break")
        self.since_break = 0

    def refuel(self):
        self.on_duty(FUEL_STOP_LEN, "Fuel stop", "fuel")
        self.since_fuel = 0.0

    # -- driving ------------------------------------------------------------
    def drive(self, miles, minutes, label):
        if minutes <= 0:
            return
        mpm = miles / minutes
        left = minutes
        while left > 0:
            self._start_shift()
            window_left = self.shift_start + WINDOW - self.t
            fuel_min = floor((FUEL_EVERY_MILES - self.since_fuel) / mpm + 1e-9) if mpm > 0 else left
            caps = [left, DRIVE_LIMIT - self.drive_shift, window_left,
                    BREAK_AFTER - self.since_break, CYCLE_LIMIT - self.cycle, fuel_min]
            chunk = min(caps)
            if chunk <= 0:
                if self.drive_shift >= DRIVE_LIMIT or window_left <= 0:
                    self.rest()
                elif self.cycle >= CYCLE_LIMIT:
                    self.restart()
                elif self.since_break >= BREAK_AFTER:
                    self.short_break()
                else:
                    self.refuel()
                continue
            dist = chunk * mpm
            self._add(D, chunk, label, "drive", miles=dist)
            self.miles += dist
            self.since_fuel += dist
            self.drive_shift += chunk
            self.since_break += chunk
            self.cycle += chunk
            left -= chunk


def plan_trip(leg_to_pickup, leg_to_dropoff, cycle_used_hours, start_hour=8.0):
    """Each leg is (miles, drive_minutes). Returns a Plan."""
    sim = _Sim(cycle_used_hours, int(round(start_hour * 60)))
    if sim.cycle >= CYCLE_LIMIT:
        sim.restart()
    sim.drive(*leg_to_pickup, "Driving to pickup")
    sim.on_duty(PICKUP_LEN, "Pickup (loading)", "pickup")
    sim.drive(*leg_to_dropoff, "Driving to dropoff")
    sim.on_duty(DROPOFF_LEN, "Dropoff (unloading)", "dropoff")
    return Plan(sim.segs, round(sim.miles, 1))


def build_daily_logs(plan, cycle_used_hours):
    """Split the plan at midnight into one log sheet per calendar day."""
    segs = plan.segments
    if not segs:
        return []
    n_days = (segs[-1].end - 1) // DAY + 1
    cycle = int(round(cycle_used_hours * 60))
    logs = []
    for day in range(n_days):
        lo, hi = day * DAY, (day + 1) * DAY
        entries, totals, miles = [], {OFF: 0, SB: 0, D: 0, ON: 0}, 0.0
        for s in segs:
            a, b = max(s.start, lo), min(s.end, hi)
            if b <= a:
                continue
            frac = (b - a) / s.minutes
            entries.append({"status": s.status, "start": a - lo, "end": b - lo,
                            "label": s.label, "kind": s.kind})
            totals[s.status] += b - a
            miles += (s.mile_end - s.mile_start) * frac
            if s.kind == "restart" and a == s.start:
                cycle = 0
            if s.status in (D, ON):
                cycle += b - a
        last_end = entries[-1]["end"] if entries else 0
        if last_end < DAY:  # trip finished mid-day: remainder is off duty
            entries.append({"status": OFF, "start": last_end, "end": DAY,
                            "label": "Off duty", "kind": "idle"})
            totals[OFF] += DAY - last_end
        # merge adjacent same-status entries for the grid, keep first label
        grid = []
        for e in entries:
            if grid and grid[-1]["status"] == e["status"] and grid[-1]["end"] == e["start"]:
                grid[-1]["end"] = e["end"]
            else:
                grid.append(dict(e))
        remarks, prev = [], None
        for e in entries:
            if e["kind"] != "idle" and e["kind"] != prev:
                remarks.append({"minute": e["start"], "label": e["label"], "status": e["status"]})
            prev = e["kind"]
        on_duty = totals[D] + totals[ON]
        logs.append({
            "day": day + 1,
            "entries": grid,
            "events": entries,
            "remarks": remarks,
            "totals_hours": {k: round(v / 60, 2) for k, v in totals.items()},
            "miles": round(miles, 1),
            "recap": {
                "on_duty_today": round(on_duty / 60, 2),
                "cycle_total": round(cycle / 60, 2),
                "cycle_available": round(max(0, CYCLE_LIMIT - cycle) / 60, 2),
            },
        })
    return logs

