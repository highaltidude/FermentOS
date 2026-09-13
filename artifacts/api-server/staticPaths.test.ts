import { describe, it, expect } from "vitest";
import { isStaticAssetPath } from "./src/lib/staticPaths.js";

/**
 * Guards the SPA fallback in app.ts. Getting this wrong is quiet in both
 * directions: too greedy and a real deep link 404s, too lax and a missing
 * bundle goes back to the browser as HTML with a 200.
 */
describe("isStaticAssetPath", () => {
  it("treats everything under /assets/ as a file", () => {
    // Vite's content-hashed output — only ever files, never routes.
    expect(isStaticAssetPath("/assets/index-D16bdKMK.js")).toBe(true);
    expect(isStaticAssetPath("/assets/index-jzGbmttV.css")).toBe(true);
    expect(isStaticAssetPath("/assets/total-nonsense.js")).toBe(true);
    // No filename, but still not an app route.
    expect(isStaticAssetPath("/assets/")).toBe(true);
  });

  it("treats a path with an extension as a file", () => {
    expect(isStaticAssetPath("/nope.png")).toBe(true);
    expect(isStaticAssetPath("/favicon.ico")).toBe(true);
    expect(isStaticAssetPath("/manifest.webmanifest")).toBe(true);
    expect(isStaticAssetPath("/icons/icon-192.png")).toBe(true);
  });

  it("treats extensionless paths as app routes", () => {
    // Every route in artifacts/fermentos/src/App.tsx.
    expect(isStaticAssetPath("/")).toBe(false);
    expect(isStaticAssetPath("/recipes")).toBe(false);
    expect(isStaticAssetPath("/recipes/new")).toBe(false);
    expect(isStaticAssetPath("/recipes/12")).toBe(false);
    expect(isStaticAssetPath("/brew-sessions/new")).toBe(false);
    expect(isStaticAssetPath("/brew-sessions/12")).toBe(false);
    expect(isStaticAssetPath("/ingredients")).toBe(false);
    expect(isStaticAssetPath("/equipment")).toBe(false);
    expect(isStaticAssetPath("/calculators")).toBe(false);
    expect(isStaticAssetPath("/settings")).toBe(false);
  });

  it("treats a trailing slash as an app route, not a file", () => {
    // The last segment is empty, so there is no extension to find.
    expect(isStaticAssetPath("/recipes/")).toBe(false);
    expect(isStaticAssetPath("/settings/")).toBe(false);
  });

  it("only considers the last segment", () => {
    // A dot earlier in the path must not make the whole thing a file.
    expect(isStaticAssetPath("/some.dir/recipes")).toBe(false);
  });
});
