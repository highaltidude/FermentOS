import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, appConfigTable, apiTokensTable } from "@workspace/db";

const AUTH_REQUIRED_KEY = "api_auth_required";

// Paths that must always be reachable even when API auth is enabled.
// Note: /admin/auth/* is intentionally NOT in this list — it must still
// require either a valid Bearer token or a same-origin browser request,
// otherwise an external caller could mint themselves a token or disable
// the lock entirely.
const ALWAYS_ALLOWED_PREFIXES = [
  "/healthz",
  // Recovery endpoints — must be reachable from a plain `curl` on the host
  // even when API lockdown is enabled, otherwise the user can't fix a
  // broken sudoers state without first finding/passing an API token. Both
  // are read-only and return public-config-grade text (the sudoers line
  // for this install's service user, or a self-contained installer script).
  "/api/admin/repair-script",
  "/api/admin/sudoers-line",
  // Home Assistant REST sensor endpoint — read-only, no secrets, must be
  // reachable from HA without a Bearer token so polling works even when
  // API auth is enabled.
  "/api/ha/status",
  // iSpindel ingest — device posts directly from the brewer's local network;
  // it cannot send a Bearer token. Optional token validation is handled
  // inside the route handler itself.
  "/api/integrations/ispindel",
  // HA-friendly iSpindel status endpoint — read-only, polled by HA.
  "/api/integrations/ispindel/status",
];

let cachedRequired: boolean | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5_000;

export async function isAuthRequired(): Promise<boolean> {
  const now = Date.now();
  if (cachedRequired !== null && now < cacheExpiresAt) return cachedRequired;
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, AUTH_REQUIRED_KEY));
  cachedRequired = row?.value === "true";
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedRequired;
}

export function invalidateAuthCache(): void {
  cachedRequired = null;
  cacheExpiresAt = 0;
}

export async function setAuthRequired(value: boolean): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key: AUTH_REQUIRED_KEY, value: value ? "true" : "false" })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: value ? "true" : "false", updatedAt: new Date() },
    });
  invalidateAuthCache();
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateToken(): { token: string; prefix: string; hash: string } {
  // 32 random bytes -> ~43 char base64url string. Prefix "bm_" for readability.
  const raw = crypto.randomBytes(32).toString("base64url");
  const token = `bm_${raw}`;
  return { token, prefix: token.slice(0, 10), hash: hashToken(token) };
}

function isSameOriginRequest(req: Request): boolean {
  // Treat requests originating from the same browser origin as trusted (the
  // web UI is served from the same host as the API). External callers (curl,
  // scripts, mobile apps) won't send a matching Origin/Referer.
  const host = req.headers.host;
  if (!host) return false;

  const secFetchSite = req.headers["sec-fetch-site"];
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") return true;

  const checkUrl = (raw: string | undefined): boolean => {
    if (!raw) return false;
    try {
      const u = new URL(raw);
      return u.host === host;
    } catch {
      return false;
    }
  };

  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "null") return checkUrl(origin);
  return checkUrl(req.headers.referer);
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function apiAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Allow paths needed for the user to recover / view auth status.
  const url = req.url || "";
  if (ALWAYS_ALLOWED_PREFIXES.some((p) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"))) {
    return next();
  }

  let required: boolean;
  try {
    required = await isAuthRequired();
  } catch (err) {
    req.log?.error({ err }, "apiAuth: failed to read config; allowing request");
    return next();
  }

  if (!required) return next();

  const token = extractBearer(req);
  if (token) {
    try {
      const hash = hashToken(token);
      const [row] = await db
        .select()
        .from(apiTokensTable)
        .where(eq(apiTokensTable.tokenHash, hash));
      if (row) {
        // Best-effort update of lastUsedAt (don't await to keep the request fast).
        db.update(apiTokensTable)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiTokensTable.id, row.id))
          .catch(() => {});
        (req as any).tokenScope = row.scope;
        const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
        if (WRITE_METHODS.includes(req.method) && row.scope === "read") {
          res.status(403).json({ error: "Token scope insufficient — write access required" });
          return;
        }
        return next();
      }
    } catch (err) {
      req.log?.error({ err }, "apiAuth: token lookup failed");
      res.status(500).json({ error: "Auth check failed" });
      return;
    }
  }

  if (isSameOriginRequest(req)) return next();

  res.status(401).json({ error: "API token required" });
}
