/**
 * Whether a request path is asking for a file rather than an app route.
 *
 * The SPA fallback hands index.html to anything that is not /api, so a request
 * for a bundle that does not exist used to come back as HTML with a 200. The
 * browser then fails to parse it and white-screens, with no 404 anywhere to
 * point at — exactly the failure you would hit if a stale index.html ever
 * referenced a bundle a newer deploy had removed.
 *
 * "Looks like a file" is two cases:
 *   - under /assets/, which is Vite's content-hashed output and only ever files
 *   - a last path segment containing a dot, i.e. it has an extension
 *
 * The dot rule is safe because no route in the frontend router
 * (artifacts/fermentos/src/App.tsx) contains one — they are /, /recipes,
 * /recipes/new, /recipes/:id, /brew-sessions/:id, /ingredients, /equipment,
 * /calculators and /settings, and every :id is numeric. A future route with a
 * dot in it would be swallowed as a missing asset, so add it here if that ever
 * changes.
 */
export function isStaticAssetPath(pathname: string): boolean {
  if (pathname.startsWith("/assets/")) return true;
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}
