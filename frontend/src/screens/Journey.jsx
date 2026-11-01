import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, fmt, fmtSigned, prettyDate, prettyDateTime } from "../api";

const tooltipStyle = { backgroundColor: "#2a2718", border: "1px solid #3a3625", color: "#f5efe0" };
// Forecasts exist for on-the-hour periods only: even indexes 0, 2, ..., 46.
const HOURS = Array.from({ length: 24 }, (_, i) => i * 2);
const hourLabel = (p) => `${String(p / 2).padStart(2, "0")}:00`;

function Step({ tag, value, meta, error }) {
  const good = error != null && Math.abs(error) < 1000;
  return (
    <div className="step">
      <div className="tag">{tag}</div>
      <div className="v">{fmt(value)} MW</div>
      <div className="meta">{meta}</div>
      {error != null && (
        <div className={`err ${good ? "good" : "bad"}`}>
          Error {fmtSigned(error)} MW vs actual
        </div>
      )}
    </div>
  );
}

export default function Journey() {
  const [days, setDays] = useState([]);
  const [date, setDate] = useState("2026-01-15");
  const [period, setPeriod] = useState(0);
  const [j, setJ] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.days().then((d) => setDays(d.days)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setJ(null);
    setError(null);
    api.journey(date, period).then(setJ).catch((e) => setError(e.message));
  }, [date, period]);

  const chart = j
    ? [
        { name: "First forecast", value: j.earliest.value_mw, fill: "#ff7a1a" },
        { name: "Final update", value: j.latest.value_mw, fill: "#7fb2d9" },
        { name: "Actual", value: j.actual_mw, fill: "#f5efe0" },
      ]
    : [];

  return (
    <div className="panel">
      <h2>Forecast journey — one hour, three numbers</h2>
      <p className="sub">
        Follow a single settlement hour from the first forecast the desk received,
        through the final forecast update, to the wind that actually arrived. These
        are the only two forecast vintages published for each hour.
      </p>
      <div className="controls">
        <div>
          <label htmlFor="jday">Delivery day</label>
          <select id="jday" value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>{prettyDate(d)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jperiod">Hour starting</label>
          <select id="jperiod" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            {HOURS.map((p) => (
              <option key={p} value={p}>{hourLabel(p)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="status error">{error}</div>}
      {!error && !j && <div className="status">Loading…</div>}
      {j && (
        <>
          <div className="steps">
            <Step tag="1 · First forecast issued" value={j.earliest.value_mw}
                  meta={`Published ${prettyDateTime(j.earliest.publishTime)} — ${j.earliest.horizon_h} h before delivery`}
                  error={j.earliest.error_mw} />
            <Step tag="2 · Final forecast update" value={j.latest.value_mw}
                  meta={`Published ${prettyDateTime(j.latest.publishTime)}`}
                  error={j.latest.error_mw} />
            <Step tag="3 · Actual wind" value={j.actual_mw}
                  meta={`${prettyDate(j.date)}, ${j.time} UTC (metered)`} />
          </div>
          <div style={{ marginTop: 18 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid stroke="#3a3625" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#b3a98f" tick={{ fontSize: 12 }} />
                <YAxis stroke="#b3a98f" tick={{ fontSize: 12 }}
                       tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle}
                         formatter={(v) => [`${fmt(v)} MW`, "Wind generation"]} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chart.map((c) => (
                    <Cell key={c.name} fill={c.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
