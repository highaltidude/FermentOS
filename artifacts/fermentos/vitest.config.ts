import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so unit tests of plain modules in src/lib don't
// load the app's build plugins or need its environment.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});
