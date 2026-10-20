import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PRODUCT } from "@tripwire/core";

/**
 * Git hook management. The hooks are written by the user running `hook install` (never automatically), contain the marker below so
 * they can be recognised and removed, never overwrite a hook they did not create, and are refused when git configuration redirects
 * hooks elsewhere (core.hooksPath), because that directory may be shared or controlled by someone else.
 * Git itself is never run: .git, config and includes are read as text.
 */
export const HOOK_NAMES = ["post-checkout", "post-merge"] as const;
export const MARKER = `# ${PRODUCT.id.toUpperCase()}-MANAGED-HOOK v1`;

export interface GitDirs { gitDir: string; commonDir: string; hooksDir: string }

export class HookRefusal extends Error {}

const readText = (p: string): string | undefined => { try { return readFileSync(p, "utf8"); } catch { return undefined; } };

/** Locate the git directory (.git directory, or a .git file pointing at one for worktrees/submodules). */
export function findGitDirs(root: string): GitDirs {
  const dotGit = join(root, ".git");
  let st;
  try { st = lstatSync(dotGit); } catch { throw new HookRefusal(`${root} is not a git repository (no .git)`); }
  let gitDir: string;
  if (st.isSymbolicLink()) throw new HookRefusal(".git is a symbolic link; refusing to manage hooks through it");
  if (st.isDirectory()) gitDir = dotGit;
  else {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readText(dotGit) ?? "");
    if (!m) throw new HookRefusal(".git is a file but does not contain a gitdir: line");
    gitDir = resolve(root, m[1]!);
  }
  let commonDir = gitDir;
  const common = readText(join(gitDir, "commondir"))?.trim();
  if (common) commonDir = resolve(gitDir, common);
  return { gitDir, commonDir, hooksDir: join(commonDir, "hooks") };
}

/** Does this git config text set core.hooksPath? (section/key matching is case-insensitive, as in git.) */
export function configSetsHooksPath(text: string): boolean {
  let inCore = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"[^"]*")?\s*\]/.exec(line);
    if (sec) {
      inCore = sec[1]!.toLowerCase() === "core";
      const rest = line.slice(sec[0].length).trim();
      if (inCore && /^hookspath\s*=/i.test(rest)) return true;
      continue;
    }
    if (inCore && /^hookspath\s*(=|$)/i.test(line)) return true;
  }
  return false;
}

function includePaths(text: string, baseDir: string, home: string): string[] {
  const out: string[] = [];
  let inInclude = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = /^\[\s*(include|includeIf)\b/i.exec(line);
    if (sec) { inInclude = true; continue; }
    if (line.startsWith("[")) { inInclude = false; continue; }
    const m = inInclude ? /^path\s*=\s*(.+)$/i.exec(line) : null;
    if (m) {
      let p = m[1]!.trim().replace(/^"|"$/g, "");
      if (p.startsWith("~/") && home) p = join(home, p.slice(2));
      out.push(isAbsolute(p) ? p : resolve(baseDir, p));
    }
  }
  return out;
}

/** Returns a description of where core.hooksPath is set, if anywhere we can see (repo config, its includes, user and system config). */
export function findHooksPathRedirect(dirs: GitDirs, env: Record<string, string | undefined>, home: string): string | undefined {
  const seen = new Set<string>();
  const check = (file: string, depth: number): string | undefined => {
    if (seen.has(file) || depth > 3) return undefined;
    seen.add(file);
    const text = readText(file);
    if (text === undefined) return undefined;
    if (configSetsHooksPath(text)) return file;
    for (const inc of includePaths(text, dirname(file), home)) { const r = check(inc, depth + 1); if (r) return r; }
    return undefined;
  };
  const xdg = env.XDG_CONFIG_HOME || (home ? join(home, ".config") : "");
  const candidates = [
    join(dirs.commonDir, "config"), join(dirs.gitDir, "config"), join(dirs.gitDir, "config.worktree"),
    ...(home ? [join(home, ".gitconfig")] : []), ...(xdg ? [join(xdg, "git", "config")] : []),
    "/etc/gitconfig", ...(env.ProgramFiles ? [join(env.ProgramFiles, "Git", "etc", "gitconfig")] : []),
  ];
  for (const c of candidates) { const r = check(c, 0); if (r) return r; }
  if (env.GIT_CONFIG_COUNT || env.GIT_CONFIG_PARAMETERS) {
    const p = env.GIT_CONFIG_PARAMETERS ?? "";
    if (/hookspath/i.test(p) || [...Array(Number(env.GIT_CONFIG_COUNT) || 0).keys()].some((i) => /^core\.hookspath$/i.test(env[`GIT_CONFIG_KEY_${i}`] ?? ""))) return "environment (GIT_CONFIG_*)";
  }
  return undefined;
}

