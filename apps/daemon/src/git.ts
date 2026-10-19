import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { AgentError } from "@agentos/core";

export function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr?.toString() ?? "";
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentError("git_failed", stderr.trim() || message, 500, { args });
  }
}

export function gitOk(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

export interface RepoInspect {
  root: string;
  baseBranch: string;
  head: string;
  dirty: boolean;
}

export function inspectMainCheckout(inputPath: string, baseOverride?: string): RepoInspect {
  const abs = resolve(inputPath);
  let top = "";
  try {
    top = git(abs, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    throw new AgentError("not_a_git_repo", `${inputPath} is not a git repository`, 400);
  }
  const root = realpathSync(top);
  if (realpathSync(abs) !== root) {
    throw new AgentError("not_a_git_repo", `${inputPath} is not the top level of the checkout`, 400);
  }
  const gitPath = join(root, ".git");
  let gitStat;
  try {
    gitStat = lstatSync(gitPath);
  } catch {
    throw new AgentError("not_a_git_repo", `${inputPath} is not a git repository`, 400);
  }
  if (git(root, ["rev-parse", "--is-bare-repository"]).trim() === "true") {
    throw new AgentError("not_a_git_repo", `${inputPath} is a bare repository`, 400);
  }
  if (!gitStat.isDirectory()) {
    throw new AgentError("not_a_git_repo", `${inputPath} is a linked worktree, not the main checkout`, 400);
  }
  let base = baseOverride?.trim() || git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (!baseOverride && base === "HEAD") {
    throw new AgentError("invalid_argument", "Detached HEAD; pass --base", 400);
  }
  const head = git(root, ["rev-parse", base]).trim();
  const dirty = git(root, ["status", "--porcelain"]).trim().length > 0;
  return { root, baseBranch: base, head, dirty };
}

export function branchExists(repo: string, branch: string): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function checkedOutBranches(repo: string): Set<string> {
  const text = git(repo, ["worktree", "list", "--porcelain"]);
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    if (line.startsWith("branch refs/heads/")) names.add(line.slice("branch refs/heads/".length));
  }
  return names;
}

export function addWorktree(repo: string, branch: string, path: string, commit: string): void {
  if (checkedOutBranches(repo).has(branch)) {
    throw new AgentError("branch_in_use", `Branch ${branch} is already checked out`, 409, { branch });
  }
  git(repo, ["worktree", "add", "-b", branch, path, commit]);
}

export function removeWorktree(repo: string, path: string, force: boolean): void {
  git(repo, ["worktree", "remove", ...(force ? ["--force"] : []), path]);
  git(repo, ["worktree", "prune"]);
}

export function deleteBranch(repo: string, branch: string): void {
  git(repo, ["branch", "-d", branch]);
}

export function commitAll(worktree: string, message: string): boolean {
  git(worktree, ["add", "-A"]);
  const staged = git(worktree, ["diff", "--cached", "--name-only"]).trim();
  if (!staged) return false;
  git(worktree, [
    "-c",
    "user.name=AgentOS",
    "-c",
    "user.email=agentos@localhost",
    "commit",
    "-m",
    message,
  ]);
  return true;
}

export function diffs(worktree: string, base: string): { committed: string; uncommitted: string; stat: string; dirty: boolean } {
  const committed = git(worktree, ["diff", `${base}..HEAD`]);
  const unstaged = git(worktree, ["diff"]);
  const staged = git(worktree, ["diff", "--cached"]);
  const untracked = git(worktree, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    committed,
    uncommitted: staged + unstaged + untrackedDiff(worktree, untracked),
    stat: git(worktree, ["diff", "--stat", `${base}..HEAD`]),
    dirty: Boolean(staged.trim() || unstaged.trim() || untracked.length),
  };
}

function untrackedDiff(worktree: string, files: string[]): string {
  const chunks: string[] = [];
  for (const file of files) {
    let stdout = "";
    try {
      stdout = execFileSync("git", ["diff", "--no-index", "/dev/null", file], {
        cwd: worktree,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      stdout = (error as { stdout?: string | Buffer }).stdout?.toString() ?? "";
    }
    if (stdout) chunks.push(stdout);
  }
  return chunks.join("\n");
}

export function changedFiles(worktree: string, base: string): string[] {
  const names = new Set<string>();
  for (const line of git(worktree, ["diff", "--name-only", `${base}..HEAD`]).split("\n")) {
    if (line.trim()) names.add(line.trim());
  }
  for (const line of git(worktree, ["diff", "--name-only"]).split("\n")) {
    if (line.trim()) names.add(line.trim());
  }
  for (const line of git(worktree, ["diff", "--cached", "--name-only"]).split("\n")) {
    if (line.trim()) names.add(line.trim());
  }
  for (const line of git(worktree, ["ls-files", "--others", "--exclude-standard"]).split("\n")) {
    if (line.trim()) names.add(line.trim());
  }
  return [...names];
}

export function worktreeDirty(path: string): boolean {
  if (git(path, ["status", "--porcelain"]).trim()) return true;
  return false;
}

export function mergeTreeConflicts(repo: string, base: string, branch: string): string[] {
  try {
    const out = execFileSync("git", ["merge-tree", "--write-tree", "--name-only", base, branch], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("tree "));
  } catch (error) {
    const stdout = (error as { stdout?: string | Buffer }).stdout?.toString() ?? "";
    const lines = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^[0-9a-f]{40}$/.test(line));
    return lines.length ? lines : ["(conflict)"];
  }
}

export function pathsOverlap(a: string, b: string): boolean {
  const left = safeReal(a);
  const right = safeReal(b);
  return left === right || left.startsWith(right + sep) || right.startsWith(left + sep);
}

function safeReal(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function dirSize(path: string): number {
  try {
    const out = execFileSync("du", ["-sb", path], { encoding: "utf8" });
    return Number(out.split("\t")[0] ?? 0);
  } catch {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }
}
