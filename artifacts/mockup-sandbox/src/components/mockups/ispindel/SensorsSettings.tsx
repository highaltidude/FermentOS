const bg       = "#f5f0e6";
const sidebar  = "#e8e0d0";
const accent   = "#7c4f1e";
const cardBg   = "#ffffff";
const border   = "#ddd6c8";
const textMain = "#2d2417";
const textMuted= "#7a6a55";
const green    = "#22c55e";

const navItems = [
  { label: "Dashboard",   icon: "▦" },
  { label: "Recipes",     icon: "⊞" },
  { label: "Brew Log",    icon: "⊟" },
  { label: "Ingredients", icon: "◈" },
  { label: "Equipment",   icon: "⚙" },
  { label: "Settings",    icon: "⚙", active: true },
];

const tabs = ["Brewing", "System", "Sensors"];

export function SensorsSettings() {
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

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 18 }}>⚙</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Settings</h1>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${border}`, paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t} style={{
              padding: "8px 18px", border: "none", borderBottom: t === "Sensors" ? `2px solid ${accent}` : "2px solid transparent",
              background: "transparent", color: t === "Sensors" ? accent : textMuted,
              fontWeight: t === "Sensors" ? 600 : 400, fontSize: 14, cursor: "pointer",
              marginBottom: -1
            }}>{t}</button>
          ))}
        </div>

        {/* iSpindel URL card */}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>📡</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>iSpindel</span>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: textMuted }}>
            Enter this URL in your iSpindel web interface under <strong>Service Type → HTTP</strong>.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: 8,
              padding: "9px 14px", fontSize: 13, fontFamily: "monospace", color: textMain,
              letterSpacing: 0.3
            }}>
              http://fermentos.local/api/sensors/ispindel
            </div>
            <button style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
              Copy
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: green, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: textMuted }}>Bridge active · last heartbeat 2 min ago</span>
          </div>
        </div>

        {/* Registered devices */}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Registered Devices</div>

          {/* Device row */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Fermenter 1</span>
                  <span style={{ background: "#d1fae5", color: "#065f46", fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>online</span>
                </div>
                <div style={{ fontSize: 12, color: textMuted, marginTop: 3 }}>Token: iSpindel000F4E · Last reading 12 min ago</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: textMain }}>Edit</button>
                <button style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#dc2626" }}>Remove</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
              {[
                { label: "Gravity", value: "1.042" },
                { label: "Temperature", value: "68°F" },
                { label: "Battery", value: "4.1V" },
                { label: "Linked session", value: "Pacific IPA" },
              ].map(s => (
                <div key={s.label} style={{ background: bg, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, color: textMuted }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: textMain }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Unlinked device */}
          <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "14px 18px", opacity: 0.7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Unnamed device</span>
                  <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>no session</span>
                </div>
                <div style={{ fontSize: 12, color: textMuted, marginTop: 3 }}>Token: iSpindel002A1B · Last reading 3 days ago</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>Link session</button>
                <button style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#dc2626" }}>Remove</button>
              </div>
            </div>
          </div>
        </div>

        {/* Register new device */}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: "18px 22px" }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Register New Device</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: textMuted, display: "block", marginBottom: 5 }}>Device token</label>
              <input
                readOnly value="iSpindel000F4E"
                style={{ width: "100%", boxSizing: "border-box", background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: textMain, fontFamily: "monospace", outline: "none" }}
              />
              <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>Found in your iSpindel web UI under Device Info.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: textMuted, display: "block", marginBottom: 5 }}>Display name</label>
              <input
                readOnly value="Fermenter 2"
                style={{ width: "100%", boxSizing: "border-box", background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: textMain, outline: "none" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: textMuted, display: "block", marginBottom: 8 }}>Calibration mode</label>
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { label: "Device-side (device sends pre-calculated gravity)", checked: true },
                { label: "Server-side (enter polynomial coefficients)", checked: false },
              ].map(r => (
                <label key={r.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", border: `2px solid ${r.checked ? accent : border}`,
                    background: r.checked ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {r.checked && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <button style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Register Device
          </button>
        </div>
      </div>
    </div>
  );
}
