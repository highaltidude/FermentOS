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
//
// With GEN=2 it is instead The Pill by Shelly, speaking the Gen2+ RPC API:
//
//   GEN=2 PILL_MODE=onewire node scripts/shelly-sim.ts   # DS18B20 probe, no relay
//   GEN=2 PILL_MODE=ssr SHELLY_PASS=secret node scripts/shelly-sim.ts
//
// It serves /shelly, /rpc/Shelly.GetStatus, /rpc/Switch.Set (on=, toggle_after=),
// /rpc/Switch.SetConfig and /rpc/Pill.GetConfig. SHELLY_PASS turns on SHA-256
// digest auth for user "admin", as on a real Gen2+ device.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const port = Number(process.env.PORT ?? 8081);
const user = process.env.SHELLY_USER ?? "";
const pass = process.env.SHELLY_PASS ?? "";
const gen = Number(process.env.GEN ?? 1);
const pillMode = process.env.PILL_MODE ?? "onewire";

// Gen2+ (The Pill): two SSR channels in "ssr" mode, a probe in "onewire" mode.
const realm = "shellypill-a0b1c2d3e4f5";
const nonces = new Set<string>();
const switches = [0, 1].map((id) => ({ id, output: false, timerEndsAt: null as number | null, initialState: "match_input" }));
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Check a digest Authorization header the way a Gen2+ device does. */
function digestOk(header: string | undefined, method: string, uri: string): boolean {
  if (!pass) return true;
  if (!header?.startsWith("Digest ")) return false;
  const p: Record<string, string> = {};
  for (const m of header.matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]+))/g)) p[m[1]!] = m[2] ?? m[3] ?? "";
  if (p.username !== "admin" || p.realm !== realm || !nonces.has(p.nonce!)) return false;
  const ha1 = sha256(`admin:${realm}:${pass}`);
  const ha2 = sha256(`${method}:${uri}`);
  return p.response === sha256(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:auth:${ha2}`);
}

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
  // A Gen1 timer (and Gen2+ toggle_after) flips the relay back to the opposite state when it runs out.
  if (state.timerEndsAt != null && Date.now() >= state.timerEndsAt) {
    state.ison = !state.ison;
    state.timerEndsAt = null;
    log(`timer expired -> relay ${state.ison ? "on" : "off"}`);
  }
  for (const sw of switches) {
    if (sw.timerEndsAt != null && Date.now() >= sw.timerEndsAt) {
      sw.output = !sw.output;
      sw.timerEndsAt = null;
      log(`toggle_after expired -> switch:${sw.id} ${sw.output ? "on" : "off"}`);
    }
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

  if (gen >= 2) {
    if (url.pathname === "/shelly") {
      return send(200, {
        name: null, id: realm, mac: "A0B1C2D3E4F5", slot: 0, model: "S3SN-0U53X", gen: 3,
        fw_id: "20250410-120000/1.6.0-sim", ver: "1.6.0", app: "Pill", auth_en: !!pass, auth_domain: pass ? realm : null,
      });
    }
    if (!digestOk(req.headers.authorization, req.method ?? "GET", req.url ?? "/")) {
      const nonce = randomBytes(8).toString("hex");
      nonces.add(nonce);
      res.writeHead(401, { "WWW-Authenticate": `Digest qop="auth", realm="${realm}", nonce="${nonce}", algorithm=SHA-256` });
      return res.end("401 Unauthorized");
    }
    const rpcError = (message: string) => send(500, { code: -105, message });
    const findSwitch = () => {
      const id = Number(url.searchParams.get("id") ?? 0);
      return pillMode === "ssr" ? switches.find((s) => s.id === id) : undefined;
    };

    switch (url.pathname) {
      case "/rpc/Shelly.GetStatus": {
        const body: Record<string, unknown> = {
          sys: { mac: "A0B1C2D3E4F5", restart_required: false, uptime: Math.round((Date.now() - state.startedAt) / 1000) },
          wifi: { sta_ip: "127.0.0.1", status: "got ip", ssid: "sim", rssi: -55 },
          pill: {},
        };
        if (pillMode === "ssr") {
          for (const sw of switches) body[`switch:${sw.id}`] = { id: sw.id, source: "HTTP_in", output: sw.output };
        } else if (pillMode === "onewire" && state.tempC != null) {
          body["temperature:100"] = { id: 100, tC: state.tempC, tF: state.tempC * 9 / 5 + 32 };
        }
        return send(200, body);
      }
      case "/rpc/Pill.GetConfig":
        return send(200, { mode: pillMode, pin0_mode: "none", pin1_mode: "none", pin2_mode: "none" });
      case "/rpc/Switch.Set": {
        const sw = findSwitch();
        if (!sw) return rpcError(`Argument 'id', value ${url.searchParams.get("id")} not found!`);
        const wasOn = sw.output;
        sw.output = url.searchParams.get("on") === "true";
        const after = Number(url.searchParams.get("toggle_after") ?? 0);
        sw.timerEndsAt = after > 0 ? Date.now() + after * 1000 : null;
        log(`switch:${sw.id} ${sw.output ? "on" : "off"}${after > 0 ? ` (toggle_after ${after}s)` : ""}`);
        return send(200, { was_on: wasOn });
      }
      case "/rpc/Switch.SetConfig": {
        const sw = findSwitch();
        if (!sw) return rpcError(`Argument 'id', value ${url.searchParams.get("id")} not found!`);
        const config = JSON.parse(url.searchParams.get("config") ?? "{}") as { initial_state?: string };
        if (config.initial_state) {
          sw.initialState = config.initial_state;
          log(`switch:${sw.id} initial_state=${sw.initialState}`);
        }
        return send(200, { restart_required: false });
      }
    }
    return send(404, { code: -114, message: `Method ${url.pathname} failed: No handler!` });
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
}).listen(port, () => {
  const what = gen >= 2 ? `The Pill (${pillMode} mode)` : "Shelly SHSW-1";
  log(`${what} simulator on :${port}${user || pass ? " (auth on)" : ""}`);
});
