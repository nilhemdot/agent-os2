import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  applyBaseline, BASELINE_FILE, BaselineError, changedFindings, createBaseline, createLock, diffAgainst, discover, discoverUserLevel, GitError,
  LOCK_FILE, loadConfig, readFileAtRevision, LockError, parseBaseline, parseLock, PRODUCT, scanDirectory, serializeBaseline, serializeLock, TOOL_VERSION, verifyLock,
  type SourceFile,
  type BaselineState, type Finding,
} from "@tripwire/core";
import { parseArgs, UsageError, USAGE, type ParsedArgs } from "./args.js";
import { applyInstall, HookRefusal, planInstall, uninstall as uninstallHooks } from "./hook.js";
import { hardenText, writeProjectTemplate } from "./harden.js";
import { CliError, confirm, type CliIO } from "./io.js";
import { cmdReport } from "./reportCmd.js";
import { finish, passesConfidence, requireDir, type Outcome } from "./report.js";

function config(io: CliIO, a: ParsedArgs, root: string) {
  if (a.noRepoConfig) return {};
  return loadConfig(root, { onNote: (m) => io.stderr(`${PRODUCT.name}: ${m}` + String.fromCharCode(10)) });
}

function repoRoot(io: CliIO, a: ParsedArgs, fallback: string): string {
  return requireDir(io, a.repo ?? fallback, a.repo ? "--repo" : "path");
}

interface BaselineLoc { abs: string; rel: string; inRepo: boolean }
function baselineLocation(io: CliIO, a: ParsedArgs, root: string): BaselineLoc | undefined {
  if (!a.baseline) return undefined;
  const abs = resolve(io.cwd, a.baseline);
  const rel = relative(resolve(root), abs).split(sep).join("/");
  return { abs, rel, inRepo: !!rel && !rel.startsWith("..") && !isAbsolute(rel) };
}

/**
 * Applies --baseline (when given) to already confidence-filtered findings.
 * `fromBase`: diff mode. A baseline file that lives inside the repository is taken from the BASE revision (`baseText`), never from the
 * head tree, so a change cannot add a baseline entry for its own finding. A baseline outside the repository is the operator's own file.
 * `--no-repo-config` ignores baselines inside the repository.
 */
function withBaseline(io: CliIO, a: ParsedArgs, findings: Finding[], root: string, fromBase?: { baseFiles: Record<string, string | undefined>; commit: string }): { kept: Finding[]; suppressedByBaseline: number; notes: string[] } {
  const loc = baselineLocation(io, a, root);
  if (!loc) return { kept: findings, suppressedByBaseline: 0, notes: [] };
  if (loc.inRepo && a.noRepoConfig) return { kept: findings, suppressedByBaseline: 0, notes: [`ignored baseline ${a.baseline}: it is inside the repository and --no-repo-config was given`] };
  let text: string | undefined;
  const notes: string[] = [];
  if (fromBase && loc.inRepo) {
    text = fromBase.baseFiles[loc.rel];
    if (text === undefined) return { kept: findings, suppressedByBaseline: 0, notes: [`baseline ${loc.rel} does not exist at the base revision (${fromBase.commit.slice(0, 8)}); no baseline applied. A baseline added by the change itself is never trusted.`] };
    notes.push(`baseline ${loc.rel} read from the base revision ${fromBase.commit.slice(0, 8)}, not from the head`);
  } else {
    try { text = readFileSync(loc.abs, "utf8"); } catch { throw new CliError(`cannot read baseline file: ${a.baseline}`); }
  }
  let b;
  try { b = parseBaseline(text); } catch (e) { if (e instanceof BaselineError) throw new CliError(`${a.baseline}: ${e.message}`); throw e; }
  const r = applyBaseline(findings, b);
  if (r.stale) notes.push(`${r.stale} baseline entr${r.stale === 1 ? "y" : "ies"} no longer match anything (fixed or changed)`);
  return { kept: r.kept, suppressedByBaseline: r.suppressed.length, notes };
}

