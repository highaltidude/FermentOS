// Endpoints that must always be reachable even when API auth is enabled.
//
// Paths are relative to the `/api` mount: apiAuth runs inside the router that
// app.ts mounts at `/api`, so Express has already stripped that prefix from
// req.path by the time we see it.
//
// Matching is exact on method + path, with no prefix matching, so sibling
// routes stay protected (e.g. PUT /integrations/ispindel/settings, which
// reads and overwrites the ingest token).
//
// Note: /admin/auth/* is intentionally NOT in this list. It must still
// require either a valid Bearer token or a same-origin browser request,
// otherwise an external caller could mint themselves a token or disable
// the lock entirely.
const ALWAYS_ALLOWED: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/healthz" },
  // Recovery endpoints: must be reachable from a plain `curl` on the host
  // even when API lockdown is enabled, otherwise the user can't fix a
  // broken sudoers state without first finding/passing an API token. Both
  // are read-only and return public-config-grade text (the sudoers line
  // for this install's service user, or a self-contained installer script).
  { method: "GET", path: "/admin/repair-script" },
  { method: "GET", path: "/admin/sudoers-line" },
  // Home Assistant REST sensor endpoint: read-only, no secrets, must be
  // reachable from HA without a Bearer token so polling works even when
  // API auth is enabled.
  { method: "GET", path: "/ha/status" },
  // iSpindel ingest: the device posts directly from the brewer's local
  // network and cannot send a Bearer token. Optional token validation is
  // handled inside the route handler itself.
  { method: "POST", path: "/integrations/ispindel" },
  // HA-friendly iSpindel status endpoint: read-only, polled by HA.
  { method: "GET", path: "/integrations/ispindel/status" },
];

export function isAlwaysAllowed(method: string, path: string): boolean {
  // Express routes HEAD to GET handlers, so `curl -I` should behave the same.
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  // Express's non-strict routing sends `/ha/status/` to the same handler.
  const p = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return ALWAYS_ALLOWED.some((e) => e.method === m && e.path === p);
}
