/**
 * Validation and parsing for turning HTTPS on from Settings.
 *
 * The values validated here end up as arguments to a helper that runs as root
 * (scripts/https-helper.sh, installed as HTTPS_HELPER_PATH). The helper checks
 * them again with the same rules — that copy is the real boundary, since sudo
 * lets the service user pass it anything — but rejecting bad input here gives
 * the UI a clear 400 instead of a failed job.
 *
 * Import-free on purpose, like alertPolicy.ts, so it stays testable without
 * DATABASE_URL.
 */

export const HTTPS_HELPER_PATH = "/usr/local/libexec/fermentos/https";
export const HTTPS_DROPIN_PATH = "/etc/systemd/system/caddy.service.d/fermentos.conf";
export const MAX_HTTPS_NAMES = 5;

export function isValidIpv4(s: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  return m.slice(1).every((o) => (o.length === 1 || o[0] !== "0") && Number(o) <= 255);
}

const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const HOSTNAME_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);

export function isValidHostName(s: string): boolean {
  return s.length <= 253 && HOSTNAME_RE.test(s);
}

export function isValidPort(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 65535;
}

export type HttpsEnableSettings = { ip: string; names: string[]; httpPort: number; httpsPort: number };

export function validateEnableInput(input: {
  ip: string;
  names?: string[];
  httpPort?: number;
  httpsPort?: number;
}): { ok: true; value: HttpsEnableSettings } | { ok: false; error: string } {
  const ip = input.ip.trim();
  if (!isValidIpv4(ip)) return { ok: false, error: `Not an IPv4 address: ${ip}` };

  const names = [...new Set((input.names ?? []).map((n) => n.trim()).filter(Boolean))];
  if (names.length > MAX_HTTPS_NAMES) return { ok: false, error: `At most ${MAX_HTTPS_NAMES} names` };
  const badName = names.find((n) => !isValidHostName(n));
  if (badName !== undefined) return { ok: false, error: `Not a valid host name: ${badName}` };

  const httpPort = input.httpPort ?? 80;
  const httpsPort = input.httpsPort ?? 443;
  if (!isValidPort(httpPort)) return { ok: false, error: `Not a valid port: ${httpPort}` };
  if (!isValidPort(httpsPort)) return { ok: false, error: `Not a valid port: ${httpsPort}` };
  if (httpPort === httpsPort) return { ok: false, error: "The HTTP and HTTPS ports must differ" };

  return { ok: true, value: { ip, names, httpPort, httpsPort } };
}

/** Arguments for the helper's enable command, from already-validated settings. */
export function buildEnableArgs(s: HttpsEnableSettings): string[] {
  const args = ["enable", "--ip", s.ip];
  for (const n of s.names) args.push("--name", n);
  args.push("--http-port", String(s.httpPort), "--https-port", String(s.httpsPort));
  return args;
}

export type HttpsDropIn = { ip: string | null; names: string[]; httpPort: number; httpsPort: number };

/**
 * Read the settings back out of the systemd drop-in the helper writes
 * (`Environment="KEY=value"` lines). Null when there is no drop-in, which is
 * what "HTTPS is off" looks like on a native install.
 */
export function parseDropIn(text: string | null): HttpsDropIn | null {
  if (text == null) return null;
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*Environment="([A-Z_]+)=(.*)"\s*$/.exec(line);
    if (m) env[m[1]!] = m[2]!;
  }
  const port = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return isValidPort(n) ? n : fallback;
  };
  return {
    ip: env.FERMENTOS_IP && isValidIpv4(env.FERMENTOS_IP) ? env.FERMENTOS_IP : null,
    names: (env.FERMENTOS_NAMES ?? "").split(/\s+/).filter(isValidHostName),
    httpPort: port(env.HTTP_PORT, 80),
    httpsPort: port(env.HTTPS_PORT, 443),
  };
}

/** HELPER_VERSION=N from the helper script's text, or null if absent. */
export function parseHelperVersion(scriptText: string | null): number | null {
  const m = scriptText ? /^HELPER_VERSION=(\d+)\s*$/m.exec(scriptText) : null;
  return m ? Number(m[1]) : null;
}
