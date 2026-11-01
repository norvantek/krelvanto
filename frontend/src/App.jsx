import { useState } from "react";
import Dashboard from "./screens/Dashboard";
import Accuracy from "./screens/Accuracy";
import Journey from "./screens/Journey";

const TABS = [
  { id: "dashboard", label: "Decision Dashboard" },
  { id: "accuracy", label: "Forecast Accuracy" },
  { id: "journey", label: "Forecast Journey" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  return (
    <div className="app">
      <header className="hero">
        <h1>Wind<span className="accent">Desk</span></h1>
        <p>
          A decision-support view for a GB day-ahead power purchasing desk: the first
          wind generation forecast received for every hour of January 2026, checked
          against the wind that actually arrived. All data from Elexon (GB Balancing
          Mechanism Reporting Service); all times UTC.
        </p>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <Dashboard />}
      {tab === "accuracy" && <Accuracy />}
      {tab === "journey" && <Journey />}

      <footer>
        Data: Elexon BMRS — actual generation outturn by type (AGPT, Wind Offshore +
        Wind Onshore) and the Elexon wind forecast services (earliest and latest
        published forecast per settlement period, derived from WINDFOR). Scope:
        January 2026. Methodology and limitations are documented in the project README.
      </footer>
    </div>
  );
}
