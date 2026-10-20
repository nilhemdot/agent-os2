import type { Confidence, Range, Severity } from "../model/types.js";

/** Data model of the history report. Mirrors docs/REPORT_CONTRACT.md and docs/report.schema.json. */
export type SeverityCounts = Record<Severity, number>;

export interface CommitRef { commit: string; date: string; subject?: string; author?: string }

export interface ReportFinding {
  repo: string;
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  file: string;
  range: Range;
  evidence: string;
  fix: string;
  status: "open" | "resolved";
  introducedIn?: CommitRef & { exact: boolean };
  resolvedIn?: CommitRef;
}

export interface ReportRepoMeta {
  name: string;
  git: boolean;
  shallow: boolean;
  truncated: boolean;
  commitsExamined: number;
  firstCommit: string | null;
  headCommit: string | null;
  headDate: string | null;
  notes: string[];
}

export interface ReportOptions {
  months: number;
  maxCommits: number;
  includeAuthors: boolean;
  includeSubjects: boolean;
  minSeverity: Severity;
  failOn: Severity | "none";
  repoConfig: boolean;
}

export interface TrendMonth {
  month: string;
  asOfCommit: string | null;
  open: SeverityCounts;
  highCritical: number;
  introduced: number;
  resolved: number;
}

export interface ReportData {
  schemaVersion: 1;
  meta: {
    tool: { name: string; version: string };
    generatedAt: string;
    demo: boolean;
    options: ReportOptions;
    repos: ReportRepoMeta[];
  };
  summary: {
    open: number;
    resolved: number;
    highCritical: number;
    bySeverity: SeverityCounts;
    perRepo: { repo: string; open: number; resolved: number; bySeverity: SeverityCounts }[];
  };
  trend: { windowMonths: number; method: string; months: TrendMonth[] };
  findings: ReportFinding[];
}
