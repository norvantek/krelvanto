# WindDesk — GB Wind Forecast Accuracy for a Day-Ahead Purchasing Desk
**Live demo:** https://krelvanto.vercel.app

**What it is.** WindDesk shows a GB power purchasing / planning desk how much it
can trust the first wind generation forecast it receives for each hour, using
real Elexon data for January 2026. It has three screens:

1. **Decision Dashboard** — for any January delivery day: the first published
   wind forecast vs the wind that actually arrived, with the forecast's typical
   error band, day energy totals, peaks, and the shortfall the desk had to cover.
2. **Forecast Accuracy** — how accurate that first forecast was across the whole
   month (MAE, RMSE, bias), how error grows with forecast horizon, and which
   days were best / worst.
3. **Forecast Journey** — one settlement hour followed through three numbers:
   the first forecast issued, the final forecast update, and the actual.

**Who it is for.** The day-ahead purchasing / trading desk of a GB energy
supplier, which must decide a day (or more) ahead how much power to buy to
cover demand, knowing wind will supply a variable share of it.

## Headline results (January 2026, 744 forecast points)

| Forecast | MAE | RMSE | Bias (forecast − actual) |
|---|---|---|---|
| First published forecast (43.5–66.5 h ahead) | **2,051 MW** | 2,839 MW | −572 MW |
| Final forecast update | **1,035 MW** | 1,288 MW | −652 MW |

Error grows steadily with horizon: MAE 1,620 MW for horizons under 48 h,
1,892 MW at 48–54 h, 2,108 MW at 54–60 h, and 2,446 MW beyond 60 h.
Best day: 1 Jan 2026 (MAE 507 MW). Worst day: 20 Jan 2026 (MAE 8,110 MW).
The negative bias means the first forecast systematically predicted **less**
wind than actually arrived in January 2026.

## Architecture

```
data/       fetch_data.py + the three CSVs it produces (real Elexon data)
backend/    FastAPI (Python) — loads the CSVs, precomputes metrics, serves
            /api/* and, in production, the built frontend on the same origin
frontend/   React + Vite + Recharts — the three screens; every number on
            screen comes from the API (nothing is hard-coded)
Dockerfile  multi-stage: builds the frontend, then one Python container
            serving API + static build on port 8000
```

## Data sources (stated transparently)

All data is from **Elexon**, the GB Balancing Mechanism Reporting Service
(BMRS), API base `https://data.elexon.co.uk/bmrs/api/v1/`, scope **January
2026**, all times **UTC** (the UK is on GMT in January, so UTC = London local
time; there is no daylight-saving complication).

- **Actuals** — `GET /generation/actual/per-type` (dataset **AGPT**), actual
  generation outturn by type at half-hourly resolution. National wind actual =
  **Wind Offshore + Wind Onshore** summed per settlement period.
  Coverage: **1,488 of 1,488** January half-hours.
- **Forecasts** — the Elexon wind forecast services, which publish the WINDFOR
  forecast vintages per settlement period:
  `GET /forecast/generation/wind/earliest/stream` (the first forecast published
  for each period) and `GET /forecast/generation/wind/latest/stream` (the
  final forecast update for each period).

*Substitution note.* The original plan was to read the raw `/datasets/FUELHH`
and `/datasets/WINDFOR` streams. In our environment those endpoints ignore
date-range parameters and return only a live snapshot, so they cannot supply
January 2026 history. The AGPT and earliest/latest forecast services above are
Elexon's published equivalents for the same underlying data and do honour date
ranges; they were used instead, and this README states that plainly rather
than presenting the numbers as coming from the raw dataset streams.

## Methodology

- **Operative forecast = the earliest published forecast for each period** —
  the first forecast a planning desk receives for that period, genuinely issued
  before delivery (in this dataset, published in a daily run at 02:30 UTC,
  43.5–66.5 hours ahead of the target period). Accuracy is evaluated for that
  forecast against metered actuals.
- **Resolution.** The forecast services publish one value per **hour**
  (on-the-hour settlement periods), while actuals are half-hourly. All
  accuracy metrics are therefore computed at the **744 hourly forecast points**
  in January, matched to actuals at the same start times — no forecast values
  were interpolated or invented for the half-hour points in between.
- **Metrics.** Error = forecast − actual (MW). MAE = mean absolute error,
  RMSE = root mean square error, bias = mean signed error. Horizon buckets
  (<48 h, 48–54 h, 54–60 h, >60 h) were fitted to the real horizon
  distribution (43.5–66.5 h).
- **Day-view energy totals.** Forecast total = the day's 24 hourly forecast
  values × 1 h. Actual total = all 48 half-hourly values × 0.5 h. Shortfall is
  like-for-like at the 24 forecast points: actual at those points × 1 h minus
  forecast total.
- **Screen 3** uses exactly the two vintages this data has — labelled
  truthfully as "first forecast issued" and "final forecast update", each with
  its real publish time.

## How to run

### Docker (single container)

```bash
docker build -t winddesk .
docker run -p 8000:8000 winddesk
# open http://localhost:8000
```

(or `docker compose up --build`.)

### Local (no Docker)

```bash
# 1. (optional) re-fetch the data
cd data && ../.venv/bin/python fetch_data.py   # needs requests + pandas

# 2. backend + production frontend, single origin on :8000
cd ../frontend && npm install && npm run build
cd ../backend  && pip install -r requirements.txt
uvicorn main:app --port 8000
# open http://localhost:8000

# 3. or frontend dev mode (proxies /api to :8000)
cd ../frontend && npm run dev   # http://localhost:5173
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/days` | The 31 delivery dates of January 2026 |
| `GET /api/day?date=YYYY-MM-DD` | 48 half-hours (earliest forecast, latest forecast, actual), day KPIs (forecast/actual totals, peaks, shortfall) and the overall MAE used for the error band |
| `GET /api/accuracy` | Overall MAE/RMSE/bias for the earliest and latest forecasts, horizon-bucket metrics, the 31-day daily-MAE series, best/worst day |
| `GET /api/journey?date=YYYY-MM-DD&period=0-47` | For one hour: first forecast (value, publish time, horizon, error), final update (value, publish time, error), actual. Periods without a forecast (half-hour points) return 404 |
| `GET /api/health` | Row counts and status |

## Verification performed

Data: actuals coverage 1,488/1,488 half-hours; earliest and latest forecasts
744/744 hourly targets; spot check 15 Jan 2026 00:00 — actual 17,360 MW
(10,971 MW Wind Offshore + 6,389 MW Wind Onshore), first forecast 13,924 MW
published 13 Jan 02:30 UTC, final update 16,489 MW.
App: the API was exercised with `curl` (all endpoints, including 404 cases),
the frontend production build compiles, FastAPI serves the built frontend and
the API on one origin (HTTP 200 for `/`, the JS bundle, `/api/*`, `/docs`),
and the Vite dev server + proxy were smoke-tested. Docker is not installed in
the development VM, so the image itself was not built there; the exact runtime
configuration the Dockerfile assembles (uvicorn serving API + static build)
was verified directly. No rendered-browser QA is available in the development
environment, so verification is programmatic.

## AI use

AI tools (Claude) assisted with the development of this project.
