import { makeRepoReader } from "./discovery/reader.js";
import { discover, discoverUserLevel } from "./discovery/discover.js";
import { readTrackedFiles } from "./discovery/gitindex.js";
import { scanFiles, type ScanResult } from "./engine/engine.js";
import type { ScannerConfig } from "./model/types.js";
import { loadConfig } from "./config.js";

export * from "./model/types.js";
export * from "./product.js";
export * from "./config.js";
export * from "./baseline.js";
export * from "./lock/lock.js";
export { MCP_PACKAGE_INTEL, checkIntel, inRange, makeAg011, type IntelEntry } from "./rules/intel-rule.js";
export * from "./diff/identity.js";
export * from "./diff/diff.js";
export * from "./diff/semantic.js";
export * from "./diff/lines.js";
export * from "./git/repo.js";
export * from "./git/state.js";
export * from "./report/sarif.js";
export * from "./report/json.js";
export * from "./report/text.js";
export * from "./report/ruleHelp.js";
export * from "./report/diff-report.js";
export * from "./engine/engine.js";
export * from "./discovery/discover.js";
export * from "./discovery/reader.js";
export * from "./discovery/gitindex.js";
export * from "./discovery/patterns.js";
export * from "./parsers/parse.js";
export * from "./unicode/hidden.js";
export { ALL_RULES } from "./rules/registry.js";

export { applyTextEdits, fillInput } from "./rules/autofix.js";

/** Scan a directory on disk. `trackedFiles` defaults to the paths in .git/index when present. */
export function scanDirectory(root: string, opts: { trackedFiles?: Set<string>; config?: ScannerConfig; userHome?: string } = {}): ScanResult & { skipped: { path: string; reason: string }[] } {
  const config = opts.config ?? loadConfig(root);
  const { files, skipped } = discover(root, { maxFileSizeKb: config.maxFileSizeKb });
  if (opts.userHome) { const u = discoverUserLevel(opts.userHome, { maxFileSizeKb: config.maxFileSizeKb }); files.push(...u.files); skipped.push(...u.skipped); }
  const trackedFiles = opts.trackedFiles ?? readTrackedFiles(root);
  return { ...scanFiles(files, { root, config, trackedFiles, readFile: makeRepoReader(root) }), skipped };
}
export * from "./histreport/index.js";
