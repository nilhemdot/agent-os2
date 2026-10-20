import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "../config.js";
import { discover } from "../discovery/discover.js";
import { readTrackedFiles } from "../discovery/gitindex.js";
import { makeRepoReader } from "../discovery/reader.js";
import { classifyPath, SKIP_DIRS } from "../discovery/patterns.js";
import { identityKey } from "../diff/identity.js";
import { redact, SECRET_PATTERNS } from "../secrets/patterns.js";
import { scanFiles } from "../engine/engine.js";
import { GitError, GitRepo, type Commit } from "../git/repo.js";
import { snapshotCommit } from "../git/state.js";
import { sevRank, type Finding, type ScannerConfig } from "../model/types.js";
import { assembleReport, emptyCounts } from "./build.js";
import type { CommitRef, ReportData, ReportFinding, ReportOptions, ReportRepoMeta, TrendMonth } from "./types.js";

/**
 * History analysis for the report: attribution of each finding to the first-parent commit that introduced it, and the monthly trend.
 * Read-only: the built-in git reader only (no checkout, no processes, no hooks, no git config programs).
 * The algorithm is described in docs/ARCHITECTURE.md ("History report").
 */

export interface RepoInput { path: string; name: string }

interface ChainCommit { sha: string; short: string; time: number; subject: string; author: string; tree: string }
interface Chain { commits: ChainCommit[]; shallow: boolean; truncated: boolean }

/** A finding identity that is present continuously from `from` up to (not including) `to` (chain indexes). */
interface Span { finding: Finding; from: number; to?: number; exact: boolean }

interface RepoAnalysis {
  meta: ReportRepoMeta;
  chain: ChainCommit[];
  spans: Span[];
  /** Plain folder: findings of the folder as it is, no attribution. */
  plain?: Finding[];
}

const SCRIPT_EXT = /\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|ps1|bat|cmd|rb|pl|php)$/i;
// Bounded quantifiers keep the match linear on hostile text (an unbounded local part is quadratic on a long run of letters).
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;
/** Longest text any redaction step looks at. Longer text is cut BEFORE processing (evidence, notes, subjects, names). */
const PROCESS_MAX = 8192;
const short = (sha: string): string => sha.slice(0, 8);
const isoOf = (sec: number): string => new Date(sec * 1000).toISOString();

/** Strips e-mail addresses from text taken from a repository. */
export const noEmails = (s: string): string => s.replace(EMAIL, "<email removed>");

