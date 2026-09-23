import path from "path";

// cwd is the repo root under systemd and /app in the container, so one
// expression resolves correctly in both.

/** Where brew session photos are stored and served from. */
export const SESSION_UPLOADS_DIR = path.resolve(process.cwd(), "data/uploads/sessions");