const shq = (s: string): string => {
  if (/[\0\r\n]/.test(s)) throw new HookRefusal("a path contains a control character; refusing to write it into a shell script");
  return `'${s.replace(/\\/g, "/").replace(/'/g, `'\\''`)}'`;
};

export function hookScript(name: string, selfPath: string, repoRoot: string): string {
  return [
    "#!/bin/sh",
    MARKER,
    `# ${PRODUCT.name} ${name} hook. Installed by \`${PRODUCT.id} hook install\`; remove with \`${PRODUCT.id} hook uninstall\`.`,
    "# It scans the agent configuration of this repository (read-only) and prints a warning. It never blocks git and always exits 0.",
    "if command -v node >/dev/null 2>&1; then",
    `  node ${shq(selfPath)} scan ${shq(repoRoot)} --no-color --fail-on high >&2 || echo "${PRODUCT.id}: the scan above reported findings (or could not run). This hook only warns." >&2`,
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

export type HookState = "absent" | "ours" | "foreign" | "symlink";
export function hookState(file: string): HookState {
  let st;
  try { st = lstatSync(file); } catch { return "absent"; }
  if (st.isSymbolicLink()) return "symlink";
  const text = readText(file) ?? "";
  return text.includes(MARKER) ? "ours" : "foreign";
}

export interface InstallPlan { dirs: GitDirs; actions: { name: string; file: string; kind: "create" | "update" }[] }

/** Validates everything and returns what would be written. Throws HookRefusal on any problem. Writes nothing. */
export function planInstall(root: string, env: Record<string, string | undefined>, home: string): InstallPlan {
  const dirs = findGitDirs(root);
  const redirect = findHooksPathRedirect(dirs, env, home);
  if (redirect) throw new HookRefusal(`git configuration sets core.hooksPath (${redirect}); hooks run from a redirected directory, which may be shared or controlled by someone else. Refusing to install.`);
  if (existsSync(dirs.hooksDir)) {
    const st = lstatSync(dirs.hooksDir);
    if (st.isSymbolicLink()) throw new HookRefusal("the hooks directory is a symbolic link; refusing to write through it");
    if (!st.isDirectory()) throw new HookRefusal("the hooks path exists and is not a directory");
  }
  const actions: InstallPlan["actions"] = [];
  for (const name of HOOK_NAMES) {
    const file = join(dirs.hooksDir, name);
    const state = hookState(file);
    if (state === "foreign") throw new HookRefusal(`${name} already exists and was not created by ${PRODUCT.name}; it is never overwritten. Add a line to it by hand that runs: ${PRODUCT.id} scan .`);
    if (state === "symlink") throw new HookRefusal(`${name} is a symbolic link; refusing to replace it`);
    actions.push({ name, file, kind: state === "ours" ? "update" : "create" });
  }
  return { dirs, actions };
}

export function applyInstall(plan: InstallPlan, selfPath: string, repoRoot: string): void {
  const scripts = plan.actions.map((a) => ({ a, text: hookScript(a.name, selfPath, repoRoot) })); // validates paths before any write
  if (!existsSync(plan.dirs.hooksDir)) mkdirSync(plan.dirs.hooksDir, { recursive: true });
  for (const { a, text } of scripts) {
    writeFileSync(a.file, text, a.kind === "create" ? { flag: "wx", mode: 0o755 } : { mode: 0o755 });
    try { chmodSync(a.file, 0o755); } catch { /* not supported on this file system */ }
  }
}

export interface UninstallResult { removed: string[]; left: string[]; absent: string[] }

/** Removes only hooks that carry our marker. */
export function uninstall(root: string): UninstallResult {
  const dirs = findGitDirs(root);
  const res: UninstallResult = { removed: [], left: [], absent: [] };
  for (const name of HOOK_NAMES) {
    const file = join(dirs.hooksDir, name);
    const state = hookState(file);
    if (state === "ours") { unlinkSync(file); res.removed.push(name); }
    else if (state === "absent") res.absent.push(name);
    else res.left.push(name);
  }
  return res;
}
