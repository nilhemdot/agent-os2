import { classifyPath, SKIP_DIRS } from "../discovery/patterns.js";
import { discover } from "../discovery/discover.js";
import { readTrackedFiles } from "../discovery/gitindex.js";
import { makeRepoReader } from "../discovery/reader.js";
import type { ScannerConfig, SourceFile } from "../model/types.js";
import { parseFile } from "../parsers/parse.js";
import type { RepoState } from "../diff/diff.js";
import { diffStates, type DiffResult } from "../diff/diff.js";
import { GitError, GitRepo, type TreeEntry } from "./repo.js";
import { parseConfig } from "../config.js";
import { configFileCandidates } from "../product.js";

/** Builds comparable repository states from git commits and from the working tree, and runs a git-aware diff. Read-only, no processes. */

const SCRIPT_READ_CAP = 256 * 1024;
const MAX_FILES = 5000;

export interface SnapshotOptions { maxFileSizeKb?: number }
export interface Skipped { path: string; reason: string }

const isRegular = (mode: string) => mode === "100644" || mode === "100755" || mode === "100664";
const looksBinary = (b: Buffer) => b.subarray(0, Math.min(b.length, 8000)).includes(0);

/** Lazy path -> blob lookup over a commit's tree. */
class TreeIndex {
  private dirs = new Map<string, Map<string, TreeEntry>>();
  constructor(private repo: GitRepo, rootTree: string) { this.dirs.set("", new Map(repo.tree(rootTree).map((e) => [e.name, e] as const))); }
  entries(dir: string): Map<string, TreeEntry> | undefined {
    const hit = this.dirs.get(dir);
    if (hit) return hit;
    const slash = dir.lastIndexOf("/");
    const parent = this.entries(slash < 0 ? "" : dir.slice(0, slash));
    const e = parent?.get(slash < 0 ? dir : dir.slice(slash + 1));
    if (!e || e.mode !== "40000") return undefined;
    const m = new Map(this.repo.tree(e.sha).map((x) => [x.name, x] as const));
    this.dirs.set(dir, m);
    return m;
  }
  lookup(path: string): TreeEntry | undefined {
    const segs = path.split("/").filter(Boolean);
    if (!segs.length || segs.includes("..") || segs.includes(".git")) return undefined;
    const name = segs.pop()!;
    return this.entries(segs.join("/"))?.get(name);
  }
}

export interface Snapshot { state: RepoState; skipped: Skipped[]; commit: string }

/** The agent-config files (and a lazy reader for referenced scripts) as of a commit. */
export function snapshotCommit(repo: GitRepo, commit: string, label: string, opts: SnapshotOptions = {}): Snapshot {
  const cap = (opts.maxFileSizeKb ?? 1024) * 1024;
  const c = repo.commit(commit);
  const index = new TreeIndex(repo, c.tree);
  const files: SourceFile[] = [];
  const skipped: Skipped[] = [];
  const tracked = new Set<string>();
  const walk = (treeSha: string, prefix: string, depth: number) => {
    if (depth > 12) return;
    for (const e of repo.tree(treeSha)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.mode === "40000") { if (!SKIP_DIRS.has(e.name)) walk(e.sha, path, depth + 1); continue; }
      if (!isRegular(e.mode)) { if (e.mode === "120000" && classifyPath(path)) skipped.push({ path, reason: "symlink" }); continue; }
      const kind = classifyPath(path);
      if (!kind) continue;
      tracked.add(path);
      if (files.length >= MAX_FILES) { skipped.push({ path, reason: "file limit" }); continue; }
      let obj;
      try { obj = repo.readObject(e.sha); } catch (err) { if (err instanceof GitError && err.code === "missing-object") { skipped.push({ path, reason: "missing object" }); continue; } throw err; }
      if (obj.data.length > cap) { skipped.push({ path, reason: "too large" }); continue; }
      if (looksBinary(obj.data)) { skipped.push({ path, reason: "binary" }); continue; }
      files.push(parseFile(path, kind, obj.data.toString("utf8")));
    }
  };
  walk(c.tree, "", 0);
  const readFile = (p: string): string | undefined => {
    try {
      const e = index.lookup(p.replace(/\\/g, "/"));
      if (!e || !isRegular(e.mode)) return undefined;
      const o = repo.readObject(e.sha);
      return o.data.length > SCRIPT_READ_CAP || looksBinary(o.data) ? undefined : o.data.toString("utf8");
    } catch { return undefined; }
  };
  return { state: { label, files, readFile, tracked }, skipped, commit };
}

