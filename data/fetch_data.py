"""
Fetch Elexon BMRS data for the WindDesk challenge (relaxed, user-approved scope).

Why these sources: in this environment the /datasets/FUELHH and
/datasets/WINDFOR stream endpoints ignore date ranges and return only a live
snapshot, so they cannot supply January 2026 history. The endpoints below DO
honour date ranges and return real January 2026 data:

  - Actuals : GET /generation/actual/per-type  (dataset AGPT)
              Half-hourly MW by generation type. National wind actual =
              "Wind Offshore" + "Wind Onshore" per startTime.
  - Forecasts (WINDFOR-derived services, one vintage per target startTime):
      GET /forecast/generation/wind/earliest/stream
          -> first forecast published for each target period
      GET /forecast/generation/wind/latest/stream
          -> final forecast update for each target period
    NOTE: these forecast services publish ONE value per hour (the on-the-hour
    settlement periods 1, 3, 5, ...), so forecast targets are hourly points,
    while actuals are half-hourly.

Windows (all UTC; the UK is on GMT in January so UTC == London local time):
  - Forecast targets: 2025-12-29 .. 2026-02-01 requested (filtered to
    1-31 Jan 2026 below); starting early guarantees the earliest vintages of
    the 1 Jan targets are captured.
  - Actuals: 2026-01-01 .. 2026-02-01 (filtered to January).

Usage:  python fetch_data.py
Output (next to this script):
  actuals_wind.csv        startTime, actual_mw            (half-hourly)
  forecast_earliest.csv   startTime, publishTime, forecast_mw
  forecast_latest.csv     startTime, publishTime, forecast_mw
"""

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

BASE = "https://data.elexon.co.uk/bmrs/api/v1"
HERE = os.path.dirname(os.path.abspath(__file__))

JAN_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
JAN_END = datetime(2026, 2, 1, tzinfo=timezone.utc)  # exclusive
FORECAST_FROM = datetime(2025, 12, 29, tzinfo=timezone.utc)
FORECAST_TO = JAN_END


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def get_json(url, params, tries=3):
    last = None
    for attempt in range(tries):
        try:
            resp = requests.get(url, params=params, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # retry transient failures
            last = exc
            print(f"    retry {attempt + 1}/{tries} after error: {exc}")
            time.sleep(2 * (attempt + 1))
    raise last


def fetch_windows(url, start, end, chunk_days=7):
    """GET a from/to endpoint in chunks; return the concatenated row list."""
    rows = []
    day = start
    while day < end:
        nxt = min(day + timedelta(days=chunk_days), end)
        payload = get_json(url, {"from": iso(day), "to": iso(nxt)})
        batch = payload if isinstance(payload, list) else payload.get("data", [])
        rows.extend(batch)
        print(f"  {url.rsplit('/', 2)[-2]}/{url.rsplit('/', 1)[-1]} "
              f"{iso(day)}..{iso(nxt)}: {len(batch)} rows")
        day = nxt
        time.sleep(0.2)
    return rows


def fetch_actuals() -> pd.DataFrame:
    url = f"{BASE}/generation/actual/per-type"
    raw = fetch_windows(url, JAN_START, JAN_END)
    records = []
    for rec in raw:
        total = 0.0
        found = False
        for item in rec.get("data", []):
            if item.get("psrType") in ("Wind Offshore", "Wind Onshore"):
                total += float(item["quantity"])
                found = True
        if found:
            records.append({"startTime": rec["startTime"], "actual_mw": total})
    df = pd.DataFrame(records)
    df = df.drop_duplicates(subset=["startTime"]).sort_values("startTime")
    mask = (df["startTime"] >= iso(JAN_START)) & (df["startTime"] < iso(JAN_END))
    return df[mask].reset_index(drop=True)


def fetch_forecast(kind: str) -> pd.DataFrame:
    url = f"{BASE}/forecast/generation/wind/{kind}/stream"
    raw = fetch_windows(url, FORECAST_FROM, FORECAST_TO)
    df = pd.DataFrame(raw)
    df = df.rename(columns={"generation": "forecast_mw"})
    df = df[["startTime", "publishTime", "forecast_mw"]]
    df = df.drop_duplicates(subset=["startTime"]).sort_values("startTime")
    mask = (df["startTime"] >= iso(JAN_START)) & (df["startTime"] < iso(JAN_END))
    return df[mask].reset_index(drop=True)


def main() -> int:
    print("Fetching AGPT actuals (Wind Offshore + Wind Onshore)...")
    actuals = fetch_actuals()
    out = os.path.join(HERE, "actuals_wind.csv")
    actuals.to_csv(out, index=False)
    print(f"Saved {out}: {len(actuals)} rows "
          f"({actuals['startTime'].min()} .. {actuals['startTime'].max()})")

    for kind in ("earliest", "latest"):
        print(f"Fetching {kind} wind forecast vintage...")
        fc = fetch_forecast(kind)
        out = os.path.join(HERE, f"forecast_{kind}.csv")
        fc.to_csv(out, index=False)
        print(f"Saved {out}: {len(fc)} rows "
              f"({fc['startTime'].min()} .. {fc['startTime'].max()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
