import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, git, tmp, write } from "./util.js";

const mcp = (cmd: string) => JSON.stringify({ mcpServers: { docs: { command: cmd, args: ["-y", "@scope/docs-mcp@1.2.3"] } } }, null, 2);

/** main: a server and its lock. */
async function baseRepo() {
  const d = tmp("tw-lockfrom-");
  git(d, "init", "-q");
  write(d, ".mcp.json", mcp("npx"));
  expect((await cli(["lock", d], tmp())).code).toBe(0);
  git(d, "add", "-A");
  git(d, "commit", "-qm", "base");
  return d;
}
async function verifyFrom(d: string, ...extra: string[]) {
  const r = await cli(["verify", d, "--json", "-", ...extra], tmp());
  return { code: r.code, rep: r.out ? JSON.parse(r.out) : undefined, err: r.err };
}

const fwd = (p: string): string => p.split(String.fromCharCode(92)).join("/");

describe("verify --lock-from <rev>", () => {
  it("a change that edits a server AND the lock together passes plain verify (the gap) but fails with --lock-from the base", async () => {
    const d = await baseRepo();
    git(d, "checkout", "-q", "-b", "pr");
    write(d, ".mcp.json", mcp("node"));
    expect((await cli(["lock", d], tmp())).code).toBe(0); // the PR regenerates the lock to approve its own edit
    git(d, "add", "-A");
    git(d, "commit", "-qm", "self-approving change");

    const plain = await verifyFrom(d);
    expect(plain.code).toBe(0);

    const pinned = await verifyFrom(d, "--lock-from", "main");
    expect(pinned.code).toBe(1);
    expect(pinned.rep.lock.drift.changed).toBe(1);
    expect(pinned.rep.findings.length).toBeGreaterThan(0);
  });
  it("passes when nothing changed since the base, and says where the lock came from", async () => {
    const d = await baseRepo();
    git(d, "checkout", "-q", "-b", "pr");
    write(d, "README.md", "# docs only\n");
    git(d, "add", "-A");
    git(d, "commit", "-qm", "docs");
    const r = await cli(["verify", d, "--lock-from", "main"], tmp());
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/lock read from the base revision [0-9a-f]{8}, not from the working tree/);
  });
  it("catches an uncommitted edit of the server together with the lock", async () => {
    const d = await baseRepo();
    write(d, ".mcp.json", mcp("node"));
    await cli(["lock", d], tmp());
    expect((await verifyFrom(d)).code).toBe(0);
    expect((await verifyFrom(d, "--lock-from", "HEAD")).code).toBe(1);
  });
  it("a lock that only exists in the change is never trusted: exit 2", async () => {
    const d = tmp("tw-lockfrom-");
    git(d, "init", "-q");
    write(d, "README.md", "x\n");
    git(d, "add", "-A"); git(d, "commit", "-qm", "base");
    git(d, "checkout", "-q", "-b", "pr");
    write(d, ".mcp.json", mcp("npx"));
    await cli(["lock", d], tmp());
    git(d, "add", "-A"); git(d, "commit", "-qm", "adds server and lock");
    const r = await cli(["verify", d, "--lock-from", "main"], tmp());
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/no lock file .* at main/);
  });
  it("an unknown revision and a directory that is not a repository are tool errors (exit 2)", async () => {
    const d = await baseRepo();
    expect((await cli(["verify", d, "--lock-from", "no-such-branch"], tmp())).code).toBe(2);
    const plain = tmp("tw-nogit-");
    write(plain, ".mcp.json", mcp("npx"));
    expect((await cli(["verify", plain, "--lock-from", "main"], tmp())).code).toBe(2);
  });
  it("is only valid with verify", async () => {
    const d = await baseRepo();
    expect((await cli(["scan", d, "--lock-from", "main"], tmp())).code).toBe(2);
  });
  it("does not run git hooks or config programs from the repository", async () => {
    const d = await baseRepo();
    const marker = join(tmp(), "ran");
    write(d, ".git/hooks/post-checkout", `#!/bin/sh\necho x > "${fwd(marker)}"\n`);
    write(d, ".git/config", `[core]\n\tfsmonitor = echo > "${fwd(marker)}"\n`);
    await cli(["verify", d, "--lock-from", "HEAD"], tmp());
    const { existsSync } = await import("node:fs");
    expect(existsSync(marker)).toBe(false);
  });
});
