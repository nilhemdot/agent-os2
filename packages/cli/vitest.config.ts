import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@tripwire/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) } },
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
