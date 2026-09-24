import { describe, expect, it } from "vitest";
import { isAlwaysAllowed } from "./authExemptions";

describe("isAlwaysAllowed", () => {
  const allowed: Array<[string, string]> = [
    ["GET", "/healthz"],
    ["GET", "/admin/repair-script"],
    ["GET", "/admin/sudoers-line"],
    ["GET", "/ha/status"],
    ["POST", "/integrations/ispindel"],
    ["GET", "/integrations/ispindel/status"],
  ];

  it.each(allowed)("allows %s %s", (method, path) => {
    expect(isAlwaysAllowed(method, path)).toBe(true);
  });

  it.each(allowed)("allows %s %s with a trailing slash", (method, path) => {
    expect(isAlwaysAllowed(method, `${path}/`)).toBe(true);
  });

  it("treats HEAD like GET", () => {
    expect(isAlwaysAllowed("HEAD", "/ha/status")).toBe(true);
    expect(isAlwaysAllowed("HEAD", "/integrations/ispindel/status")).toBe(true);
  });

  it("is case-insensitive on method", () => {
    expect(isAlwaysAllowed("get", "/ha/status")).toBe(true);
  });

  const protectedRoutes: Array<[string, string]> = [
    ["GET", "/integrations/ispindel/settings"],
    ["PUT", "/integrations/ispindel/settings"],
    ["POST", "/integrations/ispindel/simulate"],
    ["GET", "/integrations/ispindel/devices/abc/readings"],
    ["GET", "/integrations/ispindel"],
    ["POST", "/integrations/ispindel/status"],
    ["POST", "/ha/status"],
    ["GET", "/ha/status/extra"],
    ["GET", "/admin/auth/status"],
    ["POST", "/admin/auth/tokens"],
    ["PUT", "/admin/auth/required"],
    ["POST", "/admin/update"],
    ["GET", "/admin/repair-script-extra"],
    ["GET", "/recipes"],
    // Mount-prefixed form: apiAuth never sees these, so they must not be what
    // the list relies on.
    ["GET", "/api/ha/status"],
  ];

  it.each(protectedRoutes)("does not exempt %s %s", (method, path) => {
    expect(isAlwaysAllowed(method, path)).toBe(false);
  });
});
