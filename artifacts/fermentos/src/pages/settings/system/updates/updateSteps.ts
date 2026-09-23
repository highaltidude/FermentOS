export type ReleaseNote = {
  tag: string;
  name: string | null;
  body: string | null;
  url: string;
  publishedAt: string | null;
  prerelease: boolean;
  isNewerThanCurrent: boolean;
};

export type HistoryEntry = {
  hash: string;
  message: string | null;
  commitDate: string | null;
  deployedAt: string;
  branch: string | null;
  isCurrent: boolean;
};

// Update lifecycle:
//   idle      — nothing happening
//   starting  — POST /api/admin/update is in flight (covers pre-update backup
//               which the server runs synchronously before spawning update.sh)
//   running   — update.sh is running on the server; we poll update.log
//   restarting— API server is unreachable (build finished, services restarting)
//   complete  — server reachable again with a new git hash; show Reload button
//   error     — POST returned non-2xx (e.g. backup failed) OR something unexpected
export type UpdatePhase = "idle" | "starting" | "running" | "restarting" | "verifying" | "complete" | "error";

// Steps emitted by update.sh as `[N/5] ...` markers in update.log.
export const UPDATE_STEPS = [
  "Pulling latest from GitHub",
  "Installing dependencies",
  "Running database migrations",
  "Building application",
  "Restarting services",
];

export function parseLastStep(log: string): { step: number; label: string } | null {
  // Find the last `[N/5] some text...` marker. We rely on update.sh's exact
  // formatting; if the format changes the bar just sits at its previous step.
  const matches = [...log.matchAll(/\[(\d+)\/5\]\s*([^\n]*)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  const step = Math.min(5, Math.max(1, parseInt(last[1]!, 10)));
  const raw = (last[2] ?? "").trim().replace(/\.{2,}$/, "");
  return { step, label: raw || (UPDATE_STEPS[step - 1] ?? `Step ${step}`) };
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