const shownRoot = (a: ParsedArgs, fallback: string): string => a.repo ?? fallback;

async function cmdScan(io: CliIO, a: ParsedArgs): Promise<number> {
  const given = a.pos[0] ?? ".";
  const root = repoRoot(io, a, given);
  const cfg = config(io, a, root);
  const res = scanDirectory(root, { config: cfg, userHome: a.includeUserConfigs && io.homedir ? io.homedir : undefined });
  for (const m of res.invalidSuppressions) io.stderr(`${PRODUCT.name}: ${m}\n`);
  const filtered = res.findings.filter((f) => passesConfidence(f, a.minConfidence));
  const b = withBaseline(io, a, filtered, root);
  const o: Outcome = { command: "scan", root: shownRoot(a, given), findings: b.kept, suppressedByConfig: res.suppressed.length, suppressedByBaseline: b.suppressedByBaseline, notes: b.notes };
  return finish(io, a, o);
}

async function cmdBaselineCreate(io: CliIO, a: ParsedArgs): Promise<number> {
  const given = a.pos[1] ?? ".";
  const root = repoRoot(io, a, given);
  const cfg = config(io, a, root);
  const res = scanDirectory(root, { config: cfg, userHome: a.includeUserConfigs && io.homedir ? io.homedir : undefined });
  const findings = res.findings.filter((f) => passesConfidence(f, a.minConfidence));
  const file = join(root, BASELINE_FILE);
  try { writeFileSync(file, serializeBaseline(createBaseline(findings))); } catch (e) { throw new CliError(`cannot write ${BASELINE_FILE}: ${(e as Error).message}`); }
  const o: Outcome = {
    command: "baseline", root: shownRoot(a, given), findings: [], suppressedByConfig: res.suppressed.length, suppressedByBaseline: 0,
    extra: { baseline: { file: BASELINE_FILE, accepted: findings.length } },
    notes: [`Wrote ${BASELINE_FILE}: accepted ${findings.length} finding${findings.length === 1 ? "" : "s"}. Later runs with --baseline ${BASELINE_FILE} fail only on new ones.`],
  };
  return finish(io, a, o);
}

function discoverAll(io: CliIO, a: ParsedArgs, root: string): SourceFile[] {
  const cfg = config(io, a, root);
  const { files } = discover(root, { maxFileSizeKb: cfg.maxFileSizeKb });
  if (a.includeUserConfigs && io.homedir) files.push(...discoverUserLevel(io.homedir, { maxFileSizeKb: cfg.maxFileSizeKb }).files);
  return files;
}

function readLock(io: CliIO, root: string) {
  const file = join(root, LOCK_FILE);
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { throw new CliError(`no lock file at ${LOCK_FILE} (create one with: ${PRODUCT.id} lock <path>)`); }
  try { return parseLock(text); } catch (e) { if (e instanceof LockError) throw new CliError(`${LOCK_FILE}: ${e.message}`); throw e; }
}

async function cmdLock(io: CliIO, a: ParsedArgs): Promise<number> {
  const given = a.pos[0] ?? ".";
  const root = repoRoot(io, a, given);
  const files = discoverAll(io, a, root);
  const lock = createLock(files);
  let drift = { changed: 0, added: 0, removed: 0 };
  let hadLock = false;
  try { const prev = parseLock(readFileSync(join(root, LOCK_FILE), "utf8")); hadLock = true; drift = verifyLock(prev, files).counts; } catch { /* no previous lock: first write */ }
  try { writeFileSync(join(root, LOCK_FILE), serializeLock(lock)); } catch (e) { throw new CliError(`cannot write ${LOCK_FILE}: ${(e as Error).message}`); }
  const changes = drift.changed + drift.added + drift.removed;
  const o: Outcome = {
    command: "lock", root: shownRoot(a, given), findings: [], suppressedByConfig: 0, suppressedByBaseline: 0,
    extra: { lock: { file: LOCK_FILE, entries: lock.entries.length, drift } },
    notes: [`Wrote ${LOCK_FILE}: ${lock.entries.length} entr${lock.entries.length === 1 ? "y" : "ies"} (MCP servers and hook commands).` +
      (hadLock ? changes ? ` Accepted ${drift.changed} changed, ${drift.added} added, ${drift.removed} removed.` : " No differences from the previous lock." : "")],
  };
  return finish(io, a, o);
}

