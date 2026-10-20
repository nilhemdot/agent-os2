import { SEVERITY_ORDER, type Severity } from "@tripwire/core";

export const COMMANDS = ["scan", "diff", "lock", "verify", "baseline", "harden", "hook", "report"] as const;
export type Command = (typeof COMMANDS)[number];
export type MinConfidence = "low" | "medium" | "high";
export type FailOn = Severity | "none";

export interface ParsedArgs {
  command?: Command;
  /** positional arguments after the command (subcommand included) */
  pos: string[];
  sarif?: string;
  json?: string;
  failOn: FailOn;
  minConfidence: MinConfidence;
  baseline?: string;
  lockFrom?: string;
  repo?: string;
  includeUserConfigs: boolean;
  noColor: boolean;
  noMergeBase: boolean;
  noRepoConfig: boolean;
  write: boolean;
  yes: boolean;
  /** report-only options */
  failOnGiven: boolean;
  format: "html" | "json" | "md";
  out?: string;
  force: boolean;
  months: number;
  maxCommits: number;
  includeAuthors: boolean;
  includeSubjects: boolean;
  repoName?: string;
  minSeverity: Severity;
  demoLabel: boolean;
  now?: string;
  help: boolean;
  version: boolean;
}

export class UsageError extends Error {}

export const USAGE = `usage: tripwire <command> [args] [flags]

commands:
  scan <path>                  scan a directory for risky agent configuration
  diff <base> <head>           what <head> introduced or made worse relative to <base> (refs or SHAs, or WORKTREE)
  lock <path>                  write .tripwire.lock (hashes of MCP server definitions and hook commands)
  verify <path>                report drift against the lock (--lock-from <rev>: take the lock from that revision, not the working tree)
  baseline create <path>       accept current findings; write .tripwire-baseline.json
  harden <path>                print a recommended safe settings template (--write to create it, with confirmation)
  hook install|uninstall       install/remove a user-run git post-checkout/post-merge hook that runs scan
  report <path...>             report of findings tied to the commit that added them, with a monthly trend (html, json or md)

flags:
  --sarif <file>  --json <file>  (use - for stdout)   --fail-on <critical|high|medium|low|info|none>  (default high)
  --min-confidence <low|medium|high>  --baseline <file>  --include-user-configs  --no-color  --repo <path>
  --no-repo-config  --no-merge-base (diff)  --write (harden)  --yes (non-interactive confirmation)  --version  --help
report flags: --format <html|json|md>  --out <file>  --force  --months <1-24>  --max-commits <n>  --include-authors  --include-subjects
  --repo-name <name>  --min-severity <sev>  --demo-label  --now <ISO-8601 UTC>   (--fail-on defaults to none for report)
exit codes: 0 clean, 1 findings at/above threshold or drift, 2 tool error`;

const VALUE_FLAGS = new Set(["--sarif", "--json", "--fail-on", "--min-confidence", "--baseline", "--repo", "--lock-from", "--format", "--out", "--months", "--max-commits", "--repo-name", "--min-severity", "--now"]);
const REPORT_ONLY = new Set(["--format", "--out", "--months", "--max-commits", "--repo-name", "--min-severity", "--now", "--force", "--include-authors", "--include-subjects", "--demo-label"]);
const BOOL_FLAGS = new Set(["--include-user-configs", "--no-color", "--no-merge-base", "--no-repo-config", "--write", "--yes", "--force", "--include-authors", "--include-subjects", "--demo-label", "--help", "--version", "-h", "-v"]);

