import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
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
  app.get(/^(?!\/api).*$/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving frontend static files");
}

app.use(errorHandler);

export default app;
