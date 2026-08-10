/**
 * Test configuration.
 *
 * Tests run in the Node environment against the real modules, with the
 * development environment variables loaded from `.env`. No test doubles are
 * used for the cryptography: the point of these tests is that the actual
 * primitives behave correctly, so stubbing them would defeat the exercise.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(here, "client", "src"),
      "@shared": path.join(here, "shared"),
      "@server": path.join(here, "server"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: false,
    reporters: ["default"],
    // Database-backed suites must not race each other over shared rows.
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "var/coverage",
      include: ["server/**/*.ts", "shared/**/*.ts"],
      exclude: ["server/db/schema.ts", "**/*.d.ts"],
    },
  },
});
