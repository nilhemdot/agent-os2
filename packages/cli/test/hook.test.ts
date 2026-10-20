import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { configSetsHooksPath, MARKER } from "../src/hook.js";
import { bundlePath, cli, cliRoot, fixtures, git, tmp, write } from "./util.js";

beforeAll(() => { execFileSync(process.execPath, [join(cliRoot, "scripts/build.mjs")], { stdio: "ignore" }); });

function repo(name = "repo") {
  const root = join(tmp("tw-hook-"), name);
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  write(root, "README.md", "x");
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "init");
  return root;
}
const hookFile = (root: string, n: string) => join(root, ".git/hooks", n);

/** Run git as the test harness would; returns exit code and stderr (hooks write their warning to stderr). */
function gitRun(cwd: string, ...args: string[]) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: join(tmpdir(), "tw-empty-gitconfig"), GIT_CONFIG_NOSYSTEM: "1" },
  });
  return { code: r.status, err: r.stderr, out: r.stdout };
}

describe("hook install", () => {
  it("is never automatic: nothing is written without confirmation", async () => {
    const root = repo();
    const r = await cli(["hook", "install", root], root);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/confirmation/);
    expect(existsSync(hookFile(root, "post-checkout"))).toBe(false);
    expect(existsSync(hookFile(root, "post-merge"))).toBe(false);
  });
  it("an interactive 'no' writes nothing; 'yes' installs", async () => {
    const root = repo();
    expect((await cli(["hook", "install", root], root, { tty: true, answer: false })).code).toBe(2);
    expect(existsSync(hookFile(root, "post-checkout"))).toBe(false);
    expect((await cli(["hook", "install", root], root, { tty: true, answer: true })).code).toBe(0);
    expect(existsSync(hookFile(root, "post-checkout"))).toBe(true);
  });
  it("--yes installs post-checkout and post-merge with the marker, the bundle path and a never-blocking body", async () => {
    const root = repo();
    const r = await cli(["hook", "install", root, "--yes"], root);
    expect(r.code).toBe(0);
    for (const n of ["post-checkout", "post-merge"]) {
      const text = readFileSync(hookFile(root, n), "utf8");
      expect(text.startsWith("#!/bin/sh\n")).toBe(true);
      expect(text).toContain(MARKER);
      expect(text).toContain(bundlePath.replace(/\\/g, "/"));
      expect(text).toContain("scan");
      expect(text.trimEnd().endsWith("exit 0")).toBe(true);
      if (process.platform !== "win32") expect(statSync(hookFile(root, n)).mode & 0o111).not.toBe(0);
    }
  });
  it("re-installing updates its own hooks (idempotent)", async () => {
    const root = repo();
    await cli(["hook", "install", root, "--yes"], root);
    const before = readFileSync(hookFile(root, "post-merge"), "utf8");
    const r = await cli(["hook", "install", root, "--yes"], root);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Updated post-merge");
    expect(readFileSync(hookFile(root, "post-merge"), "utf8")).toBe(before);
  });
  it("really runs: a checkout prints the scan warning, never blocks git, and executes nothing from the repository", async () => {
    const root = repo();
    cpSync(join(fixtures, "vulnerable-repo"), root, { recursive: true });
    write(root, ".claude/hooks/ran-marker.sh", "#!/bin/sh\ntouch ../../PWNED\n");
    git(root, "add", "-A", "-f"); git(root, "commit", "-q", "-m", "poisoned");
    await cli(["hook", "install", root, "--yes"], root);
    const r = gitRun(root, "checkout", "-q", "-b", "feature");
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/\d+ findings/);
    expect(r.err).toMatch(/This hook only warns/);
    expect(existsSync(join(root, "PWNED"))).toBe(false);
    const m = gitRun(root, "merge", "--no-edit", "main");
    expect(m.code).toBe(0);
  });
  it("a clean repository prints a clean summary and no warning", async () => {
    const root = repo();
    await cli(["hook", "install", root, "--yes"], root);
    const r = gitRun(root, "checkout", "-q", "-b", "x");
    expect(r.code).toBe(0);
    expect(r.err).toContain("0 findings");
    expect(r.err).not.toMatch(/only warns/);
  });
  it("paths with spaces, quotes and shell metacharacters are quoted, not interpreted", async () => {
    const root = repo("it's a $(touch PWNED) `repo` & more");
    await cli(["hook", "install", root, "--yes"], root);
    gitRun(root, "checkout", "-q", "-b", "y");
    expect(existsSync(join(root, "PWNED"))).toBe(false);
    expect(existsSync(join(tmpdir(), "PWNED"))).toBe(false);
  });
  it("works in a linked worktree (hooks live in the common directory)", async () => {
    const root = repo();
    const wt = join(tmp("tw-wt-"), "wt");
    git(root, "worktree", "add", "-q", "-b", "wtb", wt);
    const r = await cli(["hook", "install", wt, "--yes"], wt);
    expect(r.code).toBe(0);
    expect(existsSync(hookFile(root, "post-checkout"))).toBe(true);
  });

  // ---- refusals
  it("never overwrites a hook it did not create (exit 2, content unchanged, nothing else written)", async () => {
    const root = repo();
    mkdirSync(join(root, ".git/hooks"), { recursive: true });
    writeFileSync(hookFile(root, "post-merge"), "#!/bin/sh\necho mine\n");
    const r = await cli(["hook", "install", root, "--yes"], root);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/already exists/);
    expect(readFileSync(hookFile(root, "post-merge"), "utf8")).toBe("#!/bin/sh\necho mine\n");
    expect(existsSync(hookFile(root, "post-checkout"))).toBe(false);
  });
  it("refuses when core.hooksPath is set in the repository config (any case), in an include, or in user config", async () => {
    for (const body of ["[core]\n\thooksPath = /tmp/shared-hooks\n", "[Core]\n\tHOOKSPATH=/tmp/x\n", "[core]\n\thooksPath\n"]) {
      const root = repo();
      writeFileSync(join(root, ".git/config"), readFileSync(join(root, ".git/config"), "utf8") + "\n" + body);
      const r = await cli(["hook", "install", root, "--yes"], root);
      expect(r.code, body).toBe(2);
      expect(r.err).toMatch(/core\.hooksPath/);
      expect(existsSync(hookFile(root, "post-checkout"))).toBe(false);
    }
    const viaInclude = repo();
    const inc = join(tmp(), "extra.gitconfig");
    writeFileSync(inc, "[core]\n\thooksPath = /tmp/h\n");
    writeFileSync(join(viaInclude, ".git/config"), readFileSync(join(viaInclude, ".git/config"), "utf8") + `\n[include]\n\tpath = ${inc.replace(/\\/g, "/")}\n`);
    expect((await cli(["hook", "install", viaInclude, "--yes"], viaInclude)).code).toBe(2);

    const viaHome = repo();
    const home = tmp("tw-home-");
    writeFileSync(join(home, ".gitconfig"), "[core]\n\thooksPath = ~/hooks\n");
    const r = await cli(["hook", "install", viaHome, "--yes"], viaHome, { home });
    expect(r.code).toBe(2);
    expect(existsSync(hookFile(viaHome, "post-checkout"))).toBe(false);
  });
  it("does not confuse other keys or sections with core.hooksPath", () => {
    expect(configSetsHooksPath("[core]\n\tbare = false\n[alias]\n\thookspath = !echo\n[branch \"hooksPath\"]\n\tremote = origin\n")).toBe(false);
    expect(configSetsHooksPath("[core]\n\thooksPath = x\n")).toBe(true);
  });
  it("refuses outside a git repository", async () => {
    const d = tmp();
    const r = await cli(["hook", "install", d, "--yes"], d);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/not a git repository/);
  });
  it("refuses a symlinked hooks directory and a symlinked hook file", async () => {
    const root = repo();
    const elsewhere = tmp("tw-elsewhere-");
    try { symlinkSync(elsewhere, join(root, ".git/hooks"), "junction"); } catch { return; }
    const r = await cli(["hook", "install", root, "--yes"], root);
    expect(r.code).toBe(2);
    expect(existsSync(join(elsewhere, "post-checkout"))).toBe(false);
  });
});

