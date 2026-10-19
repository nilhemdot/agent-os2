#!/usr/bin/env node
// Generates a failing adapter package. Contract tests must fail until the adapter is implemented.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  process.stderr.write("usage: node scripts/adapter-scaffold.mjs <runtime-name>\n");
  process.exit(3);
}
const dir = process.argv[3] || join("packages", `adapter-${name}`);
mkdirSync(join(dir, "src"), { recursive: true });
writeFileSync(
  join(dir, "package.json"),
  JSON.stringify(
    {
      name: `@agentos/adapter-${name}`,
      version: "0.1.0",
      private: true,
      type: "module",
      license: "Apache-2.0",
      exports: { ".": "./src/index.ts" },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(dir, "src", "index.ts"),
  `import { notSupported } from "@agentos/adapter-api";

const pending = (operation: string) => {
  const error = notSupported(operation);
  throw new Error(\`not implemented: \${error.message}\`);
};

export function capabilities() {
  pending("capabilities");
}
export function checkInstalled() {
  pending("checkInstalled");
}
export function startAttempt() {
  pending("startAttempt");
}
export function streamEvents() {
  pending("streamEvents");
}
export function cancel() {
  pending("cancel");
}
export function collectEvidence() {
  pending("collectEvidence");
}
export function reattach() {
  pending("reattach");
}
`,
);
writeFileSync(
  join(dir, "src", "contract.test.ts"),
  `import { describe, expect, it } from "vitest";
import * as adapter from "./index.ts";

describe("adapter-${name} contract", () => {
  it("capabilities are implemented", () => {
    const caps = adapter.capabilities() as { start: boolean };
    if (!caps || caps.start !== true) throw new Error("not implemented");
  });
  it("startAttempt is implemented", () => {
    adapter.startAttempt();
  });
});
`,
);
process.stdout.write(`wrote ${dir}\n`);
