// Fake Shelly 1 (SHSW-1, Gen1 API) for testing relay control without hardware.
//
//   node scripts/shelly-sim.ts                 # listens on :8081
//   PORT=8082 SHELLY_USER=admin SHELLY_PASS=secret node scripts/shelly-sim.ts
//
// Implements the endpoints FermentOS uses: /shelly, /status, /relay/0 (with
// turn= and timer=) and /settings/relay/0 (default_state=). Drive the add-on
// probe from outside with:
//
//   curl 'localhost:8081/sim?temp=21.5'       # set the probe temperature (°C)
//   curl 'localhost:8081/sim?probe=off'       # unplug the probe
//   curl 'localhost:8081/sim'                 # show simulator state
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8081);
const user = process.env.SHELLY_USER ?? "";
const pass = process.env.SHELLY_PASS ?? "";

const state = {
  ison: false,
  timerEndsAt: null as number | null,
  tempC: 20 as number | null,
  defaultState: "last",
  startedAt: Date.now(),
};

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function settleTimer(): void {
  // A Gen1 timer flips the relay back to the opposite state when it runs out.
  if (state.timerEndsAt != null && Date.now() >= state.timerEndsAt) {
    state.ison = !state.ison;
    state.timerEndsAt = null;
    log(`timer expired -> relay ${state.ison ? "on" : "off"}`);
  }
}
setInterval(settleTimer, 250);

function relayBody() {
  const remaining = state.timerEndsAt != null ? Math.max(0, Math.round((state.timerEndsAt - Date.now()) / 1000)) : 0;
  return { ison: state.ison, has_timer: state.timerEndsAt != null, timer_remaining: remaining, source: "http" };
}

function authorised(header: string | undefined): boolean {
  if (!user && !pass) return true;
  return header === `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  settleTimer();

  if (url.pathname === "/sim") {
    const temp = url.searchParams.get("temp");
    if (temp != null) state.tempC = Number(temp);
    if (url.searchParams.get("probe") === "off") state.tempC = null;
    return send(200, state);
  }

  // /shelly is readable without credentials on real devices, so it is here too.
  if (url.pathname === "/shelly") {
    return send(200, { type: "SHSW-1", mac: "A4CF12F45A1B", auth: !!(user || pass), fw: "20230913-112003/v1.14.0-sim" });
  }

  if (!authorised(req.headers.authorization)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="shelly1-sim"' });
    return res.end("401 Unauthorized");
  }

  if (url.pathname === "/status") {
    return send(200, {
      wifi_sta: { connected: true, ssid: "sim", ip: "127.0.0.1", rssi: -58 },
      relays: [relayBody()],
      ext_sensors: { temperature_unit: "C" },
      ext_temperature: state.tempC == null ? {} : { "0": { hwID: "28ff000000000000", tC: state.tempC, tF: state.tempC * 9 / 5 + 32 } },
      uptime: Math.round((Date.now() - state.startedAt) / 1000),
    });
  }

  if (url.pathname === "/relay/0") {
    const turn = url.searchParams.get("turn");
    if (turn === "on" || turn === "off" || turn === "toggle") {
      state.ison = turn === "toggle" ? !state.ison : turn === "on";
      const timer = Number(url.searchParams.get("timer") ?? 0);
      state.timerEndsAt = timer > 0 ? Date.now() + timer * 1000 : null;
      log(`relay ${state.ison ? "on" : "off"}${timer > 0 ? ` (timer ${timer}s)` : ""}`);
    }
    return send(200, relayBody());
  }

  if (url.pathname === "/settings/relay/0") {
    const def = url.searchParams.get("default_state");
    if (def) {
      state.defaultState = def;
      log(`default_state=${def}`);
    }
    return send(200, { name: null, default_state: state.defaultState, auto_on: 0, auto_off: 0 });
  }

  return send(404, { error: "not found" });
}).listen(port, () => log(`Shelly SHSW-1 simulator on :${port}${user || pass ? " (auth on)" : ""}`));
