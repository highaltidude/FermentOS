import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Copy, Loader2, ShieldCheck, AlertCircle, Download } from "lucide-react";
import {
  useGetHttpsStatus,
  getGetHttpsStatusQueryKey,
  useEnableHttps,
  useDisableHttps,
  type HttpsStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCopyToClipboard } from "../useCopyToClipboard";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isIpv4 = (s: string) => IPV4.test(s) && s.split(".").every((o) => Number(o) <= 255);

/** "http://ip" / "https://ip:8443" — drops the port when it is the default. */
function origin(scheme: "http" | "https", host: string, port: number) {
  const dflt = scheme === "http" ? 80 : 443;
  return `${scheme}://${host}${port === dflt ? "" : `:${port}`}`;
}

function splitNames(s: string): string[] {
  return s.split(/[\s,]+/).map((n) => n.trim()).filter(Boolean);
}

function errorMessage(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string };
  return e?.data?.error ?? e?.message ?? "Something went wrong";
}

export function HttpsPanel() {
  const qc = useQueryClient();
  const status = useGetHttpsStatus({
    query: {
      queryKey: getGetHttpsStatusQueryKey(),
      // Fast while a job runs so the log scrolls; slow otherwise, so a Docker
      // user who has just run `docker compose up -d` sees it take effect.
      refetchInterval: (q) => (q.state.data?.job.state === "running" ? 1500 : 10000),
    },
  });

  if (status.isLoading) return <p className="text-xs text-muted-foreground">Checking HTTPS…</p>;
  if (status.error || !status.data) {
    return <p className="text-xs text-destructive">Couldn't read the HTTPS status: {errorMessage(status.error)}</p>;
  }

  const s = status.data;
  const refresh = () => qc.invalidateQueries({ queryKey: getGetHttpsStatusQueryKey() });

  return (
    <div className="space-y-4">
      <StatusLine s={s} />
      {s.installType === "native" ? <NativeSetup s={s} refresh={refresh} /> : <DockerSetup />}
      {(s.enabled || window.location.protocol === "https:") && <TrustDevice s={s} />}
    </div>
  );
}

function StatusLine({ s }: { s: HttpsStatus }) {
  const onHttps = window.location.protocol === "https:";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s.enabled && s.caddyRunning ? (
        <Badge variant="success">HTTPS on</Badge>
      ) : s.enabled ? (
        <Badge variant="warning">Configured, but Caddy isn't running</Badge>
      ) : (
        <Badge variant="muted">HTTPS off</Badge>
      )}
      {onHttps && (
        <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
          <ShieldCheck className="w-3.5 h-3.5" /> You're viewing this page over HTTPS
        </span>
      )}
    </div>
  );
}

// ── Native (install.sh) ─────────────────────────────────────────────────────

