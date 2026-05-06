import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

const gravityData = [
  { day: "Day 1",  gravity: 1.064, temp: 66 },
  { day: "Day 2",  gravity: 1.056, temp: 67 },
  { day: "Day 3",  gravity: 1.048, temp: 68 },
  { day: "Day 4",  gravity: 1.044, temp: 68 },
  { day: "Day 5",  gravity: 1.043, temp: 69 },
  { day: "Day 6",  gravity: 1.042, temp: 68 },
  { day: "Day 7",  gravity: 1.042, temp: 68 },
];

const bg      = "#f5f0e6";
const sidebar  = "#e8e0d0";
const accent   = "#7c4f1e";
const cardBg   = "#ffffff";
const border   = "#ddd6c8";
const textMain = "#2d2417";
const textMuted= "#7a6a55";
const green    = "#22c55e";
const amber    = "#f59e0b";

const navItems = [
  { label: "Dashboard", icon: "▦" },
  { label: "Recipes",   icon: "⊞" },
  { label: "Brew Log",  icon: "⊟", active: true },
  { label: "Ingredients", icon: "◈" },
  { label: "Equipment", icon: "⚙" },
  { label: "Settings",  icon: "⚙" },
];

export function BrewSession() {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: bg, color: textMain }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: sidebar, display: "flex", flexDirection: "column", padding: "20px 0", borderRight: `1px solid ${border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 20px 20px", borderBottom: `1px solid ${border}` }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "#c8a87a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🍺</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: textMain, marginTop: 8 }}>FermentOS</div>
        </div>
        <nav style={{ padding: "12px 12px" }}>
          {navItems.map(n => (
            <div key={n.label} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
              borderRadius: 8, marginBottom: 2, cursor: "pointer",
              background: n.active ? accent : "transparent",
              color: n.active ? "#fff" : textMuted, fontSize: 14, fontWeight: n.active ? 600 : 400
            }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
            </div>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ color: textMuted, fontSize: 20, cursor: "pointer" }}>←</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Pacific IPA</h1>
              <span style={{ background: "#d1fae5", color: "#065f46", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>fermenting</span>
            </div>
            <div style={{ color: textMuted, fontSize: 13, marginTop: 2 }}>Started Apr 19, 2026 · 5.5 gal · OG: 1.064</div>
          </div>
        </div>

        {/* iSpindel current readings banner */}
        <div style={{
          background: cardBg, border: `1px solid ${border}`, borderRadius: 12,
          padding: "16px 20px", marginBottom: 20,
          borderLeft: `4px solid ${accent}`
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📡</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>iSpindel — Fermenter 1</span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: green, display: "inline-block" }} />
              <span style={{ color: textMuted, fontSize: 12 }}>Reading 12 min ago</span>
            </div>
            <span style={{ fontSize: 12, color: textMuted }}>Every 30 min</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Current Gravity", value: "1.042", sub: "↓ from 1.064 OG", color: accent },
              { label: "Temperature",     value: "68°F",  sub: "within target range", color: "#2563eb" },
              { label: "Est. ABV",        value: "2.9%",  sub: "of 6.9% target", color: "#7c3aed" },
              { label: "Battery",         value: "4.1V",  sub: "good", color: green },
            ].map(s => (
              <div key={s.label} style={{ background: bg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Fermentation Progress</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={gravityData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={border} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: textMuted }} />
              <YAxis yAxisId="sg" domain={[1.030, 1.070]} tickFormatter={v => v.toFixed(3)} tick={{ fontSize: 11, fill: textMuted }} width={52} />
              <YAxis yAxisId="temp" orientation="right" domain={[60, 75]} tick={{ fontSize: 11, fill: textMuted }} width={36} />
              <Tooltip
                contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }}
                formatter={(val, name) => name === "gravity" ? [val, "Gravity (SG)"] : [`${val}°F`, "Temp"]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: textMuted }} />
              <Line yAxisId="sg"   type="monotone" dataKey="gravity" stroke={accent}   strokeWidth={2} dot={{ r: 4, fill: accent }}  name="gravity" />
              <Line yAxisId="temp" type="monotone" dataKey="temp"    stroke="#2563eb"  strokeWidth={2} dot={{ r: 3, fill: "#2563eb" }} name="temp" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Notes */}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Brew Notes</div>
            <button style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ Add Note</button>
          </div>
          {[
            { date: "Apr 22", text: "Krausen forming nicely, activity in airlock every 30s." },
            { date: "Apr 20", text: "Pitched US-05 at 66°F. OG confirmed 1.064." },
          ].map(n => (
            <div key={n.date} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
              <span style={{ fontSize: 12, color: textMuted, whiteSpace: "nowrap", paddingTop: 2 }}>{n.date}</span>
              <span style={{ fontSize: 13, color: textMain }}>{n.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
