"""Black-box accuracy check: POST trips to a running API and verify the output obeys the HOS rules.

Usage: python check_live.py [base_url]
"""
import sys
import time

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

CASES = [
    ("short, same day", "Dallas, TX", "Fort Worth, TX", "Oklahoma City, OK", 0, 8),
    ("cycle 69 (almost full)", "Chicago, IL", "Indianapolis, IN", "Columbus, OH", 69, 8),
    ("coast to coast", "Miami, FL", "Atlanta, GA", "Seattle, WA", 0, 6),
    ("cycle exactly 70", "Denver, CO", "Salt Lake City, UT", "Boise, ID", 70, 8),
    ("starts 22:00, crosses midnight", "Houston, TX", "Austin, TX", "Denver, CO", 50, 22),
    ("pickup == current location", "Phoenix, AZ", "Phoenix, AZ", "Las Vegas, NV", 15.5, 5),
]

DRIVE, WINDOW, BRK, CYCLE = 660, 840, 480, 4200


def check(d, cycle_used, label):
    errs = []
    segs = d["segments"]
    for a, b in zip(segs, segs[1:]):
        if a["end"] != b["start"]:
            errs.append(f"gap/overlap at {a['end']}->{b['start']}")
    drive = since_break = since_fuel_min = 0
    shift_start = None
    cycle = int(cycle_used * 60)
    miles_since_fuel = 0.0
    total_driven = 0.0
    kinds = [s["kind"] for s in segs]
    mpm = None
    for s in segs:
        m = s["end"] - s["start"]
        if s["kind"] in ("rest", "restart"):
            if s["kind"] == "rest" and m < 600:
                errs.append("rest < 10h")
            if s["kind"] == "restart":
                if m < 2040:
                    errs.append("restart < 34h")
                cycle = 0
            drive = since_break = 0
            shift_start = None
            continue
        if s["status"] in ("D", "ON") and shift_start is None:
            shift_start = s["start"]
        if s["status"] == "D":
            drive += m
            since_break += m
            cycle += m
            if drive > DRIVE:
                errs.append(f"11h exceeded ({drive})")
            if s["end"] - shift_start > WINDOW:
                errs.append("14h window exceeded while driving")
            if since_break > BRK:
                errs.append("8h w/o 30m break")
            if cycle > CYCLE:
                errs.append(f"drove past 70h cycle ({cycle/60:.2f})")
        else:
            if s["status"] == "ON":
                cycle += m
            if m >= 30:
                since_break = 0
    for st in d["stops"]:
        pass
    # fuel: mile gaps between fuel stops
    fuel_miles = [st["mile"] for st in d["stops"] if st["type"] == "fuel"]
    marks = [0] + fuel_miles + [d["summary"]["total_miles"]]
    for a, b in zip(marks, marks[1:]):
        if b - a > 1000.5:
            errs.append(f"{b-a:.0f} miles between fuel stops")
    for k, want in (("pickup", 60), ("dropoff", 60)):
        ms = [s["end"] - s["start"] for s in segs if s["kind"] == k]
        if ms != [want]:
            errs.append(f"{k} durations {ms}")
    if kinds[-1] != "dropoff":
        errs.append("trip does not end with dropoff")
    for lg in d["logs"]:
        tot = sum(lg["totals_hours"].values())
        if abs(tot - 24) > 0.02:
            errs.append(f"day {lg['day']} totals {tot}")
        if lg["entries"][0]["start"] != 0 or lg["entries"][-1]["end"] != 1440:
            errs.append(f"day {lg['day']} grid not 0..1440")
    if abs(sum(lg["miles"] for lg in d["logs"]) - d["summary"]["total_miles"]) > 1:
        errs.append("daily miles don't sum to total")
    return errs


bad = 0
for name, cur, pick, drop, cycle, start in CASES:
    t0 = time.time()
    r = requests.post(f"{BASE}/api/plan/", json={"current_location": cur, "pickup_location": pick,
                                                 "dropoff_location": drop, "cycle_used_hours": cycle,
                                                 "start_hour": start}, timeout=120)
    if r.status_code != 200:
        print(f"[FAIL] {name}: HTTP {r.status_code} {r.text[:200]}")
        bad += 1
        continue
    d = r.json()
    errs = check(d, cycle, name)
    kinds = [s["kind"] for s in d["segments"]]
    s = d["summary"]
    print(f"[{'OK' if not errs else 'FAIL'}] {name}: {s['total_miles']:.0f} mi, {s['total_days']} days, "
          f"{s['driving_hours']:.1f}h driving, rests={kinds.count('rest')} breaks={kinds.count('break')} "
          f"fuel={kinds.count('fuel')} restarts={kinds.count('restart')} ({time.time()-t0:.1f}s)")
    for e in errs:
        print("    -", e)
    bad += bool(errs)
sys.exit(1 if bad else 0)
