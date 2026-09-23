// Base path the app is served under; every raw fetch in the Settings panels
// prefixes its URL with this.
export const BASE = import.meta.env.BASE_URL;

// Where devices that only speak plain HTTP (iSpindel, Home Assistant's REST
// sensor) should send requests. Over HTTP that is simply this page's host and
// port. Over HTTPS the optional Caddy front keeps /api/* on plain HTTP port 80.
export function plainHttpHost(): { host: string; port: string } {
  const { protocol, hostname, port } = window.location;
  return { host: hostname, port: protocol === "http:" && port ? port : "80" };
}

export function plainHttpOrigin(): string {
  const { host, port } = plainHttpHost();
  return `http://${host}${port === "80" ? "" : `:${port}`}`;
}

export type BackupBeforeUpdate = "none" | "sftp" | "local";

export type LockInfo = {
  kind: "update" | "rollback";
  startedAt: string;
  hash?: string;
  ageMs: number;
  stale: boolean;
};

export type VersionInfo = {
  hash: string;
  date: string | null;
  message: string | null;
  branch: string;
  /**
   * Installed release version, read from package.json server-side. Null only if
   * that read failed. This is the authoritative answer — it is not inferred from
   * the GitHub release list, which cannot identify the running build on Docker.
   */
  version?: string | null;
  updateAvailable: boolean;
  runningHash?: string;
  restartPending?: boolean;
  // ISO timestamp captured at api-server module load. Changes whenever the
  // process actually restarts — the most reliable "restart finished" signal
  // because it doesn't depend on git state lining up.
  startedAt?: string;
  // True when the api-server's `sudo -n --list` checks pass for both
  // `systemctl restart fermentos` and `reboot`. False means the in-app
  // Update / Restart / Reboot buttons will fail without the sudoers fix.
  // null means not applicable (Docker).
  sudoOk?: boolean | null;
  // True when the api-server detected it is running inside a Docker container.
  // System management buttons (Update, Rollback, Reboot) are hidden; Restart
  // works via process.exit + the container restart policy.
  isDocker?: boolean;
  // Set when an update or rollback is currently running. The UI uses this
  // to disable the start buttons across browser tabs and to surface a
  // "looks stuck — force clear?" affordance after LOCK_STALE_MS.
  lock?: LockInfo | null;
};

// Hard cap on how long either poller will wait for the service to come back
// before surfacing an actionable error. Real restarts complete in <15s on a
// Pi 4; if we're past 120s the systemctl restart almost certainly failed
// silently (missing sudoers entry, build failure, etc.).
export const RESTART_TIMEOUT_MS = 120_000;
