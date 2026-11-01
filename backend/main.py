"""
WindDesk API — Elexon GB wind generation: first-forecast accuracy, Jan 2026.

Data (loaded from CSV at startup, see ../data/fetch_data.py):
  actuals_wind.csv       half-hourly metered GB wind generation (MW),
                         Elexon AGPT: Wind Offshore + Wind Onshore.
  forecast_earliest.csv  first published wind forecast per hourly target
                         (Elexon earliest wind forecast service, WINDFOR-derived).
  forecast_latest.csv    final published wind forecast per hourly target
                         (Elexon latest wind forecast service, WINDFOR-derived).

Methodology: the operative forecast is the EARLIEST published forecast for
each target period (the first forecast a planning desk receives, issued
43.5-66.5 h ahead in this dataset). Accuracy = that forecast vs actuals.
Forecast services publish hourly points (744 in January); actuals are
half-hourly (1,488). Metrics are computed at the 744 forecast points.
All times UTC (UK is on GMT in January).
"""

import os
from datetime import date, datetime, time, timedelta, timezone

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(HERE, "..", "data"))
STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(HERE, "..", "frontend", "dist"))

JAN_START = datetime(2026, 1, 1, tzinfo=timezone.utc)

# ---------------------------------------------------------------- load data
actuals = pd.read_csv(os.path.join(DATA_DIR, "actuals_wind.csv"),
                      parse_dates=["startTime"])
earliest = pd.read_csv(os.path.join(DATA_DIR, "forecast_earliest.csv"),
                       parse_dates=["startTime", "publishTime"])
latest = pd.read_csv(os.path.join(DATA_DIR, "forecast_latest.csv"),
                     parse_dates=["startTime", "publishTime"])

for df in (earliest, latest):
    df["horizon_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600.0

merged = (earliest.rename(columns={"forecast_mw": "earliest_mw",
                                   "publishTime": "earliest_publish"})
          .merge(actuals, on="startTime", how="inner")
          .merge(latest.rename(columns={"forecast_mw": "latest_mw",
                                        "publishTime": "latest_publish"})[
                     ["startTime", "latest_mw", "latest_publish"]],
                 on="startTime", how="inner")
          .sort_values("startTime").reset_index(drop=True))
merged["date"] = merged["startTime"].dt.date
merged["err_earliest"] = merged["earliest_mw"] - merged["actual_mw"]
merged["err_latest"] = merged["latest_mw"] - merged["actual_mw"]

DAYS = [date(2026, 1, d) for d in range(1, 32)]

# Horizon buckets fitted to the real earliest-forecast horizon range
# (43.5-66.5 h in this dataset).
HORIZON_BUCKETS = [(0, 48, "<48 h"), (48, 54, "48-54 h"),
                   (54, 60, "54-60 h"), (60, np.inf, ">60 h")]


def metrics(err: pd.Series) -> dict:
    return {
        "mae_mw": round(float(err.abs().mean())),
        "rmse_mw": round(float(np.sqrt((err ** 2).mean()))),
        "bias_mw": round(float(err.mean())),
        "count": int(err.count()),
    }


OVERALL_EARLIEST = metrics(merged["err_earliest"])
OVERALL_LATEST = metrics(merged["err_latest"])

app = FastAPI(title="WindDesk API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"],
                   allow_headers=["*"])


def iso(dt) -> str:
    return pd.Timestamp(dt).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- endpoints
@app.get("/api/days")
def days():
    return {"days": [d.isoformat() for d in DAYS]}