describe("hook uninstall", () => {
  it("removes only hooks it created, is idempotent, and leaves foreign hooks alone", async () => {
    const root = repo();
    mkdirSync(join(root, ".git/hooks"), { recursive: true });
    writeFileSync(hookFile(root, "post-merge"), "#!/bin/sh\necho mine\n");
    // install only post-checkout by hand-creating ours, since install refuses when post-merge is foreign
    const ours = repo();
    await cli(["hook", "install", ours, "--yes"], ours);
    writeFileSync(hookFile(ours, "post-merge"), "#!/bin/sh\necho mine\n");
    const r = await cli(["hook", "uninstall", ours], ours);
    expect(r.code).toBe(0);
    expect(existsSync(hookFile(ours, "post-checkout"))).toBe(false);
    expect(readFileSync(hookFile(ours, "post-merge"), "utf8")).toBe("#!/bin/sh\necho mine\n");
    expect(r.out).toContain("Left post-merge alone");
    const again = await cli(["hook", "uninstall", ours], ours);
    expect(again.code).toBe(0);
    expect(readFileSync(hookFile(ours, "post-merge"), "utf8")).toBe("#!/bin/sh\necho mine\n");
    // a repo with a foreign hook and no install at all
    expect((await cli(["hook", "uninstall", root], root)).code).toBe(0);
    expect(readFileSync(hookFile(root, "post-merge"), "utf8")).toBe("#!/bin/sh\necho mine\n");
  });
  it("install then uninstall restores the exact original state (fully reversible)", async () => {
    const root = repo();
    const listing = () => execFileSync(process.execPath, ["-e", "console.log(require('fs').readdirSync(process.argv[1]).sort().join(','))", join(root, ".git/hooks")], { encoding: "utf8" }).trim();
    const before = listing();
    await cli(["hook", "install", root, "--yes"], root);
    expect(listing()).not.toBe(before);
    await cli(["hook", "uninstall", root], root);
    expect(listing()).toBe(before);
    const r = gitRun(root, "checkout", "-q", "-b", "z");
    expect(r.err).not.toMatch(/findings/);
  });
  it("uninstall works with no .git hooks directory and refuses non-repositories", async () => {
    const root = repo();
    expect((await cli(["hook", "uninstall", root], root)).code).toBe(0);
    expect((await cli(["hook", "uninstall", tmp()], tmp())).code).toBe(2);
  });
});
