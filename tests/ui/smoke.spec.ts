import { expect, test } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

/** AC-F13-5.1 Playwright smoke against fake-claude. Live Claude Code is not used. */
test("AC-F13-5.1 create a mission, approve the ask, and see a verified diff", async ({ page }) => {
  const home = mkdtempSync(join(tmpdir(), "agentos-ui-"));
  const repo = mkdtempSync(join(tmpdir(), "agentos-ui-repo-"));
  const port = await freePort();
  let daemon: ChildProcess | null = null;
  try {
    cpSync(join(ROOT, "fixtures/sample-repo"), repo, { recursive: true });
    const git = (args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "test@localhost"]);
    git(["config", "user.name", "Test"]);
    git(["add", "."]);
    git(["commit", "-m", "init"]);
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({
        daemon: { port },
        notifications: { desktop: false },
        ui: { open_browser_on_start: false },
        runtimes: {
          "claude-code": {
            command: [process.execPath, join(ROOT, "fixtures/fake-runtimes/fake-claude.mjs")],
            scenario: join(ROOT, "fixtures/scenarios/fix-test.json"),
          },
          codex: { command: [process.execPath, join(ROOT, "fixtures/fake-runtimes/fake-codex.mjs")] },
        },
      }),
    );
    daemon = spawn(
      process.execPath,
      ["--experimental-strip-types", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", join(ROOT, "apps/daemon/src/main.ts"), "--foreground"],
      { env: { ...process.env, AGENTOS_HOME: home }, stdio: "ignore" },
    );
    const ready = await waitForFile(join(home, "daemon.ready"));
    const token = readFileSync(join(home, "daemon.token"), "utf8").trim();
    const registered = await fetch(`http://127.0.0.1:${ready.port}/repos`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ path: repo, test_command: "node test.mjs" }),
    });
    expect(registered.ok).toBe(true);
    await page.goto(ready.url);
    await expect(page.getByTestId("sandbox-notice")).toBeVisible();
    await page.getByTestId("mission-title").fill("Fix the failing test");
    await page.getByTestId("mission-repo").fill(repo);
    await page.getByTestId("mission-budget").fill("2.00");
    await page.getByTestId("mission-criteria").fill("node test.mjs passes");
    await page.getByTestId("task-title").fill("Fix add");
    await page.getByTestId("create-mission").click();
    await expect(page.getByTestId("mission-state")).toHaveText("active");
    await page.getByTestId("start-attempt").click();
    await page.getByTestId("approvals-tab").click();
    await expect(page.getByTestId("approval-preview")).toContainText("echo ship it");
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("attempt-state")).toHaveText("succeeded");
    await expect(page.getByTestId("verify-state")).toHaveText("passed");
    await page.getByTestId("diff-tab").click();
    await expect(page.getByTestId("diff-body")).toContainText("math.js");
  } finally {
    if (daemon && !daemon.killed) daemon.kill("SIGTERM");
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForFile(path: string): Promise<{ port: number; url: string }> {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw new Error(`daemon did not write ${path}`);
}
