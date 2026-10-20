import type { Finding, Severity } from "../model/types.js";
import { SEVERITY_ORDER } from "../model/types.js";
import { PRODUCT } from "../product.js";
import { redactFindingText } from "../secrets/patterns.js";
import { TOOL_VERSION } from "./sarif.js";

export interface JsonReportInput {
  findings: Finding[];
  suppressed?: { finding: Finding; reason: string }[];
  /** Included only when given, so the report is reproducible by default. */
  generatedAt?: string;
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const out = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>;
  for (const f of findings) out[f.severity]++;
  return out;
}

/** Full Finding objects plus a summary. */
export function toJsonReport(input: JsonReportInput) {
  return {
    tool: { name: PRODUCT.name, version: TOOL_VERSION },
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
    summary: { total: input.findings.length, bySeverity: countBySeverity(input.findings), suppressed: input.suppressed?.length ?? 0 },
    findings: input.findings.map((f) => redactFindingText({ ...f })),
    suppressed: (input.suppressed ?? []).map((s) => ({ reason: s.reason, finding: redactFindingText({ ...s.finding }) })),
  };
}
void SEVERITY_ORDER;
