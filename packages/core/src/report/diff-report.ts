import type { ConfigChange } from "../diff/semantic.js";
import { redactSecretsInText } from "../secrets/patterns.js";
import type { DiffResult } from "../diff/diff.js";
import type { Finding } from "../model/types.js";
import { sevRank } from "../model/types.js";
import { PRODUCT } from "../product.js";

/** Renders a DiffResult for humans: markdown (editor/PR comment) and plain text (terminal). */

const bySeverity = (a: Finding, b: Finding) => sevRank(b.severity) - sevRank(a.severity) || a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine;
const loc = (f: Finding) => `${f.file}:${f.range.startLine + 1}`;
const oneLine = (s: string, n = 160) => { const t = s.replace(/\s*\n\s*/g, " ⏎ ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const mdCode = (s: string) => "`" + s.replace(/`/g, "'") + "`";

export interface DiffReportOptions {
  /** Extra lines under the title (e.g. "compared against the merge base"). */
  notes?: string[];
  /** Show unchanged findings too (default false). */
  includeUnchanged?: boolean;
}

export function toDiffMarkdown(d: DiffResult, opts: DiffReportOptions = {}): string {
  const L: string[] = [];
  L.push(`# Agent-config changes: ${d.base} → ${d.head}`, "");
  const s = d.stats;
  L.push(`**${s.introduced} introduced**, **${s.worsened} made worse**, ${s.improved} improved, ${s.resolved} resolved, ${s.unchanged} unchanged (already present before this change).`, "");
  for (const n of opts.notes ?? []) L.push(`- ${n}`);
  if (opts.notes?.length) L.push("");
  L.push(`> ${PRODUCT.name} is a pre-flight check. It cannot see malicious code in the project's source.`, "");

  L.push(`## Introduced by this change (${d.introduced.length})`, "");
  if (!d.introduced.length) L.push("_Nothing new at any severity._", "");
  for (const f of [...d.introduced].sort(bySeverity)) {
    L.push(`- **${f.ruleId} ${f.severity}** (${f.confidence} confidence) ${mdCode(loc(f))}: ${f.title}`);
    if (f.evidence) L.push(`  - evidence: ${mdCode(oneLine(redactSecretsInText(f.evidence)))}`);
    L.push(`  - fix: ${oneLine(f.fix, 200)}`);
  }
  if (d.introduced.length) L.push("");

  if (d.worsened.length) {
    L.push(`## Made worse (${d.worsened.length})`, "");
    for (const p of d.worsened.sort((a, b) => bySeverity(a.head, b.head))) {
      L.push(`- **${p.head.ruleId}** ${mdCode(loc(p.head))}: ${p.reason}`);
      L.push(`  - before: ${mdCode(oneLine(redactSecretsInText(p.base.evidence)))}`);
      L.push(`  - after: ${mdCode(oneLine(redactSecretsInText(p.head.evidence)))}`);
    }
    L.push("");
  }

  if (d.changes.length) {
    L.push(`## What changed in the configuration (${d.changes.length})`, "");
    const row = (c: ConfigChange) => `- ${c.riskier ? "⚠ " : ""}${mdCode(c.file)}: ${c.detail}${c.before && c.after && !c.detail.includes(c.before) ? ` (${mdCode(oneLine(c.before, 80))} → ${mdCode(oneLine(c.after, 80))})` : ""}`;
    for (const c of [...d.changes].sort((a, b) => Number(b.riskier) - Number(a.riskier) || a.file.localeCompare(b.file))) L.push(row(c));
    L.push("");
  }

  if (d.improved.length) {
    L.push(`## Improved (${d.improved.length})`, "");
    for (const p of d.improved) L.push(`- **${p.head.ruleId}** ${mdCode(loc(p.head))}: ${p.reason}`, `  - before: ${mdCode(oneLine(redactSecretsInText(p.base.evidence)))}`, `  - after: ${mdCode(oneLine(redactSecretsInText(p.head.evidence)))}`);
    L.push("");
  }

  if (d.resolved.length) {
    L.push(`## Resolved (${d.resolved.length})`, "");
    for (const f of [...d.resolved].sort(bySeverity)) L.push(`- ${f.ruleId} ${f.severity} ${mdCode(loc(f))}: ${f.title}`);
    L.push("");
  }
  if (d.renames.length) {
    L.push(`## Renamed or moved files`, "");
    for (const r of d.renames) L.push(`- ${mdCode(r.from)} → ${mdCode(r.to)} (${Math.round(r.similarity * 100)}% similar)`);
    L.push("");
  }
  if (opts.includeUnchanged && d.unchanged.length) {
    L.push(`## Already present before this change (${d.unchanged.length})`, "");
    for (const f of [...d.unchanged].sort(bySeverity)) L.push(`- ${f.ruleId} ${f.severity} ${mdCode(loc(f))}: ${f.title}`);
    L.push("");
  }
  return redactSecretsInText(L.join("\n"));
}

export function toDiffText(d: DiffResult, opts: DiffReportOptions = {}): string {
  const L: string[] = [`${d.base} → ${d.head}`, `introduced ${d.stats.introduced}   worsened ${d.stats.worsened}   resolved ${d.stats.resolved}   unchanged ${d.stats.unchanged}`];
  for (const n of opts.notes ?? []) L.push(`note: ${n}`);
  for (const f of [...d.introduced].sort(bySeverity)) L.push(`+ ${f.severity.toUpperCase().padEnd(8)} ${f.ruleId} ${loc(f)}  ${f.title}`);
  for (const p of d.worsened) L.push(`~ ${p.head.severity.toUpperCase().padEnd(8)} ${p.head.ruleId} ${loc(p.head)}  ${p.reason}`);
  for (const f of [...d.resolved].sort(bySeverity)) L.push(`- ${f.severity.toUpperCase().padEnd(8)} ${f.ruleId} ${loc(f)}  ${f.title}`);
  for (const c of d.changes.filter((x) => x.riskier)) L.push(`! ${c.file}: ${c.detail}`);
  return redactSecretsInText(L.join("\n"));
}
