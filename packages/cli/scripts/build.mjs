// Bundles the CLI into ONE self-contained file: dist/tripwire.mjs (no node_modules needed at runtime).
import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist/tripwire.mjs");
await build({
  entryPoints: [join(root, "src/bin.ts")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  legalComments: "none",
  logLevel: "info",
  mainFields: ["module", "main"], // jsonc-parser: the UMD entry has dynamic requires esbuild cannot bundle
  alias: { "@tripwire/core": join(root, "../core/src/index.ts") },
  banner: {
    // CJS-only dependencies bundled into ESM sometimes call require()
    js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module";\nconst require = __cr(import.meta.url);',
  },
});
try { chmodSync(out, 0o755); } catch { /* not on Windows */ }