async function cmdVerify(io: CliIO, a: ParsedArgs): Promise<number> {
  const given = a.pos[0] ?? ".";
  const root = repoRoot(io, a, given);
  const notes: string[] = [];
  let lock;
  if (a.lockFrom !== undefined) {
    // The lock is taken from the base revision, never from the working tree: a change cannot approve itself by editing the lock.
    let rf;
    try { rf = readFileAtRevision(root, a.lockFrom, LOCK_FILE, { useMergeBase: !a.noMergeBase }); } catch (e) { if (e instanceof GitError) throw new CliError(e.message); throw e; }
    if (rf.text === undefined) throw new CliError(`no lock file ${LOCK_FILE} at ${a.lockFrom} (${rf.commit.slice(0, 8)}); nothing to verify against. A lock added by the change itself is never trusted: create it on the base branch first`);
    try { lock = parseLock(rf.text); } catch (e) { if (e instanceof LockError) throw new CliError(`${LOCK_FILE} at ${a.lockFrom}: ${e.message}`); throw e; }
    notes.push(...rf.notes, `lock read from the base revision ${rf.commit.slice(0, 8)}, not from the working tree`);
  } else lock = readLock(io, root);
  const files = discoverAll(io, a, root);
  const v = verifyLock(lock, files);
  const b = withBaseline(io, a, v.findings.filter((f) => passesConfidence(f, a.minConfidence)), root);
  const o: Outcome = {
    command: "verify", root: shownRoot(a, given), findings: b.kept, suppressedByConfig: 0, suppressedByBaseline: b.suppressedByBaseline,
    forceFail: b.kept.length > 0, notes: [...notes, ...b.notes],
    extra: { lock: { file: LOCK_FILE, entries: v.entries, drift: v.counts } },
  };
  return finish(io, a, o);
}

async function cmdHarden(io: CliIO, a: ParsedArgs): Promise<number> {
  const root = repoRoot(io, a, a.pos[0] ?? ".");
  io.stdout(hardenText() + String.fromCharCode(10));
  if (!a.write) return 0;
  const ok = await confirm(io, a.yes, `Create .claude/settings.json in ${root} with the recommended project settings?`);
  if (!ok) throw new CliError("not written: confirmation was not given (answer y at the prompt, or pass --yes when running non-interactively)");
  const r = writeProjectTemplate(root);
  if (!r.ok) throw new CliError(r.reason);
  io.stdout(`Wrote ${r.file}` + String.fromCharCode(10));
  return 0;
}

