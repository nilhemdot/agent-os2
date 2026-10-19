import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/ui/**"],
    testTimeout: 40000,
    hookTimeout: 40000,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["packages/**/*.ts", "apps/**/*.ts"],
      exclude: ["**/*.test.ts", "**/migrations/**"],
    },
  },
});
