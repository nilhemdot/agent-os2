import type { Finding, Severity } from "../model/types.js";
import { sevRank } from "../model/types.js";
import { PRODUCT } from "../product.js";
import { redactSecretsInText } from "../secrets/patterns.js";
import { countBySeverity } from "./json.js";

const ANSI: Record<Severity, string> = { critical: "\u001b[1;31m", high: "\u001b[31m", medium: "\u001b[33m", low: "\u001b[36m", info: "\u001b[2m" };
const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";

export interface TextOptions { color?: boolean; suppressed?: number; maxEvidence?: number }

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Plain/colored text report with a summary table. */
export function toTextReport(findings: Finding[], opts: TextOptions = {}): string {
  const paint = (s: string, sev: Severity) => (opts.color ? ANSI[sev] + s + RESET : s);
  const bold = (s: string) => (opts.color ? BOLD + s + RESET : s);
  const sorted = [...findings].sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine);
  const lines: string[] = [];
  if (!sorted.length) lines.push(`${PRODUCT.name}: no findings.`);
  for (const f of sorted) {
    lines.push(`${paint(pad(f.severity.toUpperCase(), 8), f.severity)} ${pad(f.ruleId, 7)} ${f.file}:${f.range.startLine + 1}  ${redactSecretsInText(f.title)}  (${f.confidence} confidence)`);
    if (f.evidence) lines.push(`         evidence: ${clip(redactSecretsInText(f.evidence).replace(/\s*\n\s*/g, " ⏎ "), opts.maxEvidence ?? 160)}`);
  }
  const c = countBySeverity(findings);
  lines.push("", bold("Summary"));
  lines.push(`  ${paint("critical", "critical")} ${c.critical}   ${paint("high", "high")} ${c.high}   ${paint("medium", "medium")} ${c.medium}   ${paint("low", "low")} ${c.low}   ${paint("info", "info")} ${c.info}   total ${findings.length}${opts.suppressed ? `   suppressed ${opts.suppressed}` : ""}`);
  lines.push(`  ${PRODUCT.name} is a pre-flight check. It cannot see malicious code in the project's source.`);
  return lines.join("\n");
}
