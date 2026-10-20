import { closeSync, lstatSync, openSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { buildReport, GitError, PRODUCT, renderHtml, renderJson, renderMarkdown, sevRank, type ReportData, type ReportOptions } from "@tripwire/core";
import type { ParsedArgs } from "./args.js";
import { CliError, type CliIO } from "./io.js";
import { requireDir } from "./report.js";

const EXT = { html: "html", json: "json", md: "md" } as const;

const norm = (p: string): string => (process.platform === "win32" ? p.toLowerCase() : p);
const inside = (root: string, p: string): boolean => {
  const rel = relative(norm(root), norm(p));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * Resolves --out and refuses anything that would write outside the current folder: ".." escapes, absolute paths elsewhere, and
 * symbolic links or junctions (on the file or any existing parent) that lead outside. Parent directories are never created.
 */
export function safeOutPath(io: CliIO, out: string, force: boolean): string {
  const cwdReal = realpathSync(io.cwd);
  const target = resolve(io.cwd, out);
  if (!inside(resolve(io.cwd), target)) throw new CliError(`refusing --out ${out}: it is outside the current folder`);
  let parentReal: string;
  try { parentReal = realpathSync(dirname(target)); } catch { throw new CliError(`cannot write ${out}: the folder does not exist`); }
  if (!inside(cwdReal, parentReal)) throw new CliError(`refusing --out ${out}: its folder resolves outside the current folder (symbolic link or junction)`);
  const real = join(parentReal, basename(target));
  let st;
  try { st = lstatSync(real); } catch { return real; }
  if (st.isSymbolicLink()) {
    let dest: string;
    try { dest = realpathSync(real); } catch { throw new CliError(`refusing --out ${out}: it is a broken symbolic link`); }
    if (!inside(cwdReal, dest)) throw new CliError(`refusing --out ${out}: it is a symbolic link that leads outside the current folder`);
  }
  if (st.isDirectory()) throw new CliError(`cannot write ${out}: it is a folder`);
  if (!force) throw new CliError(`${out} already exists (use --force to overwrite)`);
  return real;
}

/** Writes via a temporary name in the same folder, then renames, so a failure leaves no partial report. */
function writeAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  let fd: number | undefined;
  try {
    fd = openSync(tmp, "wx");
    writeSync(fd, data);
    closeSync(fd); fd = undefined;
    renameSync(tmp, path);
  } catch (e) {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ }
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw new CliError(`cannot write ${basename(path)}: ${(e as Error).message}`);
  }
}

function displayNames(a: ParsedArgs, roots: string[]): string[] {
  if (a.repoName !== undefined) return [a.repoName];
  const seen = new Map<string, number>();
  return roots.map((r) => {
    const base = basename(r) || "repository";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function reportOptions(a: ParsedArgs): ReportOptions {
  return {
    months: a.months, maxCommits: a.maxCommits, includeAuthors: a.includeAuthors, includeSubjects: a.includeSubjects,
    minSeverity: a.minSeverity, failOn: a.failOn, repoConfig: !a.noRepoConfig,
  };
}

export async function cmdReport(io: CliIO, a: ParsedArgs): Promise<number> {
  const roots = a.pos.map((p) => requireDir(io, p, "path"));
  const options = reportOptions({ ...a, failOn: a.failOnGiven ? a.failOn : "none" });
  const outTarget = a.out === "-" ? undefined : safeOutPath(io, a.out ?? `${PRODUCT.id}-report.${EXT[a.format]}`, a.force);
  const names = displayNames(a, roots);
  const now = a.now ? new Date(a.now) : new Date();

  let data: ReportData;
  try { data = buildReport({ repos: roots.map((r, i) => ({ path: r, name: names[i]! })), options, now, demo: a.demoLabel }); }
  catch (e) { if (e instanceof GitError) throw new CliError(e.message); throw e; }

  const body = a.format === "json" ? renderJson(data) : a.format === "md" ? renderMarkdown(data) : renderHtml(data);
  let toStderr = false;
  if (outTarget === undefined) { io.stdout(body); toStderr = true; } else writeAtomic(outTarget, body);
  const say = toStderr ? io.stderr : io.stdout;
  const s = data.summary;
  say(`${outTarget ? `Wrote ${a.out ?? basename(outTarget)}: ` : ""}${s.open} open finding${s.open === 1 ? "" : "s"} (${s.highCritical} high/critical), ${s.resolved} resolved, across ${roots.length} repositor${roots.length === 1 ? "y" : "ies"}\n`);
  const failed = options.failOn !== "none" && data.findings.some((f) => f.status === "open" && sevRank(f.severity) >= sevRank(options.failOn as never));
  return failed ? 1 : 0;
}
