const base = import.meta.env.VITE_API_BASE || "";

async function get(path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  days: () => get("/api/days"),
  day: (date) => get(`/api/day?date=${date}`),
  accuracy: () => get("/api/accuracy"),
  journey: (date, period) => get(`/api/journey?date=${date}&period=${period}`),
};

export const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-GB"));
export const fmtSigned = (n) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("en-GB")}`;
export const prettyDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
export const prettyDateTime = (iso) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
