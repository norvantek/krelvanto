import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { api, fmt, fmtSigned, prettyDate } from "../api";

const tooltipStyle = { backgroundColor: "#2a2718", border: "1px solid #3a3625", color: "#f5efe0" };

export default function Accuracy() {
  const [acc, setAcc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.accuracy().then(setAcc).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="status error">Could not load data: {error}</div>;
  if (!acc) return <div className="status">Loading…</div>;

  const e = acc.earliest;
  const daily = acc.daily_mae.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <>
      <div className="panel">
        <h2>How accurate was the first forecast?</h2>
        <p className="sub">
          Every January 2026 hour the desk planned around ({acc.matched_periods} forecast
          points). The “first forecast” is the earliest forecast published for each
          hour, issued {acc.horizon_range_h[0]}–{acc.horizon_range_h[1]} hours ahead.
          Errors are forecast minus actual metered wind generation.
        </p>
        <div className="kpis">
          <div className="kpi">
            <div className="v orange">{fmt(e.mae_mw)} MW</div>
            <div className="l"><strong>MAE — mean absolute error.</strong> On a typical
              hour, the first forecast missed the actual wind by about this much.</div>
          </div>
          <div className="kpi">
            <div className="v orange">{fmt(e.rmse_mw)} MW</div>
            <div className="l"><strong>RMSE — root mean square error.</strong> Like MAE
              but punishes big misses more; the gap to MAE shows January had some
              very large misses.</div>
          </div>
          <div className="kpi">
            <div className="v orange">{fmtSigned(e.bias_mw)} MW</div>
            <div className="l"><strong>Bias — mean signed error.</strong> Negative means
              the first forecast systematically predicted less wind than arrived —
              a cautious forecast the desk can correct for.</div>
          </div>
          <div className="kpi">
            <div className="v">{fmt(acc.latest.mae_mw)} MW</div>
            <div className="l"><strong>Final-update MAE.</strong> After all revisions,
              the last forecast for each hour missed by this much — the improvement
              the desk gains by re-planning as updates arrive.</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Error grows with forecast horizon</h2>
        <p className="sub">
          The earlier the first forecast was issued, the worse it scored. Buckets are
          target time minus publish time for the first forecast.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={acc.horizon_buckets} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="#3a3625" strokeDasharray="3 3" />
            <XAxis dataKey="bucket" stroke="#b3a98f" tick={{ fontSize: 12 }} />
            <YAxis stroke="#b3a98f" tick={{ fontSize: 12 }}
                   tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
            <Tooltip contentStyle={tooltipStyle}
                     formatter={(v) => [`${fmt(v)} MW`, "MAE"]} />
            <Bar dataKey="mae_mw" name="MAE" fill="#ff7a1a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h2>Daily accuracy through January</h2>
        <p className="sub">
          Mean absolute error of the first forecast for each delivery day. Best day:
          {" "}{prettyDate(acc.best_day.date)} ({fmt(acc.best_day.mae_mw)} MW). Worst day:
          {" "}{prettyDate(acc.worst_day.date)} ({fmt(acc.worst_day.mae_mw)} MW) — a
          reminder that a single stormy day can dominate the month’s risk.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="#3a3625" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#b3a98f" interval={4} tick={{ fontSize: 12 }} />
            <YAxis stroke="#b3a98f" tick={{ fontSize: 12 }}
                   tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
            <Tooltip contentStyle={tooltipStyle}
                     formatter={(v) => [`${fmt(v)} MW`, "Daily MAE"]}
                     labelFormatter={(l) => prettyDate(`2026-${l}`)} />
            <Line type="monotone" dataKey="mae_mw" name="Daily MAE" stroke="#ff7a1a"
                  strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