function intFlag(flag: string, v: string, min: number, max: number): number {
  if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) throw new UsageError(`invalid ${flag} "${v}" (use an integer from ${min} to ${max})`);
  return Number(v);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { pos: [], failOn: "high", minConfidence: "low", includeUserConfigs: false, noColor: false, noMergeBase: false, noRepoConfig: false, write: false, yes: false, help: false, version: false,
    failOnGiven: false, format: "html", force: false, months: 6, maxCommits: 2000, includeAuthors: false, includeSubjects: false, minSeverity: "low", demoLabel: false };
  const usedReportOnly: string[] = [];
  let minConfidenceGiven = false;
  const raw: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]!;
    let inline: string | undefined;
    if (a.startsWith("--") && a.includes("=")) { inline = a.slice(a.indexOf("=") + 1); a = a.slice(0, a.indexOf("=")); }
    if (REPORT_ONLY.has(a)) usedReportOnly.push(a);
    if (a === "--min-confidence") minConfidenceGiven = true;
    if (VALUE_FLAGS.has(a)) {
      const v = inline ?? argv[++i];
      if (v === undefined || (inline === undefined && v.startsWith("--") && v.length > 2)) throw new UsageError(`missing value for ${a}`);
      switch (a) {
        case "--sarif": out.sarif = v; break;
        case "--json": out.json = v; break;
        case "--baseline": out.baseline = v; break;
        case "--repo": out.repo = v; break;
        case "--lock-from": out.lockFrom = v; break;
        case "--fail-on":
          if (v !== "none" && !SEVERITY_ORDER.includes(v as Severity)) throw new UsageError(`invalid --fail-on "${v}" (use critical, high, medium, low, info or none)`);
          out.failOn = v as FailOn; out.failOnGiven = true; break;
        case "--format":
          if (v !== "html" && v !== "json" && v !== "md") throw new UsageError(`invalid --format "${v}" (use html, json or md)`);
          out.format = v; break;
        case "--out": out.out = v; break;
        case "--months": out.months = intFlag(a, v, 1, 24); break;
        case "--max-commits": out.maxCommits = intFlag(a, v, 1, 1_000_000); break;
        case "--repo-name": out.repoName = v; break;
        case "--min-severity":
          if (!SEVERITY_ORDER.includes(v as Severity)) throw new UsageError(`invalid --min-severity "${v}" (use critical, high, medium, low or info)`);
          out.minSeverity = v as Severity; break;
        case "--now":
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) || Number.isNaN(Date.parse(v))) throw new UsageError(`invalid --now "${v}" (use an ISO-8601 UTC time such as 2026-10-20T00:00:00Z)`);
          out.now = v; break;
        case "--min-confidence":
          if (!["low", "medium", "high"].includes(v)) throw new UsageError(`invalid --min-confidence "${v}" (use low, medium or high)`);
          out.minConfidence = v as MinConfidence; break;
      }
    } else if (BOOL_FLAGS.has(a)) {
      if (inline !== undefined) throw new UsageError(`${a} does not take a value`);
      switch (a) {
        case "--include-user-configs": out.includeUserConfigs = true; break;
        case "--no-color": out.noColor = true; break;
        case "--no-merge-base": out.noMergeBase = true; break;
        case "--no-repo-config": out.noRepoConfig = true; break;
        case "--write": out.write = true; break;
        case "--yes": out.yes = true; break;
        case "--force": out.force = true; break;
        case "--include-authors": out.includeAuthors = true; break;
        case "--include-subjects": out.includeSubjects = true; break;
        case "--demo-label": out.demoLabel = true; break;
        case "--help": case "-h": out.help = true; break;
        case "--version": case "-v": out.version = true; break;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      throw new UsageError(`unknown flag ${a}`);
    } else raw.push(argv[i]!);
  }
  if (out.help || out.version) return out;
  const cmd = raw.shift();
  if (cmd === undefined) throw new UsageError("missing command");
  if (!(COMMANDS as readonly string[]).includes(cmd)) throw new UsageError(`unknown command "${cmd}"`);
  out.command = cmd as Command;
  out.pos = raw;
  const need = (ok: boolean, msg: string) => { if (!ok) throw new UsageError(msg); };
  switch (out.command) {
    case "diff": need(raw.length === 2, "diff needs exactly <base> and <head>"); break;
    case "baseline": need(raw[0] === "create" && raw.length <= 2, "baseline needs the subcommand: baseline create [path]"); break;
    case "hook": need((raw[0] === "install" || raw[0] === "uninstall") && raw.length <= 2, "hook needs install or uninstall [path]"); break;
    case "report":
      need(raw.length >= 1, "report needs at least one <path>");
      need(!(out.repoName !== undefined && raw.length > 1), "--repo-name needs exactly one <path>");
      need(out.sarif === undefined && out.json === undefined && out.baseline === undefined && !minConfidenceGiven, "report does not take --sarif, --json, --baseline or --min-confidence (use --format and --out)");
      break;
    default: need(raw.length <= 1, `${out.command} takes at most one <path>`);
  }
  if (out.lockFrom !== undefined && out.command !== "verify") throw new UsageError("--lock-from is only valid with verify");
  if (out.command !== "report" && usedReportOnly.length) throw new UsageError(`${usedReportOnly[0]} is only valid with report`);
  if (out.sarif === "-" && out.json === "-") throw new UsageError("--sarif and --json cannot both write to stdout");
  return out;
}