/** The working tree as it is on disk (candidate files only), with the git index as the tracked set when available. */
export function snapshotWorkingTree(root: string, readFile: (rel: string) => string | undefined, opts: SnapshotOptions = {}): { state: RepoState; skipped: Skipped[] } {
  const d = discover(root, { maxFileSizeKb: opts.maxFileSizeKb });
  return { state: { label: "working tree", files: d.files, readFile, tracked: readTrackedFiles(root) }, skipped: d.skipped };
}

export interface BaseCandidate { rev: string; label: string; description: string }

/** Suggested base revisions, best first. */
export function baseCandidates(root: string): BaseCandidate[] {
  const repo = GitRepo.open(root);
  try {
    const out: BaseCandidate[] = [];
    const seen = new Set<string>();
    const add = (rev: string, label: string, description: string) => {
      try { const sha = repo.resolveCommit(rev); if (seen.has(rev)) return; seen.add(rev); out.push({ rev, label, description: `${description} · ${sha.slice(0, 8)}` }); } catch { /* not present */ }
    };
    add("HEAD", "HEAD", "uncommitted changes only");
    for (const b of ["origin/HEAD", "origin/main", "origin/master", "main", "master", "origin/develop", "develop"]) add(b, b, "default branch");
    const refs = repo.listRefs(400);
    for (const r of refs.filter((x) => x.full.startsWith("refs/heads/")).slice(0, 30)) add(r.name, r.name, "local branch");
    for (const r of refs.filter((x) => x.full.startsWith("refs/remotes/") && !x.full.endsWith("/HEAD")).slice(0, 30)) add(r.name, r.name, "remote branch");
    for (const r of refs.filter((x) => x.full.startsWith("refs/tags/")).slice(0, 15)) add(r.full.replace("refs/", ""), r.name, "tag");
    add("HEAD~1", "HEAD~1", "the previous commit");
    return out;
  } finally { repo.close(); }
}

export interface GitDiffOptions {
  /** Compare against this revision instead of the working tree. */
  headRev?: string;
  /** Head state to use when comparing against the working tree (e.g. the editor's current files, including unsaved edits). */
  headState?: RepoState;
  /** Compare from merge-base(base, HEAD) instead of base itself (default true: "what did my branch change"). */
  useMergeBase?: boolean;
  config?: ScannerConfig;
  maxFileSizeKb?: number;
  contextLines?: number;
  readFileFromDisk?: (rel: string) => string | undefined;
  /**
   * Where scanner configuration (suppressions, size caps, experimental flags) comes from: "provided" (opts.config, default),
   * "base" = the config file stored in the BASE commit (never the head tree: a pull request must not be able to weaken its own
   * check), or "none" = empty configuration.
   */
  configFrom?: "provided" | "base" | "none";
  /** Repo-relative files to read from the compared (base) commit and return in `baseFiles` (for example a baseline file). */
  baseFiles?: string[];
}

export interface GitDiffOutcome {
  result: DiffResult;
  baseRev: string;
  baseCommit: string;
  /** The commit actually compared against (the merge base when useMergeBase was applied). */
  comparedCommit: string;
  headCommit?: string;
  mergeBaseUsed: boolean;
  notes: string[];
  /** Contents at the compared commit of the files requested through `baseFiles` (undefined when absent or unreadable). */
  baseFiles: Record<string, string | undefined>;
  /** Present when configuration was read from the base commit: the file used (undefined when the base has none). */
  configSource?: { file?: string; commit: string };
  skipped: { base: Skipped[]; head: Skipped[] };
}

