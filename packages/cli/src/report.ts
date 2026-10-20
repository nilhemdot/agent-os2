import { statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  countBySeverity, PRODUCT, sevRank, TOOL_VERSION, toSarif, toTextReport,
  type BaselineState, type Finding, type Severity,
} from "@tripwire/core";
import type { FailOn, MinConfidence, ParsedArgs } from "./args.js";
import { CliError, type CliIO } from "./io.js";

export interface Outcome {
  command: "scan" | "diff" | "verify" | "baseline" | "lock";
  root: string;
  findings: Finding[];
  suppressedByConfig: number;
  suppressedByBaseline: number;
  extra?: Record<string, unknown>;
  /** Exit 1 regardless of the threshold (drift). */
  forceFail?: boolean;
  baselineStates?: Map<Finding, BaselineState>;
  /** Informational lines printed before the summary (not part of JSON). */
  notes?: string[];
}

const confRank: Record<MinConfidence, number> = { low: 0, medium: 1, high: 2 };
export const passesConfidence = (f: Finding, min: MinConfidence): boolean => confRank[f.confidence] >= confRank[min];

export function exceeds(findings: Finding[], failOn: FailOn): boolean {
  if (failOn === "none") return false;
  const t = sevRank(failOn as Severity);
  return findings.some((f) => sevRank(f.severity) >= t);
}

export function requireDir(io: CliIO, p: string, what = "path"): string {
  const abs = resolve(io.cwd, p);
  let st;
  try { st = statSync(abs); } catch { throw new CliError(`${what} not found: ${p}`); }
  if (!st.isDirectory()) throw new CliError(`${what} must be a directory: ${p}`);
  return abs;
}

export function summaryLine(o: Outcome): string {
  const c = countBySeverity(o.findings);
  const parts = (["critical", "high", "medium", "low", "info"] as const).filter((s) => c[s]).map((s) => `${c[s]} ${s}`);
  const n = o.findings.length;
  let line = `${n} finding${n === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  if (o.suppressedByBaseline) line += `; ${o.suppressedByBaseline} suppressed by baseline`;
  if (o.suppressedByConfig) line += `; ${o.suppressedByConfig} suppressed by ${PRODUCT.configFile}`;
  return line;
}

export function buildJson(a: ParsedArgs, o: Outcome, failed: boolean) {
  return {
    schemaVersion: 1,
    tool: { name: PRODUCT.name, version: TOOL_VERSION },
    command: o.command,
    root: o.root,
    summary: {
      total: o.findings.length,
      bySeverity: countBySeverity(o.findings),
      suppressedByBaseline: o.suppressedByBaseline,
      suppressedByConfig: o.suppressedByConfig,
      failOn: a.failOn,
      minConfidence: a.minConfidence,
      failed,
    },
    findings: o.findings,
    ...(o.extra ?? {}),
  };
}

export function buildSarif(o: Outcome) {
  const log = toSarif({ findings: o.findings, baselineStates: o.baselineStates });
  (log.runs[0] as { properties?: Record<string, unknown> }).properties = { suppressedByBaseline: o.suppressedByBaseline };
  return log;
}

/** Returns true when the text went to stdout (so the human report must move to stderr). */
function writeTarget(io: CliIO, target: string, text: string): boolean {
  if (target === "-") { io.stdout(text); return true; }
  try { writeFileSync(resolve(io.cwd, target), text); } catch (e) { throw new CliError(`cannot write ${target}: ${(e as Error).message}`); }
  return false;
}

/** Writes --json/--sarif, prints the text report, and returns the exit code (0 or 1). */
export function finish(io: CliIO, a: ParsedArgs, o: Outcome): number {
  const failed = !!o.forceFail || exceeds(o.findings, a.failOn);
  const json = a.json ? JSON.stringify(buildJson(a, o, failed), null, 2) + "\n" : undefined;
  const sarif = a.sarif && (o.command === "scan" || o.command === "diff" || o.command === "verify") ? JSON.stringify(buildSarif(o), null, 2) + "\n" : undefined;
  let textToStderr = false;
  if (json !== undefined && writeTarget(io, a.json!, json)) textToStderr = true;
  if (sarif !== undefined && writeTarget(io, a.sarif!, sarif)) textToStderr = true;
  const out = textToStderr ? io.stderr : io.stdout;
  const color = !a.noColor && !io.env.NO_COLOR && io.stdoutIsTTY && !textToStderr;
  const body = o.command === "baseline" || o.command === "lock" ? "" : toTextReport(o.findings, { color });
  const lines = [...(body ? [body, ""] : []), ...(o.notes ?? []), summaryLine(o)];
  out(lines.join("\n") + "\n");
  return failed ? 1 : 0;
}
