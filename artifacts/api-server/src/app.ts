import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import errorHandler from "./middleware/errorHandler";

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
  app.use(express.static(staticDir));
  // SPA fallback — serve index.html for any non-/api route
  app.get(/^(?!\/api).*$/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving frontend static files");
}

app.use(errorHandler);

export default app;
