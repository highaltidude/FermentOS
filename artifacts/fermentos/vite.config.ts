import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

const basePath = process.env.BASE_PATH ?? "/";

// The frontend calls relative /api URLs. In production the API serves the
// frontend from the same origin; in dev, Vite forwards them to the API server.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8080";

// File events don't cross some bind mounts (Docker Desktop on Windows), so the
// dev compose stack sets WATCH_POLLING to make hot reload see edits.
const watchPolling = process.env.WATCH_POLLING === "1";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": apiProxyTarget,
    },
    watch: watchPolling ? { usePolling: true, interval: 300 } : undefined,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