async function cmdHook(io: CliIO, a: ParsedArgs): Promise<number> {
  const root = repoRoot(io, a, a.pos[1] ?? ".");
  try {
    if (a.pos[0] === "uninstall") {
      const r = uninstallHooks(root);
      for (const n of r.removed) io.stdout(`Removed ${n}` + String.fromCharCode(10));
      for (const n of r.left) io.stdout(`Left ${n} alone: it was not created by ${PRODUCT.name}` + String.fromCharCode(10));
      if (!r.removed.length && !r.left.length) io.stdout("No hooks installed by " + PRODUCT.name + String.fromCharCode(10));
      return 0;
    }
    const plan = planInstall(root, io.env, io.homedir);
    if (!io.selfPath) throw new CliError("cannot determine the path of this program to write into the hook");
    const names = plan.actions.map((x) => x.name).join(" and ");
    const ok = await confirm(io, a.yes, `Install git ${names} hooks in ${plan.dirs.hooksDir} that run "${PRODUCT.id} scan" and print a warning (they never block git)?`);
    if (!ok) throw new CliError("not installed: confirmation was not given (answer y at the prompt, or pass --yes when running non-interactively)");
    applyInstall(plan, io.selfPath, root);
    for (const x of plan.actions) io.stdout(`${x.kind === "create" ? "Installed" : "Updated"} ${x.name}` + String.fromCharCode(10));
    io.stdout(`Remove with: ${PRODUCT.id} hook uninstall` + String.fromCharCode(10));
    return 0;
  } catch (e) {
    if (e instanceof HookRefusal) throw new CliError(e.message);
    throw e;
  }
}

async function cmdDiff(io: CliIO, a: ParsedArgs): Promise<number> {
  const [base, head] = a.pos as [string, string];
  const root = repoRoot(io, a, ".");
  // Everything that can weaken the check (suppressions, size caps, experimental flags in .tripwire.json, and a baseline stored in the
  // repository) comes from the BASE revision, never from the head tree: the change under review must not be able to excuse itself.
  const loc = baselineLocation(io, a, root);
  let out;
  try {
    out = diffAgainst(root, base, {
      headRev: head === "WORKTREE" ? undefined : head, useMergeBase: !a.noMergeBase,
      configFrom: a.noRepoConfig ? "none" : "base", baseFiles: loc?.inRepo && !a.noRepoConfig ? [loc.rel] : [],
    });
  } catch (e) {
    if (e instanceof GitError) throw new CliError(e.message);
    throw e;
  }
  const r = out.result;
  const b = withBaseline(io, a, changedFindings(r).filter((f) => passesConfidence(f, a.minConfidence)), root, { baseFiles: out.baseFiles, commit: out.comparedCommit });
  const changed = b.kept;
  const states = new Map<Finding, BaselineState>(changed.map((f) => [f, "new"]));
  const cfgNote = a.noRepoConfig ? [] : out.configSource?.file ? [`configuration (${out.configSource.file}) read from the base revision ${out.comparedCommit.slice(0, 8)}, not from the head`] : [];
  const o: Outcome = {
    command: "diff", root: shownRoot(a, "."), findings: changed, suppressedByConfig: 0, suppressedByBaseline: b.suppressedByBaseline, baselineStates: states,
    notes: [...out.notes, ...cfgNote, ...b.notes],
    extra: { diff: { base: r.base, head: r.head, introduced: r.introduced.length, worsened: r.worsened.length, resolved: r.resolved.length, unchanged: r.unchanged.length } },
  };
  return finish(io, a, o);
}

export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    const a = parseArgs(argv);
    if (a.version) { io.stdout(`${TOOL_VERSION}\n`); return 0; }
    if (a.help) { io.stdout(USAGE + "\n"); return 0; }
    switch (a.command) {
      case "scan": return await cmdScan(io, a);
      case "diff": return await cmdDiff(io, a);
      case "baseline": return await cmdBaselineCreate(io, a);
      case "harden": return await cmdHarden(io, a);
      case "hook": return await cmdHook(io, a);
      case "lock": return await cmdLock(io, a);
      case "verify": return await cmdVerify(io, a);
      case "report": return await cmdReport(io, a);
      default: throw new CliError(`${a.command} is not implemented yet`);
    }
  } catch (e) {
    if (e instanceof UsageError) { io.stderr(`${PRODUCT.name}: ${e.message}\n${USAGE}\n`); return 2; }
    if (e instanceof CliError || e instanceof GitError) { io.stderr(`${PRODUCT.name}: ${e.message}\n`); return 2; }
    io.stderr(`${PRODUCT.name}: unexpected error: ${(e as Error).message}\n`);
    return 2;
  }
}