function NativeSetup({ s, refresh }: { s: HttpsStatus; refresh: () => void }) {
  const { copiedKey, copy } = useCopyToClipboard();
  const pageHost = window.location.hostname;
  const ipChoices = [...new Set([...(s.ip ? [s.ip] : []), ...s.detectedIps])];
  const [ip, setIp] = useState(s.ip ?? (s.detectedIps.includes(pageHost) ? pageHost : s.detectedIps[0] ?? ""));
  const [names, setNames] = useState((s.enabled ? s.names : s.defaultNames).join(" "));
  const [httpPort, setHttpPort] = useState(String(s.httpPort));
  const [httpsPort, setHttpsPort] = useState(String(s.httpsPort));
  const [advanced, setAdvanced] = useState(s.httpPort !== 80 || s.httpsPort !== 443);
  const [error, setError] = useState<string | null>(null);

  const onStarted = { onSuccess: () => { setError(null); refresh(); }, onError: (e: unknown) => setError(errorMessage(e)) };
  const enable = useEnableHttps({ mutation: onStarted });
  const disable = useDisableHttps({ mutation: onStarted });

  const running = s.job.state === "running";
  const busy = running || enable.isPending || disable.isPending;

  if (s.helper !== "ok") {
    const cmd = `curl -sSL ${window.location.origin}/api/admin/repair-script | sudo bash`;
    return (
      <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-sm font-medium text-foreground">
          {s.helper === "outdated" ? "One-time update needed" : "One-time setup needed"}
        </p>
        <p className="text-xs text-muted-foreground">
          Turning HTTPS on installs Caddy, which needs root. FermentOS can only do that through a small helper that
          has to be installed by root once — an update can't give itself that permission. Run this on the FermentOS
          machine, then check again:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 font-mono text-xs">{cmd}</code>
          <Button size="sm" variant="outline" onClick={() => copy("repair", cmd)} aria-label="Copy command">
            {copiedKey === "repair" ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={refresh}>Check again</Button>
      </div>
    );
  }

  const submit = () => {
    const nameList = splitNames(names);
    if (!isIpv4(ip)) return setError("Choose this machine's IPv4 address.");
    const hp = Number(httpPort), sp = Number(httpsPort);
    if (advanced && (!Number.isInteger(hp) || !Number.isInteger(sp) || hp < 1 || sp < 1 || hp > 65535 || sp > 65535)) {
      return setError("Ports must be numbers from 1 to 65535.");
    }
    enable.mutate({ data: { ip, names: nameList, ...(advanced ? { httpPort: hp, httpsPort: sp } : {}) } });
  };

  const turnOff = () => {
    if (!confirm("Turn HTTPS off?\n\nCaddy is stopped and FermentOS goes back to plain HTTP on its own port. The certificate authority is kept, so turning it on again later works without re-trusting devices.")) return;
    disable.mutate();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">This machine's address</label>
          {ipChoices.length > 0 ? (
            <Select value={ip} onValueChange={setIp} disabled={busy}>
              <SelectTrigger><SelectValue placeholder="Choose an address" /></SelectTrigger>
              <SelectContent>
                {ipChoices.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50" disabled={busy} />
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Extra names (optional)</label>
          <Input value={names} onChange={(e) => setNames(e.target.value)} placeholder="fermentos.local" disabled={busy} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The certificate is issued for this address, so reserve it for this machine in your router's DHCP settings.
        If it ever changes, choose the new one here and re-apply — devices keep trusting the same root.
      </p>

      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAdvanced((a) => !a)}>
        {advanced ? "Hide ports" : "Use other ports than 80 and 443"}
      </button>
      {advanced && (
        <div className="grid max-w-xs grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">HTTP port</label>
            <Input value={httpPort} onChange={(e) => setHttpPort(e.target.value)} inputMode="numeric" disabled={busy} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">HTTPS port</label>
            <Input value={httpsPort} onChange={(e) => setHttpsPort(e.target.value)} inputMode="numeric" disabled={busy} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy && s.job.action !== "disable" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
          {s.enabled ? "Re-apply" : "Turn on HTTPS"}
        </Button>
        {s.enabled && (
          <Button size="sm" variant="outline" onClick={turnOff} disabled={busy}>
            {busy && s.job.action === "disable" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Turn off
          </Button>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1 text-xs text-destructive"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}</p>
      )}
      <JobLog s={s} />
      {s.enabled && s.ip && !running && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Open FermentOS at:</p>
          {[s.ip, ...s.names].map((h) => (
            <p key={h}><a className="font-mono text-primary underline" href={origin("https", h, s.httpsPort)}>{origin("https", h, s.httpsPort)}</a></p>
          ))}
          <p className="pt-1">iSpindel and Home Assistant keep using <span className="font-mono">{origin("http", s.ip, s.httpPort)}/api/…</span>.</p>
        </div>
      )}
    </div>
  );
}

function JobLog({ s }: { s: HttpsStatus }) {
  const { state, action, logTail } = s.job;
  if (state === "idle") return null;
  const label =
    state === "running" ? (action === "disable" ? "Turning HTTPS off…" : "Turning HTTPS on… installing Caddy can take a few minutes on a Pi.")
      : state === "succeeded" ? (action === "disable" ? "HTTPS is off." : "HTTPS is on.")
        : "That didn't work — the log below says why.";
  return (
    <div className="space-y-1">
      <p className={`text-xs ${state === "failed" ? "text-destructive" : state === "succeeded" ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
        {label}
      </p>
      {logTail && (
        <pre className="max-h-56 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">{logTail}</pre>
      )}
    </div>
  );
}

// ── Docker ──────────────────────────────────────────────────────────────────

function DockerSetup() {
  const { copiedKey, copy } = useCopyToClipboard();
  const pageHost = window.location.hostname;
  const [ip, setIp] = useState(isIpv4(pageHost) ? pageHost : "");
  const [names, setNames] = useState("");

  const lines = [
    "COMPOSE_PATH_SEPARATOR=:",
    "COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml",
    `FERMENTOS_IP=${ip || "<this machine's LAN IP>"}`,
    ...(splitNames(names).length ? [`FERMENTOS_NAMES=${splitNames(names).join(" ")}`] : []),
  ].join("\n");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        FermentOS runs in a container here, so it can't add the HTTPS service itself. Two steps on the host:
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">The host's LAN IP</label>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Extra names (optional)</label>
          <Input value={names} onChange={(e) => setNames(e.target.value)} placeholder="fermentos.local" />
        </div>
      </div>
      <div>
        <p className="text-xs text-foreground mb-1">1. Add these lines to <span className="font-mono">.env</span> in the FermentOS folder:</p>
        <div className="relative">
          <pre className="rounded bg-muted p-2 pr-10 font-mono text-xs whitespace-pre-wrap">{lines}</pre>
          <Button size="sm" variant="ghost" className="absolute right-1 top-1" onClick={() => copy("env", lines)} aria-label="Copy .env lines" disabled={!isIpv4(ip)}>
            {copiedKey === "env" ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      <div>
        <p className="text-xs text-foreground mb-1">2. Then run:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-2 py-1.5 font-mono text-xs">docker compose up -d</code>
          <Button size="sm" variant="outline" onClick={() => copy("up", "docker compose up -d")} aria-label="Copy command">
            {copiedKey === "up" ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        This panel notices when it's running. Reserve the IP for this machine in your router's DHCP settings; if it
        changes, update <span className="font-mono">FERMENTOS_IP</span> and run the command again.
      </p>
    </div>
  );
}

// ── Trusting the root on each device ────────────────────────────────────────

const DEVICE_STEPS: { device: string; steps: string }[] = [
  {
    device: "iPhone / iPad",
    steps: "Open the download and allow the profile. Install it under Settings → General → VPN & Device Management, then turn it on under Settings → General → About → Certificate Trust Settings — skipping that last switch is the usual reason it doesn't work.",
  },
  {
    device: "Android",
    steps: "Settings → Security → More security settings → Encryption & credentials → Install a certificate → CA certificate, and pick the downloaded file. Menu names vary by phone maker; search Settings for \"CA certificate\".",
  },
  { device: "Windows", steps: "Double-click the file → Install Certificate → Local Machine → Trusted Root Certification Authorities." },
  { device: "Mac", steps: "Double-click to add it to Keychain Access, open it, and set When using this certificate to Always Trust." },
  { device: "Firefox (desktop)", steps: "Firefox keeps its own list: Settings → Privacy & Security → View Certificates → Authorities → Import." },
];

function TrustDevice({ s }: { s: HttpsStatus }) {
  const host = s.ip ?? window.location.hostname;
  const certUrl = `${origin("http", host, s.httpPort)}/root.crt`;
  const [openDevice, setOpenDevice] = useState<string | null>(null);

  return (
    <div className="space-y-2 border-t border-card-border pt-3">
      <p className="text-sm font-medium text-foreground">Trust it on each phone and computer</p>
      <p className="text-xs text-muted-foreground">
        Do this once per device. Download the root certificate, then follow the steps for that device.
      </p>
      <Button size="sm" variant="outline" asChild>
        <a href={certUrl} download="fermentos-root.crt"><Download className="w-3.5 h-3.5 mr-1" />Download root certificate</a>
      </Button>
      {s.installType === "native" && s.enabled && !s.rootCertReachable && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Caddy isn't serving the certificate right now — check that it's running.</p>
      )}
      <div className="divide-y divide-card-border rounded-md border border-card-border">
        {DEVICE_STEPS.map(({ device, steps }) => (
          <div key={device}>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-xs font-medium text-foreground"
              onClick={() => setOpenDevice((d) => (d === device ? null : device))}
            >
              {device}
            </button>
            {openDevice === device && <p className="px-3 pb-2 text-xs text-muted-foreground">{steps}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Keep the certificate authority private: anyone with its key could impersonate websites to the devices that
        trust it. Only the root certificate above is meant to be shared.
      </p>
    </div>
  );
}