/** Diff the agent-config of `root`'s repository between a base revision and the working tree (or another revision). */
export function diffAgainst(root: string, baseRev: string, opts: GitDiffOptions = {}): GitDiffOutcome {
  const repo = GitRepo.open(root);
  try {
    const notes: string[] = [];
    const baseCommit = repo.resolveCommit(baseRev);
    let compared = baseCommit;
    let mergeBaseUsed = false;
    const headCommit = opts.headRev ? repo.resolveCommit(opts.headRev) : undefined;
    const tip = headCommit ?? repo.resolveCommit("HEAD");
    if (opts.useMergeBase !== false) {
      const mb = repo.mergeBase(baseCommit, tip);
      if (mb) { compared = mb; mergeBaseUsed = mb !== baseCommit; if (mergeBaseUsed) notes.push(`compared against the merge base ${mb.slice(0, 8)} of ${baseRev} and ${opts.headRev ?? "HEAD"}`); }
      else notes.push(`no common ancestor of ${baseRev} and ${opts.headRev ?? "HEAD"} is available (unrelated history or a shallow clone); compared against ${baseRev} directly`);
    }
    const baseSnap = snapshotCommit(repo, compared, `${baseRev}${mergeBaseUsed ? " (merge base)" : ""} @ ${compared.slice(0, 8)}`, { maxFileSizeKb: opts.maxFileSizeKb });
    let headState: RepoState; let headSkipped: Skipped[] = [];
    if (headCommit) { const s = snapshotCommit(repo, headCommit, `${opts.headRev} @ ${headCommit.slice(0, 8)}`, { maxFileSizeKb: opts.maxFileSizeKb }); headState = s.state; headSkipped = s.skipped; }
    else if (opts.headState) headState = opts.headState;
    else {
      const w = snapshotWorkingTree(root, opts.readFileFromDisk ?? makeRepoReader(root), { maxFileSizeKb: opts.maxFileSizeKb });
      headState = w.state; headSkipped = w.skipped;
    }
    const index = new TreeIndex(repo, repo.commit(compared).tree);
    const readBase = (path: string): string | undefined => {
      const e = index.lookup(path);
      if (!e || !isRegular(e.mode)) return undefined;
      try { const o = repo.readObject(e.sha); return o.type === "blob" && o.data.length <= SCRIPT_READ_CAP && !looksBinary(o.data) ? o.data.toString("utf8") : undefined; } catch { return undefined; }
    };
    let config = opts.config;
    let configSource: GitDiffOutcome["configSource"];
    if (opts.configFrom === "none") config = {};
    else if (opts.configFrom === "base") {
      config = {};
      for (const c of configFileCandidates()) {
        const text = readBase(c.name);
        if (text !== undefined) { config = parseConfig(text); configSource = { file: c.name, commit: compared }; break; }
      }
      configSource ??= { commit: compared };
    }
    const baseFiles: Record<string, string | undefined> = {};
    for (const f of opts.baseFiles ?? []) baseFiles[f] = readBase(f);
    const result = diffStates(baseSnap.state, headState, { config, contextLines: opts.contextLines });
    return { result, baseRev, baseCommit, comparedCommit: compared, headCommit, mergeBaseUsed, notes, baseFiles, configSource, skipped: { base: baseSnap.skipped, head: headSkipped } };
  } finally { repo.close(); }
}

export interface RevisionFile {
  /** File contents at the compared commit; undefined when the file does not exist there (or is not a plain text file). */
  text?: string;
  /** The commit actually read (the merge base of `rev` and HEAD when that was applied). */
  commit: string;
  mergeBaseUsed: boolean;
  notes: string[];
}

const REVISION_FILE_CAP = 4 * 1024 * 1024;

/**
 * Reads one repository file as it is at `rev`, through the built-in git reader (no checkout, no processes, no hooks).
 * With `useMergeBase` (default) the revision read is merge-base(rev, HEAD), so a base branch that moved on after the change was
 * cut does not look like drift. Used by `verify --lock-from`: a change must not be able to approve itself by editing the lock.
 */
export function readFileAtRevision(root: string, rev: string, path: string, opts: { useMergeBase?: boolean; headRev?: string } = {}): RevisionFile {
  const repo = GitRepo.open(root);
  try {
    const notes: string[] = [];
    const baseCommit = repo.resolveCommit(rev);
    let commit = baseCommit;
    if (opts.useMergeBase !== false) {
      const tip = repo.resolveCommit(opts.headRev ?? "HEAD");
      const mb = repo.mergeBase(baseCommit, tip);
      if (mb) commit = mb;
      else notes.push(`no common ancestor of ${rev} and ${opts.headRev ?? "HEAD"} is available (unrelated history or a shallow clone); read from ${rev} directly`);
    }
    const e = new TreeIndex(repo, repo.commit(commit).tree).lookup(path);
    if (!e || !isRegular(e.mode)) return { commit, mergeBaseUsed: commit !== baseCommit, notes };
    const o = repo.readObject(e.sha);
    if (o.type !== "blob" || o.data.length > REVISION_FILE_CAP || looksBinary(o.data)) return { commit, mergeBaseUsed: commit !== baseCommit, notes };
    return { text: o.data.toString("utf8"), commit, mergeBaseUsed: commit !== baseCommit, notes };
  } finally { repo.close(); }
}
