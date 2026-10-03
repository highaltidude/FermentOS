import { execFile, spawn } from "child_process";
import { createWriteStream, existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { IS_DOCKER } from "../lib/runtime.js";
import { logger } from "../lib/logger.js";
import {
  HTTPS_DROPIN_PATH,
  HTTPS_HELPER_PATH,
  buildEnableArgs,
  parseDropIn,
  parseHelperVersion,
  type HttpsEnableSettings,
} from "../lib/httpsConfig.js";
import { getLockState, lockBusyBody } from "./updateLock.js";

/**
 * Turning HTTPS on and off from Settings → System → Integrations → HTTPS.
 *
 * Native installs: the work is done by the root-owned helper at
 * HTTPS_HELPER_PATH (scripts/https-helper.sh, installed by install.sh or the
 * repair script), run through `sudo -n` with an argument array — never a
 * shell. It installs Caddy, so it can take minutes on a Pi; it runs as a
 * background job whose output goes to https.log, and the UI polls the status.
 *
 * Docker installs: the container can't change the host's compose setup, so
 * there is no job — the UI shows the .env lines instead, and the status here
 * just reports whether the Caddy service from docker-compose.https.yml answers.
 */

const run = promisify(execFile);
const REPO_ROOT = path.resolve(process.cwd());
const HTTPS_LOG = path.join(REPO_ROOT, "https.log");
const REPO_HELPER = path.join(REPO_ROOT, "scripts", "https-helper.sh");
// Caddy installs from apt; on a Pi Zero with a slow mirror that is minutes.
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

type JobState = "idle" | "running" | "succeeded" | "failed";
type Job = {
  state: JobState;
  action: "enable" | "disable" | null;
  startedAt: string | null;
  finishedAt: string | null;
};

let job: Job = { state: "idle", action: null, startedAt: null, finishedAt: null };

export function httpsJobRunning(): boolean {
  return job.state === "running";
}

/** 409 body when an HTTPS job is running, for the update/rollback routes. */
export function httpsJobBusyBody(): { error: string } | null {
  return httpsJobRunning()
    ? { error: "HTTPS is being turned on or off. Wait for that to finish before starting another." }
    : null;
}

/** Why a job can't start right now (400: never here, 409: not now), or null. */
export function jobBlocker(): { status: 400 | 409; error: string } | null {
  if (IS_DOCKER) return { status: 400, error: "On Docker, HTTPS is turned on through .env — see the steps in Settings." };
  if (httpsJobRunning()) return { status: 409, error: "HTTPS is already being turned on or off." };
  const lock = getLockState();
  if (lock && !lock.stale) return { status: 409, error: lockBusyBody(lock).error };
  return null;
}

function logTail(lines = 60): string | null {
  try {
    if (!existsSync(HTTPS_LOG)) return null;
    // The helper colours its output only on a terminal, but strip any escape
    // codes anyway so the log reads cleanly in the browser.
    const text = readFileSync(HTTPS_LOG, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
    return text.split("\n").slice(-lines).join("\n").trimEnd() || null;
  } catch {
    return null;
  }
}

export function startHttpsJob(action: "enable", settings: HttpsEnableSettings): void;
export function startHttpsJob(action: "disable"): void;
export function startHttpsJob(action: "enable" | "disable", settings?: HttpsEnableSettings): void {
  const args = action === "enable" ? buildEnableArgs(settings!) : ["disable"];
  const out = createWriteStream(HTTPS_LOG, { flags: "w" });
  out.write(`$ ${action === "enable" ? "Turning HTTPS on" : "Turning HTTPS off"} — ${new Date().toISOString()}\n`);
  job = { state: "running", action, startedAt: new Date().toISOString(), finishedAt: null };

  const child = spawn("sudo", ["-n", HTTPS_HELPER_PATH, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  const timer = setTimeout(() => child.kill("SIGTERM"), JOB_TIMEOUT_MS);

  const finish = (ok: boolean, note?: string) => {
    if (job.state !== "running") return;
    clearTimeout(timer);
    if (note) out.write(`\n${note}\n`);
    out.end();
    job = { ...job, state: ok ? "succeeded" : "failed", finishedAt: new Date().toISOString() };
    logger.info({ action, ok }, "HTTPS job finished");
  };
  child.on("error", (err) => finish(false, `Could not start the helper: ${err.message}`));
  child.on("close", (code, signal) =>
    finish(code === 0, code === 0 ? undefined : signal ? `Stopped (${signal}).` : `Exited with status ${code}.`),
  );
  logger.info({ action }, "HTTPS job started");
}

export async function helperState(): Promise<"ok" | "missing" | "outdated"> {
  if (!existsSync(HTTPS_HELPER_PATH)) return "missing";
  // sudo -n --list <cmd> succeeds only if sudoers allows it without a password.
  try {
    await run("sudo", ["-n", "--list", HTTPS_HELPER_PATH, "version"], { timeout: 3000 });
  } catch {
    return "missing";
  }
  let installed: number | null = null;
  try {
    // 0755, so the version can be read without sudo.
    installed = Number((await run(HTTPS_HELPER_PATH, ["version"], { timeout: 3000 })).stdout.trim());
  } catch {
    return "outdated";
  }
  let wanted: number | null = null;
  try {
    wanted = parseHelperVersion(readFileSync(REPO_HELPER, "utf8"));
  } catch {
    // No repo copy to compare against — trust what's installed.
  }
  return wanted != null && installed !== wanted ? "outdated" : "ok";
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function lanIpv4s(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

export async function getHttpsStatus() {
  const jobView = { ...job, logTail: job.state === "idle" ? null : logTail() };

  if (IS_DOCKER) {
    // The overlay names its service "caddy", which Docker's DNS resolves for us.
    const up = await reachable("http://caddy/root.crt");
    return {
      installType: "docker" as const,
      enabled: up,
      caddyRunning: up,
      rootCertReachable: up,
      ip: null,
      names: [] as string[],
      httpPort: 80,
      httpsPort: 443,
      detectedIps: [] as string[],
      defaultNames: [] as string[],
      helper: "notApplicable" as const,
      job: jobView,
    };
  }

  let dropIn: string | null = null;
  try {
    dropIn = readFileSync(HTTPS_DROPIN_PATH, "utf8");
  } catch {
    // No drop-in: HTTPS is off.
  }
  const conf = parseDropIn(dropIn);
  const httpPort = conf?.httpPort ?? 80;
  const httpsPort = conf?.httpsPort ?? 443;

  const [unitActive, rootCertReachable, helper] = await Promise.all([
    run("systemctl", ["is-active", "caddy"], { timeout: 3000 })
      .then((r) => r.stdout.trim() === "active")
      // Non-zero when the unit is inactive or missing — and also when an
      // unprivileged user can't reach systemd at all (no D-Bus on some
      // minimal images), which is why the served root counts too.
      .catch(() => false),
    conf ? reachable(`http://127.0.0.1:${httpPort}/root.crt`) : Promise.resolve(false),
    helperState(),
  ]);

  return {
    installType: "native" as const,
    enabled: conf != null,
    caddyRunning: unitActive || rootCertReachable,
    rootCertReachable,
    ip: conf?.ip ?? null,
    names: conf?.names ?? [],
    httpPort,
    httpsPort,
    detectedIps: lanIpv4s(),
    defaultNames: [`${os.hostname()}.local`],
    helper,
    job: jobView,
  };
}
