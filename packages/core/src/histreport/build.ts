import { sevRank, SEVERITY_ORDER } from "../model/types.js";
import { PRODUCT } from "../product.js";
import { TOOL_VERSION } from "../report/sarif.js";
import type { ReportData, ReportFinding, ReportOptions, ReportRepoMeta, SeverityCounts, TrendMonth } from "./types.js";

export const emptyCounts = (): SeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

export const DEFAULT_OPTIONS: ReportOptions = {
  months: 6, maxCommits: 2000, includeAuthors: false, includeSubjects: false, minSeverity: "low", failOn: "none", repoConfig: true,
};

export const TREND_METHOD =
  "For each calendar month (UTC) in the window, the repository is scanned as it was at the last commit on or before the end of that month (for the current month: the latest commit), " +
  "and open findings are counted by severity. 'Introduced' and 'resolved' count findings whose introducing or resolving commit date falls inside that month. Months before the first commit are left out.";

/** Total ordering of findings used in every output format (see docs/REPORT_CONTRACT.md). */
export function sortFindings(fs: ReportFinding[]): ReportFinding[] {
  const conf = { high: 0, medium: 1, low: 2 } as const;
  return [...fs].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === "open" ? -1 : 1) ||
    sevRank(b.severity) - sevRank(a.severity) ||
    conf[a.confidence] - conf[b.confidence] ||
    (b.introducedIn?.date ?? "").localeCompare(a.introducedIn?.date ?? "") * (a.introducedIn && b.introducedIn ? 1 : 0) ||
    (a.introducedIn ? 0 : 1) - (b.introducedIn ? 0 : 1) ||
    a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine || a.ruleId.localeCompare(b.ruleId));
}

export function summarize(findings: ReportFinding[], repos: ReportRepoMeta[]): ReportData["summary"] {
  const bySeverity = emptyCounts();
  let resolved = 0;
  const per = new Map(repos.map((r) => [r.name, { repo: r.name, open: 0, resolved: 0, bySeverity: emptyCounts() }]));
  for (const f of findings) {
    const p = per.get(f.repo);
    if (f.status === "resolved") { resolved++; if (p) p.resolved++; continue; }
    bySeverity[f.severity]++;
    if (p) { p.open++; p.bySeverity[f.severity]++; }
  }
  const open = SEVERITY_ORDER.reduce((n, s) => n + bySeverity[s], 0);
  return { open, resolved, highCritical: bySeverity.high + bySeverity.critical, bySeverity, perRepo: [...per.values()] };
}

export interface BuildInput {
  repos: ReportRepoMeta[];
  findings: ReportFinding[];
  months: TrendMonth[];
  options: ReportOptions;
  now: Date;
  demo: boolean;
}

/** Assembles the final report from already computed parts. */
export function assembleReport(i: BuildInput): ReportData {
  const findings = sortFindings(i.findings);
  return {
    schemaVersion: 1,
    meta: { tool: { name: PRODUCT.name, version: TOOL_VERSION }, generatedAt: i.now.toISOString(), demo: i.demo, options: i.options, repos: i.repos },
    summary: summarize(findings, i.repos),
    trend: { windowMonths: i.options.months, method: TREND_METHOD, months: i.months },
    findings,
  };
}
