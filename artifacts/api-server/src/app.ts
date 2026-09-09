import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { isStaticAssetPath } from "./lib/staticPaths";
import errorHandler from "./middlewares/errorHandler";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve uploaded brew session photos
const uploadsDir = path.resolve(process.cwd(), "data/uploads/sessions");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/api/uploads/sessions", express.static(uploadsDir));

// Anything under /api that no route matched. Without this, Express's built-in
// handler answers with an HTML 404 while every other API response is JSON, so a
// client parsing the body has to special-case exactly one status. Must stay
// below the uploads mount above, or it swallows session photos.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Serve built frontend static files when running in production on the host.
// WorkingDirectory in the systemd service is the repo root, so cwd() is correct.
const staticDir = path.resolve(process.cwd(), "artifacts/fermentos/dist/public");
if (fs.existsSync(staticDir)) {
  app.use(
    express.static(staticDir, {
      // Vite content-hashes everything under /assets, so a new build always
      // produces a new filename — those are safe to cache forever. index.html
      // is NOT hashed and is what points at the hashed bundles, so it must
      // revalidate every time: caching it would leave the in-app updater
      // reloading into the old shell (and thus the old bundles) with no way
      // to recover short of a manual hard-refresh.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          // Manifest, icons, og image — stable but unhashed, so a rename
          // needs to be picked up within a day rather than never.
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }),
  );
  // SPA fallback — serve index.html for any non-/api route. Same no-cache
  // reasoning as above: this path serves the shell for every deep link.
  app.get(/^(?!\/api).*$/, (req, res) => {
    // A file express.static could not find has to 404. Handing it the app
    // shell instead returns HTML with a 200, which the browser cannot parse
    // and which leaves no 404 in the network tab to diagnose from.
    if (isStaticAssetPath(req.path)) {
      // no-store, not no-cache: the next deploy may well add this file, and a
      // cached negative response would outlive the problem it describes.
      res.setHeader("Cache-Control", "no-store");
      res.status(404).type("txt").send("Not found");
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving frontend static files");
}

app.use(errorHandler);

export default app;