@app.get("/api/day")
def day(date_str: str = Query(..., alias="date")):
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    if d not in DAYS:
        raise HTTPException(404, "date outside January 2026 scope")

    day_actuals = actuals[actuals["startTime"].dt.date == d]
    day_fc = merged[merged["date"] == d].set_index("startTime")
    periods = []
    for _, row in day_actuals.iterrows():
        st = row["startTime"]
        fc = day_fc.loc[st] if st in day_fc.index else None
        periods.append({
            "startTime": iso(st),
            "time": st.strftime("%H:%M"),
            "actual_mw": round(float(row["actual_mw"])),
            "earliest_mw": None if fc is None else round(float(fc["earliest_mw"])),
            "latest_mw": None if fc is None else round(float(fc["latest_mw"])),
        })

    fc_vals = day_fc["earliest_mw"]
    act_at_fc = day_fc["actual_mw"]
    peak_fc_i = fc_vals.idxmax()
    peak_act_i = day_actuals.loc[day_actuals["actual_mw"].idxmax(), "startTime"]
    forecast_total = float(fc_vals.sum()) / 1000.0          # 24 hourly pts x 1 h
    actual_matched = float(act_at_fc.sum()) / 1000.0        # same points, x 1 h
    kpis = {
        "forecast_total_gwh": round(forecast_total, 2),
        "actual_total_gwh": round(float(day_actuals["actual_mw"].sum()) * 0.5 / 1000.0, 2),
        "actual_matched_gwh": round(actual_matched, 2),
        # like-for-like at the 24 forecast points (both x 1 h)
        "shortfall_gwh": round(actual_matched - forecast_total, 2),
        "peak_forecast_mw": round(float(fc_vals.max())),
        "peak_forecast_time": peak_fc_i.strftime("%H:%M"),
        "peak_actual_mw": round(float(day_actuals["actual_mw"].max())),
        "peak_actual_time": peak_act_i.strftime("%H:%M"),
        "mae_mw": OVERALL_EARLIEST["mae_mw"],  # band used by the dashboard
    }
    return {"date": d.isoformat(), "periods": periods, "kpis": kpis}


@app.get("/api/accuracy")
def accuracy():
    buckets = []
    for lo, hi, label in HORIZON_BUCKETS:
        sub = merged[(merged["horizon_h"] > lo) & (merged["horizon_h"] <= hi)]
        if len(sub):
            b = metrics(sub["err_earliest"])
            b["bucket"] = label
            buckets.append(b)
    daily = (merged.groupby("date")
             .apply(lambda g: round(float(g["err_earliest"].abs().mean())),
                    include_groups=False)
             .reset_index())
    daily.columns = ["date", "mae_mw"]
    return {
        "matched_periods": int(len(merged)),
        "earliest": OVERALL_EARLIEST,
        "latest": OVERALL_LATEST,
        "horizon_buckets": buckets,
        "horizon_range_h": [round(float(merged["horizon_h"].min()), 1),
                            round(float(merged["horizon_h"].max()), 1)],
        "daily_mae": [{"date": r.date.isoformat(), "mae_mw": int(r.mae_mw)}
                      for r in daily.itertuples()],
        "best_day": min(({"date": r.date.isoformat(), "mae_mw": int(r.mae_mw)}
                         for r in daily.itertuples()), key=lambda x: x["mae_mw"]),
        "worst_day": max(({"date": r.date.isoformat(), "mae_mw": int(r.mae_mw)}
                          for r in daily.itertuples()), key=lambda x: x["mae_mw"]),
    }


@app.get("/api/journey")
def journey(date_str: str = Query(..., alias="date"),
            period: int = Query(..., ge=0, le=47)):
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    if d not in DAYS:
        raise HTTPException(404, "date outside January 2026 scope")
    st = datetime.combine(d, time(0, 0), tzinfo=timezone.utc) + timedelta(minutes=30 * period)
    row = merged[merged["startTime"] == pd.Timestamp(st)]
    if row.empty:
        raise HTTPException(
            404, "No forecast for this period: forecasts are published for "
                 "on-the-hour periods only (even period indexes).")
    r = row.iloc[0]
    return {
        "date": d.isoformat(),
        "period": period,
        "startTime": iso(st),
        "time": st.strftime("%H:%M"),
        "earliest": {"value_mw": round(float(r["earliest_mw"])),
                     "publishTime": iso(r["earliest_publish"]),
                     "horizon_h": round(float(r["horizon_h"]), 1),
                     "error_mw": round(float(r["err_earliest"]))},
        "latest": {"value_mw": round(float(r["latest_mw"])),
                   "publishTime": iso(r["latest_publish"]),
                   "error_mw": round(float(r["err_latest"]))},
        "actual_mw": round(float(r["actual_mw"])),
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "actuals_rows": int(len(actuals)),
            "matched_forecast_points": int(len(merged))}


# Serve the built frontend when present (single-container deployment).
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