const AUTH_HEADER = /\b(Bearer|Basic|Token)\s{1,8}[A-Za-z0-9._~+\/=-]{16,4096}/gi;
const KEY_VALUE = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|passw(?:or)?d|passwd)(\s{0,8}[=:]\s{0,8})(["']?)[^\s"'&]{8,4096}/gi;

/**
 * Secret values never reach a report. Known token shapes keep only the prefix and the length (the product's own `redact`);
 * authorization headers and key=value pairs that look like credentials are masked as well, because other rules quote whole commands.
 */
export function redactSecrets(s: string): string {
  let out = s.length > PROCESS_MAX ? s.slice(0, PROCESS_MAX) : s; // cut BEFORE any pattern runs over it
  for (const p of SECRET_PATTERNS) out = out.replace(p.re, (m) => redact(m));
  return out.replace(AUTH_HEADER, "$1 [redacted]").replace(KEY_VALUE, "$1$2$3[redacted]");
}

const clean = (s: string, root: string): string => {
  let out = noEmails(redactSecrets(s));
  for (const r of new Set([root, root.split("\\").join("/")])) if (r.length > 3) out = out.split(r).join(".");
  return out;
};
const cap = (s: string, n: number): string => Array.from(s).slice(0, n).join("");

/** First-parent chain from `head` back to the root, a missing parent (shallow clone) or `max` commits. Oldest first. */
function firstParentChain(repo: GitRepo, head: string, max: number): Chain {
  const out: Commit[] = [];
  let shallow = false, truncated = false;
  let cur: string | undefined = head;
  while (cur) {
    let c: Commit;
    try { c = repo.commit(cur); }
    catch (e) { if (e instanceof GitError && e.code === "missing-object") { shallow = true; break; } throw e; }
    out.push(c);
    cur = c.parents[0];
    if (cur && out.length >= max) { truncated = true; break; }
  }
  out.reverse();
  return { commits: out.map((c) => ({ sha: c.sha, short: short(c.sha), time: c.time, subject: c.subject, author: c.author, tree: c.tree })), shallow, truncated };
}

/** True when the trees differ at a path that can change the findings: an agent-config file or a script a previous scan read. */
function touches(repo: GitRepo, a: string, b: string, watched: Set<string>, prefix = "", depth = 0): boolean {
  if (a === b || depth > 14) return false;
  const left = new Map(repo.tree(a).map((e) => [e.name, e] as const));
  const right = new Map(repo.tree(b).map((e) => [e.name, e] as const));
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(name), r = right.get(name);
    if (l && r && l.sha === r.sha && l.mode === r.mode) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    const lDir = l?.mode === "40000", rDir = r?.mode === "40000";
    if (lDir || rDir) {
      if (SKIP_DIRS.has(name)) continue;
      if (lDir && rDir) { if (touches(repo, l!.sha, r!.sha, watched, path, depth + 1)) return true; continue; }
      // a directory appeared, vanished or changed into a file: compare against an empty tree
      if (lDir && dirTouches(repo, l!.sha, watched, path, depth + 1)) return true;
      if (rDir && dirTouches(repo, r!.sha, watched, path, depth + 1)) return true;
      if ((!lDir && l) || (!rDir && r)) { if (relevantPath(path, watched)) return true; }
      continue;
    }
    if (relevantPath(path, watched)) return true;
  }
  return false;
}
function dirTouches(repo: GitRepo, sha: string, watched: Set<string>, prefix: string, depth: number): boolean {
  if (depth > 14) return false;
  for (const e of repo.tree(sha)) {
    const path = `${prefix}/${e.name}`;
    if (e.mode === "40000") { if (!SKIP_DIRS.has(e.name) && dirTouches(repo, e.sha, watched, path, depth + 1)) return true; }
    else if (relevantPath(path, watched)) return true;
  }
  return false;
}
const relevantPath = (path: string, watched: Set<string>): boolean => !!classifyPath(path) || watched.has(path);

/** Findings of one scan, keyed so that identical findings are counted (the k-th duplicate of an identity is its own key). */
function keyed(findings: Finding[]): Map<string, Finding> {
  const seen = new Map<string, number>();
  const out = new Map<string, Finding>();
  for (const f of findings) {
    const base = identityKey(f);
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    out.set(`${base}#${k}`, f);
  }
  return out;
}

function loadRepoConfig(path: string, options: ReportOptions, notes: string[]): ScannerConfig {
  if (!options.repoConfig) return {};
  return loadConfig(path, { onNote: (m) => notes.push(clean(m, path)) });
}

function analyzePlain(input: RepoInput, options: ReportOptions, notes: string[]): RepoAnalysis {
  const config = loadRepoConfig(input.path, options, notes);
  const { files } = discover(input.path, { maxFileSizeKb: config.maxFileSizeKb });
  const res = scanFiles(files, { root: input.path, config, trackedFiles: readTrackedFiles(input.path), readFile: makeRepoReader(input.path) });
  const plain = res.findings.filter((f) => sevRank(f.severity) >= sevRank(options.minSeverity));
  return { meta: { name: input.name, git: false, shallow: false, truncated: false, commitsExamined: 0, firstCommit: null, headCommit: null, headDate: null, notes }, chain: [], spans: [], plain };
}

export function analyzeRepo(input: RepoInput, options: ReportOptions): RepoAnalysis {
  const notes: string[] = [];
  if (!existsSync(join(input.path, ".git"))) {
    notes.push("no .git directory: commit attribution and the monthly trend are unavailable; the folder was scanned as it is");
    return analyzePlain(input, options, notes);
  }
  let repo: GitRepo;
  try { repo = GitRepo.open(input.path); }
  catch (e) {
    if (!(e instanceof GitError)) throw e;
    notes.push(`git history could not be read (${e.code}): commit attribution and the monthly trend are unavailable; the folder was scanned as it is`);
    return analyzePlain(input, options, notes);
  }
  try {
    let head: string;
    try { head = repo.resolveCommit("HEAD"); }
    catch (e) {
      if (!(e instanceof GitError)) throw e;
      notes.push("the repository has no commits yet: nothing to report");
      return { meta: { name: input.name, git: true, shallow: false, truncated: false, commitsExamined: 0, firstCommit: null, headCommit: null, headDate: null, notes }, chain: [], spans: [] };
    }
    const config = loadRepoConfig(input.path, options, notes);
    const { commits, shallow, truncated } = firstParentChain(repo, head, options.maxCommits);
    if (shallow) notes.push(`shallow history: findings present in the oldest available commit ${commits[0]!.short} are dated 'on or before' that commit`);
    if (truncated) notes.push(`history limited to the newest ${options.maxCommits} commits (--max-commits): findings present in commit ${commits[0]!.short} are dated 'on or before' that commit`);
    const inexactStart = shallow || truncated;

    const open = new Map<string, Span>();
    const spans: Span[] = [];
    let watched = new Set<string>();
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      if (i > 0 && !touches(repo, commits[i - 1]!.tree, c.tree, watched)) continue;
      const snap = snapshotCommit(repo, c.sha, c.short, { maxFileSizeKb: config.maxFileSizeKb });
      const requested = new Set<string>();
      const base = snap.state.readFile;
      const readFile = (p: string): string | undefined => { requested.add(p.replace(/\\/g, "/").replace(/^\.\//, "")); return base?.(p); };
      const res = scanFiles(snap.state.files, { root: "", config, trackedFiles: snap.state.tracked, readFile });
      watched = requested;
      const cur = keyed(res.findings.filter((f) => sevRank(f.severity) >= sevRank(options.minSeverity)));
      for (const [k, f] of cur) {
        const s = open.get(k);
        if (s) s.finding = f;
        else { const ns: Span = { finding: f, from: i, exact: !(i === 0 && inexactStart) }; open.set(k, ns); spans.push(ns); }
      }
      for (const [k, s] of open) if (!cur.has(k)) { s.to = i; open.delete(k); }
    }
    const last = commits[commits.length - 1]!;
    return {
      meta: { name: input.name, git: true, shallow, truncated, commitsExamined: commits.length, firstCommit: commits[0]!.short, headCommit: last.short, headDate: isoOf(last.time), notes },
      chain: commits, spans,
    };
  } finally { repo.close(); }
}

/* ------------------------------------------------------------------ assembly */

const monthKey = (y: number, m: number): string => `${y}-${String(m + 1).padStart(2, "0")}`;

/** The last `n` calendar months (UTC) ending with the month of `now`, oldest first, each with the exclusive end in epoch seconds. */
export function windowMonths(now: Date, n: number): { month: string; startSec: number; endSec: number }[] {
  const out: { month: string; startSec: number; endSec: number }[] = [];
  const y0 = now.getUTCFullYear(), m0 = now.getUTCMonth();
  for (let k = n - 1; k >= 0; k--) {
    const idx = y0 * 12 + m0 - k;
    const y = Math.floor(idx / 12), m = idx - y * 12;
    out.push({ month: monthKey(y, m), startSec: Date.UTC(y, m, 1) / 1000, endSec: Date.UTC(y, m + 1, 1) / 1000 });
  }
  return out;
}

function commitRef(c: ChainCommit, options: ReportOptions): CommitRef {
  const r: CommitRef = { commit: c.short, date: isoOf(c.time) };
  // cap first (the raw text can be megabytes), then redact, then cut to the output length
  if (options.includeSubjects) r.subject = cap(clean(cap(c.subject, 400), ""), 80);
  if (options.includeAuthors) r.author = cap(clean(cap(c.author, 400), ""), 100);
  return r;
}

function toReportFinding(repo: string, root: string, s: Span, chain: ChainCommit[], options: ReportOptions, resolved: boolean): ReportFinding {
  const f = s.finding;
  const out: ReportFinding = {
    repo, ruleId: f.ruleId, title: clean(f.title, root), severity: f.severity, confidence: f.confidence, file: f.file, range: f.range,
    evidence: clean(f.evidence, root), fix: clean(f.fix, root), status: resolved ? "resolved" : "open",
  };
  if (chain.length) {
    out.introducedIn = { ...commitRef(chain[s.from]!, options), exact: s.exact };
    if (resolved && s.to !== undefined) out.resolvedIn = commitRef(chain[s.to]!, options);
  }
  return out;
}

export interface BuildReportInput { repos: RepoInput[]; options: ReportOptions; now: Date; demo: boolean }

/** Analyses every repository and assembles the report (single repository or team). */
export function buildReport(input: BuildReportInput): ReportData {
  const { options, now } = input;
  const analyses = input.repos.map((r) => ({ input: r, a: analyzeRepo(r, options) }));
  const months = windowMonths(now, options.months);
  const windowStart = months[0]!.startSec;

  const findings: ReportFinding[] = [];
  for (const { input: r, a } of analyses) {
    if (a.plain) { for (const f of a.plain) findings.push({ repo: r.name, ruleId: f.ruleId, title: clean(f.title, r.path), severity: f.severity, confidence: f.confidence, file: f.file, range: f.range, evidence: clean(f.evidence, r.path), fix: clean(f.fix, r.path), status: "open" }); continue; }
    for (const s of a.spans) {
      if (s.to === undefined) findings.push(toReportFinding(r.name, r.path, s, a.chain, options, false));
      else if (a.chain[s.to]!.time >= windowStart) findings.push(toReportFinding(r.name, r.path, s, a.chain, options, true));
    }
  }

  // Monthly trend: sums over repositories; months before the first commit of any repository are left out.
  const firstTimes = analyses.filter((x) => x.a.chain.length).map((x) => x.a.chain[0]!.time);
  const trend: TrendMonth[] = [];
  if (firstTimes.length) {
    const firstAny = Math.min(...firstTimes);
    const single = analyses.length === 1;
    for (const w of months) {
      if (firstAny >= w.endSec) continue;
      const open = emptyCounts();
      let introduced = 0, resolved = 0, asOf: string | null = null;
      for (const { a } of analyses) {
        if (!a.chain.length) continue;
        let idx = a.chain.length - 1;
        while (idx >= 0 && a.chain[idx]!.time >= w.endSec) idx--;
        if (idx < 0) continue;
        if (single) asOf = a.chain[idx]!.short;
        for (const s of a.spans) {
          if (s.from <= idx && (s.to === undefined || idx < s.to)) open[s.finding.severity]++;
          if (s.exact) { const t = a.chain[s.from]!.time; if (t >= w.startSec && t < w.endSec) introduced++; }
          if (s.to !== undefined) { const t = a.chain[s.to]!.time; if (t >= w.startSec && t < w.endSec) resolved++; }
        }
      }
      trend.push({ month: w.month, asOfCommit: asOf, open, highCritical: open.high + open.critical, introduced, resolved });
    }
  }
  const repos = analyses.map((x) => x.a.meta);
  if (!trend.length && !analyses.some((x) => x.a.meta.notes.length)) repos[0]!.notes.push("no commit history in the window: the monthly trend is empty");
  return assembleReport({ repos, findings, months: trend, options, now, demo: input.demo });
}

export const repoDisplayName = (p: string): string => basename(p) || "repository";
