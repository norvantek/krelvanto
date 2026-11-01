import { useEffect, useState } from "react";
import {
  CartesianGrid, ComposedChart, Area, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { api, fmt, fmtSigned, prettyDate } from "../api";

const tooltipStyle = { backgroundColor: "#2a2718", border: "1px solid #3a3625", color: "#f5efe0" };

export default function Dashboard() {
  const [days, setDays] = useState([]);
  const [date, setDate] = useState("2026-01-15");
  const [day, setDay] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.days().then((d) => setDays(d.days)).catch((e) => setError(e.message));
    api.accuracy().then(setAccuracy).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!date) return;
    setDay(null);
    api.day(date).then(setDay).catch((e) => setError(e.message));
  }, [date]);

  if (error) return <div className="status error">Could not load data: {error}</div>;
  if (!day || !accuracy) return <div className="status">Loading…</div>;

  const mae = accuracy.earliest.mae_mw;
  const bias = accuracy.earliest.bias_mw;
  const chart = day.periods.map((p) => ({
    time: p.time,
    actual: p.actual_mw,
    forecast: p.earliest_mw,
    bandBase: p.earliest_mw == null ? null : p.earliest_mw - mae,
    bandRange: p.earliest_mw == null ? null : 2 * mae,
  }));
  const k = day.kpis;

  return (
    <div className="panel">
      <h2>Decision dashboard — {prettyDate(date)}</h2>
      <p className="sub">
        The first wind forecast the desk received for each hour of the day (orange,
        published about two days ahead) against the wind that actually arrived
        (cream). The shaded band is the typical error of that first forecast
        (±{fmt(mae)} MW, the January average). Forecasts are issued for on-the-hour
        periods; actuals are half-hourly.
      </p>
      <div className="controls">
        <div>
          <label htmlFor="day">Delivery day</label>
          <select id="day" value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>{prettyDate(d)}</option>
            ))}
          </select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="#3a3625" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="#b3a98f" interval={7} tick={{ fontSize: 12 }} />
          <YAxis stroke="#b3a98f" tick={{ fontSize: 12 }}
                 tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(v, name) => [`${fmt(v)} MW`, name]} />
          <Legend />
          <Area dataKey="bandBase" stackId="band" stroke="none" fill="transparent"
                legendType="none" tooltipType="none" connectNulls />
          <Area dataKey="bandRange" stackId="band" stroke="none" fill="#ff7a1a"
                fillOpacity={0.14} name={`Typical error band (±${fmt(mae)} MW)`} connectNulls />
          <Line type="monotone" dataKey="forecast" name="First forecast" stroke="#ff7a1a"
                strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="actual" name="Actual wind" stroke="#f5efe0"
                strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="kpis">
        <div className="kpi">
          <div className="v orange">{k.forecast_total_gwh.toFixed(1)} GWh</div>
          <div className="l">Wind energy in the first forecast (24 hourly points)</div>
        </div>
        <div className="kpi">
          <div className="v">{k.actual_total_gwh.toFixed(1)} GWh</div>
          <div className="l">Wind energy that actually arrived (full day, half-hourly)</div>
        </div>
        <div className="kpi">
          <div className="v orange">{fmt(k.peak_forecast_mw)} MW</div>
          <div className="l">Forecast peak, at {k.peak_forecast_time}</div>
        </div>
        <div className="kpi">
          <div className="v">{fmt(k.peak_actual_mw)} MW</div>
          <div className="l">Actual peak, at {k.peak_actual_time}</div>
        </div>
        <div className="kpi">
          <div className="v">{fmtSigned(k.shortfall_gwh)} GWh</div>
          <div className="l">
            Shortfall at the forecast points (actual {k.actual_matched_gwh.toFixed(1)} GWh
            minus forecast {k.forecast_total_gwh.toFixed(1)} GWh) — energy the desk
            had to find elsewhere
          </div>
        </div>
      </div>

      <div className="trust">
        <strong>Should the desk trust the first forecast?</strong> Across January 2026
        it was wrong by <strong>{fmt(mae)} MW</strong> on average, and it usually
        predicted <strong>{fmt(Math.abs(bias))} MW {bias < 0 ? "less" : "more"} wind
        than actually arrived</strong> (bias {fmtSigned(bias)} MW). Plan purchases
        expecting the first forecast to {bias < 0 ? "understate" : "overstate"} the wind.
      </div>
    </div>
  );
}
