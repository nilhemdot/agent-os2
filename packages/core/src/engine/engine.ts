import type { ScannerConfig, Finding, Rule, SourceFile } from "../model/types.js";
import { sevRank } from "../model/types.js";
import { ZERO_RANGE } from "../rules/helpers.js";
import { ALL_RULES } from "../rules/registry.js";
import { PRODUCT } from "../product.js";
import { redactFindingText } from "../secrets/patterns.js";

export interface ScanOptions {
  root?: string;
  config?: ScannerConfig;
  trackedFiles?: Set<string>;
  readFile?: (repoRelPath: string) => string | undefined;
  /** Scan only these repo-relative paths (the full file list still serves as cross-file context). */
  only?: Set<string>;
  rules?: Rule[];
}

export interface SuppressedFinding { finding: Finding; reason: string }
export interface ScanResult { findings: Finding[]; suppressed: SuppressedFinding[]; invalidSuppressions: string[] }

export function findingKey(f: Finding): string {
  return [f.ruleId, f.file, f.jsonPath ?? "", f.evidence].join("|");
}

/** Stable short id for a finding (rule + file + identity + position). */
export function findingId(f: Finding): string {
  const str = [findingKey(f), f.range.startLine, f.range.startCol, f.title].join("|");
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return f.ruleId + "-" + (h >>> 0).toString(36);
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "");

export function scanFiles(files: SourceFile[], opts: ScanOptions = {}): ScanResult {
  const config = opts.config ?? {};
  const rules = (opts.rules ?? ALL_RULES).filter((r) => !r.experimental || config.enableExperimentalRules);
  const ctx = { files, repoRoot: opts.root ?? "", config, trackedFiles: opts.trackedFiles, readFile: opts.readFile };
  const all: Finding[] = [];
  for (const file of files) {
    if (opts.only && !opts.only.has(file.path)) continue;
    if (file.parseError) {
      all.push({
        ruleId: "AG-000", severity: "low", confidence: "medium", category: "execution",
        title: "Config file could not be parsed", file: file.path, range: ZERO_RANGE,
        whyItMatters: `${PRODUCT.name} could not analyze this file. An agent with a more lenient parser may still read it.`,
        evidence: file.parseError, fix: "Fix the syntax error so the file can be reviewed.",
      });
      continue;
    }
    if (file.parseWarning) {
      all.push({
        ruleId: "AG-000", severity: "low", confidence: "medium", category: "execution",
        title: "Config file has syntax errors", file: file.path, range: ZERO_RANGE,
        whyItMatters: `${PRODUCT.name} analyzed what it could. An agent with a different parser may read this file differently.`,
        evidence: file.parseWarning, fix: "Fix the syntax errors so the file can be reviewed fully.",
      });
    }
    for (const rule of rules) {
      if (!rule.appliesTo.includes(file.kind)) continue;
      try { all.push(...rule.run(file, ctx)); }
      catch (e) {
        all.push({
          ruleId: "AG-000", severity: "info", confidence: "low", category: "execution", title: `Rule ${rule.id} failed`,
          file: file.path, range: ZERO_RANGE, whyItMatters: "A rule threw while scanning this file.", evidence: String(e).slice(0, 200), fix: "Report this as a bug.",
        });
      }
    }
  }
  // No finding text may carry a secret value, whichever rule produced it.
  for (const f of all) redactFindingText(f);
  // dedupe
  const seen = new Set<string>();
  const uniq = all.filter((f) => {
    const k = `${findingKey(f)}|${f.range.startLine}:${f.range.startCol}|${f.title}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  // suppression
  const invalid: string[] = [];
  const sup = (config.suppress ?? []).filter((s) => {
    if (!s.reason || !s.reason.trim()) { invalid.push(`${s.ruleId} ${s.file}: suppression needs a reason`); return false; }
    return true;
  });
  const findings: Finding[] = []; const suppressed: SuppressedFinding[] = [];
  for (const f of uniq) {
    const s = sup.find((x) => x.ruleId === f.ruleId && norm(x.file) === f.file);
    if (s) suppressed.push({ finding: f, reason: s.reason }); else findings.push(f);
  }
  findings.sort(compareFindings);
  return { findings, suppressed, invalidSuppressions: invalid };
}

const confRank = { high: 2, medium: 1, low: 0 } as const;
export function compareFindings(a: Finding, b: Finding): number {
  return sevRank(b.severity) - sevRank(a.severity) || confRank[b.confidence] - confRank[a.confidence] ||
    a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine || a.ruleId.localeCompare(b.ruleId);
}
