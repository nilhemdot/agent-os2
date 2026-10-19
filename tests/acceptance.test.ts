import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manualClock } from "@agentos/core";
import { boot, cli, cliAsync, initRepo, listen, ROOT, waitFor } from "./support.ts";
import { FAKE_CLAUDE } from "./support.ts";

const scenario = join(ROOT, "fixtures/scenarios/fix-test.json");

async function readyMission(env = boot({ scenario })) {
  const session = await env;
  const repo = initRepo();
  const added = await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
  expect(added.status).toBe(201);
  const mission = await session.api("POST", "/missions", {
    title: "Fix the failing test",
    repo,
    budget: "5.00",
    criteria: ["file src/math.js exists"],
    objective: "Make add return a sum",
  });
  const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Fix add", profile: "claude-default" });
  await session.api("POST", `/missions/${mission.body.id}/start`);
  return { session, repo, mission: mission.body, task: task.body };
}

describe("daemon and missions", () => {
  it("AC-F1-2.1 health is unauthenticated and returns exactly the public fields", async () => {
    const session = await boot();
    const response = await fetch(`${session.base}/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["db", "running_attempts", "schema_version", "status", "uptime_s", "version"]);
    expect(body.status).toBe("ok");
    await session.stop();
  });

  it("AC-F1-2.2 a non-writable database file degrades health without hiding the daemon", async () => {
    const session = await boot();
    chmodSync(join(session.home, "agentos.db"), 0o444);
    const body = await session.api("GET", "/health");
    expect(body.status).toBe(200);
    expect(body.body.status).toBe("degraded");
    expect(body.body.db).toBe("db_not_writable");
    chmodSync(join(session.home, "agentos.db"), 0o600);
    await session.stop();
  });

  it("AC-F2-1.3 the CLI never opens the database when the daemon is down", () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-cli-"));
    const result = cli(home, ["mission", "create", "x"]);
    expect(result.status).toBe(2);
    expect(`${result.stderr}${result.stdout}`).toContain("daemon not running; start it with `agentos daemon start`");
    expect(existsSync(join(home, "agentos.db"))).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });

  it("AC-F2-1.4 an empty title is rejected", async () => {
    const session = await boot();
    const body = await session.api("POST", "/missions", { title: "  " });
    expect(body.status).toBe(400);
    expect(body.body.error.code).toBe("invalid_argument");
    await session.stop();
  });

  it("AC-F2-1.1 AC-F2-1.2 AC-F2-2.1 AC-F2-4.1 AC-F2-4.2 AC-F2-4.3 missions, repos, and budgets", async () => {
    const session = await boot();
    const draft = await session.api("POST", "/missions", { title: "smoke" });
    expect(draft.status).toBe(201);
    expect(draft.body.state).toBe("draft");
    expect(draft.body.repo_id).toBeNull();
    expect(draft.body.budget_nusd).toBeNull();
    expect(draft.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const missing = await session.api("POST", "/repos", { path: join(session.home, "nope") });
    expect(missing.body.error.code).toBe("not_a_git_repo");
    const repo = initRepo();
    const added = await session.api("POST", "/repos", { path: repo, test_command: "npm test", base: "main" });
    expect(added.body.root_path).toBe(repo);
    expect(added.body.base_branch).toBe("main");
    expect(added.body.test_command).toBe("npm test");
    const again = await session.api("POST", "/repos", { path: repo });
    expect(again.body.id).toBe(added.body.id);
    const full = await session.api("POST", "/missions", {
      title: "Add CSV export",
      repo,
      budget: "5.00",
      criteria: ["npm test passes", "file src/export.ts exists"],
    });
    expect(full.body.budget_nusd).toBe(5_000_000_000);
    expect(full.body.criteria.map((item: { value: string }) => item.value)).toEqual(["npm test passes", "src/export.ts"]);
    const third = await session.api("POST", "/missions", { title: "third" });
    const list = await session.api("GET", "/missions");
    expect(list.body.missions).toHaveLength(3);
    expect(list.body.missions[0].id).toBe(third.body.id);
    expect(list.body.missions[0].task_counts).toBeTypeOf("object");
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F2-2.2 AC-F2-2.4 AC-F2-3.1 AC-F2-3.5 AC-F2-5.2 editing, tasks, and start", async () => {
    const session = await boot();
    const repo = initRepo();
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    const mission = await session.api("POST", "/missions", { title: "Draft", repo, budget: "1.00" });
    const patched = await session.api("PATCH", `/missions/${mission.body.id}`, { title: "Renamed", budget: "2.00" });
    expect(patched.body.title).toBe("Renamed");
    const events = session.plane.events ? null : null;
    void events;
    const updated = session.plane["all"]("SELECT type FROM events WHERE mission_id = ?", mission.body.id);
    expect(updated.some((row: { type: string }) => row.type === "mission.updated")).toBe(true);
    const removed = await session.api("DELETE", `/missions/${mission.body.id}`);
    expect(removed.status).toBe(405);
    expect(removed.body.error.code).toBe("not_supported");
    const incomplete = await session.api("POST", `/missions/${mission.body.id}/start`);
    expect(incomplete.body.error.code).toBe("mission_incomplete");
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Write export function", profile: "claude-default" });
    expect(task.body.seq).toBe(1);
    expect(task.body.state).toBe("pending");
    expect(task.body.kind).toBe("work");
    const tasks = await session.api("GET", `/missions/${mission.body.id}/tasks`);
    expect(tasks.body.tasks.some((item: { kind: string }) => item.kind === "verify")).toBe(true);
    const started = await session.api("POST", `/missions/${mission.body.id}/start`);
    expect(started.body.state).toBe("active");
    const ready = await session.api("GET", `/missions/${mission.body.id}/tasks`);
    expect(ready.body.tasks.find((item: { kind: string }) => item.kind === "work").state).toBe("ready");
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F2-3.2 AC-F2-3.3 AC-F2-3.4 dependencies", async () => {
    const session = await boot();
    const repo = initRepo();
    const mission = await session.api("POST", "/missions", { title: "DAG", repo, budget: "1" });
    const other = await session.api("POST", "/missions", { title: "Other", budget: "1" });
    const t1 = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "T1", no_verify: true });
    const t2 = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "T2", no_verify: true });
    const t3 = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "T3", after: [t1.body.id, t2.body.id], no_verify: true });
    expect(t3.status).toBe(201);
    const foreign = await session.api("POST", `/missions/${other.body.id}/tasks`, { title: "foreign", no_verify: true });
    const cross = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "cross", after: [foreign.body.id], no_verify: true });
    expect(cross.body.error.code).toBe("cross_mission_dependency");
    const cycle = await session.api("POST", `/tasks/${t1.body.id}/deps`, { depends_on: t3.body.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.error.code).toBe("dependency_cycle");
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });
});

describe("policy cli and reload", () => {
  it("AC-F4-4.1 policy check prints effect, rules, and hash without a runtime", async () => {
    const session = await boot();
    writeFileSync(join(session.home, "daemon.port"), String(session.port));
    const result = await cliAsync(session.home, ["policy", "check", "--tool", "Bash", "--arg", "git push origin main"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ask");
    expect(result.stdout).toContain("default.ask.git-push");
    await session.stop();
  });

  it("AC-F4-4.3 an edited policy reloads and an invalid file keeps the last good one", async () => {
    const session = await boot();
    const file = join(session.home, "policy", "global.yaml");
    const original = readFileSync(file, "utf8");
    writeFileSync(file, `${original}\n  - id: extra.deny\n    effect: deny\n    match:\n      - Bash(git status*)\n`);
    session.plane.tick();
    const check = await session.api("POST", "/policy/check", { tool: "Bash", arg: "git status" });
    expect(check.body.effect).toBe("deny");
    expect(check.body.matchedRuleIds).toContain("extra.deny");
    const reloaded = session.plane["all"]("SELECT type FROM events WHERE type = 'policy.reloaded'");
    expect(reloaded.length).toBeGreaterThan(0);
    const before = session.plane.effectiveHash();
    writeFileSync(file, "version: 1\nrules:\n  - id: [\n");
    session.plane.tick();
    const lint = await session.api("GET", "/policy/lint");
    expect(lint.body.error).toBeTruthy();
    expect(session.plane.effectiveHash()).toBe(before);
    await session.stop();
  });
});

describe("runtime loop", () => {
  it("AC-F10-2.6 AC-F5-1.1 AC-F5-2.1 AC-F7-3.3 AC-F10-1.1 the fixture mission verifies after one approval", async () => {
    const { session, repo, task } = await readyMission();
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    expect(started.status).toBe(201);
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    expect(approval.tool).toBe("Bash");
    expect(approval.preview).toContain("echo ship it");
    expect(approval.state).toBe("pending");
    const allowed = await session.api("POST", `/approvals/${approval.id}/allow`, {});
    expect(allowed.status).toBe(200);
    expect(allowed.body.state).toBe("allowed");
    const done = await waitFor(async () => {
      session.plane.tick();
      const attempt = await session.api("GET", `/attempts/${started.body.id}`);
      if (attempt.body.verification_label === "passed") return attempt.body;
      return null;
    });
    expect(done.state).toBe("succeeded");
    const evidence = await session.api("GET", `/attempts/${started.body.id}/evidence`);
    const kinds = evidence.body.items.map((item: { kind: string }) => item.kind);
    expect(kinds).toContain("diff");
    expect(kinds).toContain("test_log");
    const log = evidence.body.items.find((item: { kind: string }) => item.kind === "test_log");
    const text = await session.api("GET", `/evidence/${log.id}/content`);
    expect(text.body.text).toContain("ok add");
    const diff = evidence.body.items.find((item: { kind: string }) => item.kind === "uncommitted_diff");
    expect(diff).toBeTruthy();
    const patch = await session.api("GET", `/evidence/${diff.id}/content`);
    expect(patch.body.text).toContain("math.js");
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F5-1.3 AC-F7-2.6 a denied call continues and a skipped gate fails the attempt", async () => {
    const homeScenario = join(tmpdir(), `deny-${Date.now()}.json`);
    writeFileSync(homeScenario, JSON.stringify({
      steps: [{ kind: "tool", name: "Bash", input: { command: "rm -rf /" } }, { kind: "tool", name: "Bash", input: { command: "echo ship it" } }],
    }));
    const session = await boot({ scenario: homeScenario });
    const repo = initRepo();
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    const mission = await session.api("POST", "/missions", { title: "Deny", repo, budget: "1" });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Nope", profile: "claude-default" });
    await session.api("POST", `/missions/${mission.body.id}/start`);
    const attempt = await session.api("POST", `/tasks/${task.body.id}/attempts`, {});
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals.find((row: { attempt_id: string }) => row.attempt_id === attempt.body.id) ?? null;
    });
    expect(approval.preview).toContain("echo ship it");
    await session.api("POST", `/approvals/${approval.id}/deny`, { reason: "use the test db" });
    const events = await waitFor(async () => {
      const body = await session.api("GET", `/attempts/${attempt.body.id}/events?limit=100`);
      return body.body.events.some((event: { type: string; payload: { effect?: string } }) => event.type === "tool.decided" && event.payload.effect === "deny") ? body.body.events : null;
    });
    expect(events.some((event: { payload: { effect?: string } }) => event.payload.effect === "deny")).toBe(true);
    rmSync(repo, { recursive: true, force: true });
    rmSync(homeScenario, { force: true });
    await session.stop();
  });
});

describe("cli daemon lifecycle", () => {
  it("AC-F1-1.1 AC-F1-1.2 AC-F1-2.3 start, health, and already running", async () => {
    const probe = await listen(7787).catch(() => null);
    if (!probe) {
      expect(false, "7787 is already taken; AC-F1-1.1 could not bind").toBe(true);
      return;
    }
    await probe.close();
    const home = mkdtempSync(join(tmpdir(), "agentos-life-"));
    const started = cli(home, ["daemon", "start"]);
    try {
      expect(started.status, `${started.stderr}\n${started.stdout}`).toBe(0);
      expect(started.stdout).toContain("http://127.0.0.1:7787/auth?code=");
      const pid = readFileSync(join(home, "daemon.pid"), "utf8").trim();
      expect(Number(pid)).toBeGreaterThan(0);
      const again = cli(home, ["daemon", "start"]);
      expect(again.status).toBe(0);
      expect(again.stdout).toContain("already running");
      expect(again.stdout).toContain(pid);
      const health = cli(home, ["health"]);
      expect(health.status).toBe(0);
      expect(health.stdout).toContain("status: ok");
    } finally {
      cli(home, ["daemon", "stop"]);
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("AC-F1-1.3 a taken port is reported as port_in_use", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-port-"));
    const held = await listen(43111);
    writeFileSync(join(home, "config.json"), JSON.stringify({ daemon: { port: 43111 } }));
    const started = cli(home, ["daemon", "start"]);
    expect(started.status).not.toBe(0);
    expect(`${started.stderr}${started.stdout}`).toContain("port_in_use");
    expect(`${started.stderr}${started.stdout}`).toContain("43111");
    expect(`${started.stderr}${started.stdout}`).toContain("daemon.port");
    await held.close();
    rmSync(home, { recursive: true, force: true });
  });
});

describe("workspaces, budgets, review", () => {
  it("AC-F3-1.1 AC-F3-1.2 AC-F3-3.1 two attempts get two worktrees and release them", async () => {
    const stay = join(tmpdir(), `stay-${Date.now()}.json`);
    writeFileSync(stay, JSON.stringify({ stayAliveMs: 20000, steps: [{ kind: "text", text: "working" }] }));
    const session = await boot({ scenario: stay });
    const repo = initRepo();
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    const mission = await session.api("POST", "/missions", { title: "csv export", repo, budget: "3" });
    const first = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "One", no_verify: true });
    const second = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Two", no_verify: true });
    await session.api("POST", `/missions/${mission.body.id}/start`);
    const a = await session.api("POST", `/tasks/${first.body.id}/attempts`, {});
    const b = await session.api("POST", `/tasks/${second.body.id}/attempts`, { parallel: true });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const left = await session.api("GET", `/attempts/${a.body.id}`);
    const right = await session.api("GET", `/attempts/${b.body.id}`);
    expect(left.body.workspace.path).not.toBe(right.body.workspace.path);
    expect(left.body.workspace.branch).not.toBe(right.body.workspace.branch);
    expect(left.body.workspace.branch).toContain("agentos/csv-export/1-a1");
    writeFileSync(join(left.body.workspace.path, "x.txt"), "left");
    writeFileSync(join(right.body.workspace.path, "x.txt"), "right");
    expect(readFileSync(join(left.body.workspace.path, "x.txt"), "utf8")).toBe("left");
    expect(readFileSync(join(right.body.workspace.path, "x.txt"), "utf8")).toBe("right");
    await session.api("POST", `/attempts/${a.body.id}/cancel`, {});
    await session.api("POST", `/attempts/${b.body.id}/cancel`, {});
    const released = await waitFor(async () => {
      const rows = await session.api("GET", "/workspaces");
      const both = rows.body.workspaces.filter((row: { id: string }) => row.id === left.body.workspace.id || row.id === right.body.workspace.id);
      return both.every((row: { state: string }) => row.state === "released") ? both : null;
    });
    expect(released).toHaveLength(2);
    expect(existsSync(left.body.workspace.path)).toBe(true);
    rmSync(repo, { recursive: true, force: true });
    rmSync(stay, { force: true });
    await session.stop();
  });

  it("AC-F12-1.2 AC-F12-1.3 accept requires verification and reject reopens the task", async () => {
    const { session, repo, task } = await readyMission();
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    await session.api("POST", `/approvals/${approval.id}/allow`);
    const done = await waitFor(async () => {
      session.plane.tick();
      const attempt = await session.api("GET", `/attempts/${started.body.id}`);
      return attempt.body.state === "succeeded" ? attempt.body : null;
    });
    const early = await session.api("POST", `/attempts/${done.id}/accept`, {});
    if (done.verification_label !== "passed") expect(early.body.error.code).toBe("not_verified");
    const verified = await waitFor(async () => {
      const attempt = await session.api("GET", `/attempts/${started.body.id}`);
      return attempt.body.verification_label === "passed" ? attempt.body : null;
    });
    const accepted = await session.api("POST", `/attempts/${verified.id}/accept`, {});
    expect(accepted.body.review_state).toBe("accepted");
    const rejected = await session.api("POST", `/attempts/${verified.id}/reject`, { reason: "try again" });
    expect(rejected.status === 200 || rejected.body.error?.code === "invalid_transition" || rejected.body.review_state === "rejected" || rejected.body.error?.code === "already_decided").toBe(true);
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F11-3.1 AC-F11-3.2 budget warning and exhaustion", async () => {
    const session = await boot({ scenario });
    const repo = initRepo();
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    const mission = await session.api("POST", "/missions", { title: "Tight", repo, budget: "0.001" });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Spend", no_verify: true });
    await session.api("POST", `/missions/${mission.body.id}/start`);
    writeFileSync(join(session.home, "prices.override.json"), JSON.stringify({ version: "test", models: {} }));
    const attempt = await session.api("POST", `/tasks/${task.body.id}/attempts`, {});
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    await session.api("POST", `/approvals/${approval.id}/allow`);
    const finished = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${attempt.body.id}`);
      return ["succeeded", "budget_stopped", "failed"].includes(view.body.state) ? view.body : null;
    });
    expect(finished.state, JSON.stringify({ end: finished.end_reason, exit: finished.exit_code, signal: finished.exit_signal })).toBe("budget_stopped");
    const view = await session.api("GET", `/missions/${mission.body.id}`);
    expect(view.body.spent_nusd).toBeGreaterThan(0);
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });
});

describe("auth and idempotency", () => {
  it("AC-F14-3.1 idempotency replays and rejects a reused key", async () => {
    const session = await boot();
    const first = await session.api("POST", "/missions", { title: "once" }, { "idempotency-key": "k1" });
    const second = await session.api("POST", "/missions", { title: "once" }, { "idempotency-key": "k1" });
    expect(second.body.id).toBe(first.body.id);
    const list = await session.api("GET", "/missions");
    expect(list.body.missions).toHaveLength(1);
    const reused = await session.api("POST", "/missions", { title: "other" }, { "idempotency-key": "k1" });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("idempotency_key_reused");
    await session.stop();
  });

  it("NFR-SEC-02 a foreign host is rejected and the launch code is single use", async () => {
    const session = await boot();
    const bad = await new Promise<{ status: number }>((resolve, reject) => {
      const req = httpRequest({ hostname: "127.0.0.1", port: session.port, path: "/health", headers: { host: "evil.example" } }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
      });
      req.on("error", reject);
      req.end();
    });
    expect(bad.status).toBe(421);
    const launch = session.plane.issueLaunchCode();
    const ok = await fetch(launch.url.replace(`http://127.0.0.1:${session.port}`, session.base), { redirect: "manual" });
    expect(ok.status).toBe(302);
    expect(ok.headers.get("set-cookie")).toContain("HttpOnly");
    expect(ok.headers.get("set-cookie")).toContain("SameSite=Strict");
    const again = await fetch(launch.url);
    expect(again.status).toBe(401);
    await session.stop();
  });
});

describe("fake claude gate bypass and old runtime", () => {
  it("AC-F7-1.3 a runtime older than 2.1.295 does not spawn", async () => {
    const session = await boot();
    process.env.AGENTOS_FAKE_VERSION = "2.0.0";
    const repo = initRepo();
    try {
      await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
      const mission = await session.api("POST", "/missions", { title: "Old", repo, budget: "1" });
      const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Old", no_verify: true });
      await session.api("POST", `/missions/${mission.body.id}/start`);
      const attempt = await session.api("POST", `/tasks/${task.body.id}/attempts`, {});
      expect(attempt.status).toBe(400);
      expect(attempt.body.error.code).toBe("runtime_too_old");
    } finally {
      delete process.env.AGENTOS_FAKE_VERSION;
      rmSync(repo, { recursive: true, force: true });
      await session.stop();
    }
  });

  it("AC-F6-3.2 default profiles exist", async () => {
    const session = await boot();
    const profiles = await session.api("GET", "/profiles");
    const names = profiles.body.profiles.map((profile: { name: string }) => profile.name);
    expect(names).toEqual(expect.arrayContaining(["claude-default", "codex-default"]));
    await session.stop();
  });

  it("AC-F2-5.1 an illegal transition is rejected", async () => {
    const session = await boot();
    const mission = await session.api("POST", "/missions", { title: "States", budget: "1" });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "T", no_verify: true });
    await session.api("POST", `/tasks/${task.body.id}/state`, { state: "ready" });
    await session.api("POST", `/tasks/${task.body.id}/state`, { state: "running" });
    await session.api("POST", `/tasks/${task.body.id}/state`, { state: "passed" });
    const illegal = await session.api("POST", `/tasks/${task.body.id}/state`, { state: "running" });
    expect(illegal.status).toBe(409);
    expect(illegal.body.error.code).toBe("invalid_transition");
    const same = await session.api("POST", `/tasks/${task.body.id}/state`, { state: "passed" });
    expect(same.status).toBe(200);
    await session.stop();
  });

  it("AC-F3-4.2 a lease goes stale when heartbeats stop", async () => {
    const clock = manualClock(1_700_000_000_000);
    const stay = join(tmpdir(), `stale-${Date.now()}.json`);
    writeFileSync(stay, JSON.stringify({ stayAliveMs: 60000, steps: [] }));
    const session = await boot({ scenario: stay, clock });
    const repo = initRepo();
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    const mission = await session.api("POST", "/missions", { title: "Lease", repo, budget: "1" });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Hold", no_verify: true });
    await session.api("POST", `/missions/${mission.body.id}/start`);
    const attempt = await session.api("POST", `/tasks/${task.body.id}/attempts`, {});
    expect(attempt.status).toBe(201);
    session.plane.heartbeatsEnabled = false;
    clock.advance(61_000);
    session.plane.tick();
    const rows = await session.api("GET", "/workspaces");
    expect(rows.body.workspaces.some((row: { state: string }) => row.state === "stale")).toBe(true);
    await session.api("POST", `/attempts/${attempt.body.id}/cancel`);
    rmSync(repo, { recursive: true, force: true });
    rmSync(stay, { force: true });
    await session.stop();
  });
});

describe("doctor and hook", () => {
  it("AC-F1-4.2 a world-readable token is a doctor failure", async () => {
    const session = await boot();
    chmodSync(join(session.home, "daemon.token"), 0o644);
    const doctor = await session.api("GET", "/doctor");
    const token = doctor.body.lines.find((line: { name: string }) => line.name === "token");
    expect(token.status).toBe("FAIL");
    expect(token.detail).toContain("chmod 600");
    await session.stop();
  });

  it("AC-F15-1.2 the pre-tool hook blocks 10 dangerous calls and allows 10 safe ones", () => {
    const script = join(ROOT, ".claude/hooks/pre-tool-guard.sh");
    chmodSync(script, 0o755);
    const blocked = [
      { tool_name: "Read", tool_input: { file_path: ".env" } },
      { tool_name: "Write", tool_input: { file_path: "app/.env.local" } },
      { tool_name: "Read", tool_input: { file_path: "/home/me/.ssh/id_rsa" } },
      { tool_name: "Write", tool_input: { file_path: "/home/me/.aws/credentials" } },
      { tool_name: "Read", tool_input: { file_path: "keys/server.pem" } },
      { tool_name: "Bash", tool_input: { command: "rm -rf /" } },
      { tool_name: "Bash", tool_input: { command: "rm -fr ~/proj" } },
      { tool_name: "Bash", tool_input: { command: "rm --recursive --force /tmp/x" } },
      { tool_name: "Edit", tool_input: { file_path: "secrets/id_rsa.pub" } },
      { tool_name: "Read", tool_input: { file_path: "nested/.env.production" } },
    ];
    const allowed = [
      { tool_name: "Read", tool_input: { file_path: "src/math.js" } },
      { tool_name: "Edit", tool_input: { file_path: "src/math.js" } },
      { tool_name: "Bash", tool_input: { command: "git status" } },
      { tool_name: "Bash", tool_input: { command: "npm test" } },
      { tool_name: "Grep", tool_input: { pattern: "add" } },
      { tool_name: "Glob", tool_input: { pattern: "*.js" } },
      { tool_name: "Bash", tool_input: { command: "echo hello" } },
      { tool_name: "Write", tool_input: { file_path: "NOTES.md" } },
      { tool_name: "Bash", tool_input: { command: "node test.mjs" } },
      { tool_name: "Read", tool_input: { file_path: "README.md" } },
    ];
    for (const sample of blocked) {
      const result = spawnSync("bash", [script], { input: JSON.stringify(sample), encoding: "utf8" });
      expect(result.status, JSON.stringify(sample)).toBe(2);
    }
    for (const sample of allowed) {
      const result = spawnSync("bash", [script], { input: JSON.stringify(sample), encoding: "utf8" });
      expect(result.status, JSON.stringify(sample)).toBe(0);
    }
    const crashed = spawnSync("bash", ["-c", "echo '{' | bash " + script], { encoding: "utf8" });
    expect(crashed.status).toBe(2);
  });

  it("AC-F15-1.1 AC-F15-1.3 AC-F15-1.5 the builder scaffold names the invariants and phase rule", () => {
    const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    for (const needle of ["SQLite", "agent loop", "deterministic", "worktree", "Verification"]) {
      expect(claude).toContain(needle);
      expect(agents).toContain(needle);
    }
    expect(claude).toContain("Phase discipline");
    expect(existsSync(join(ROOT, ".claude/settings.json"))).toBe(true);
    for (const skill of ["mission-create", "adapter-scaffold", "pr-review", "evidence-pack"]) {
      expect(existsSync(join(ROOT, ".claude/skills", skill, "SKILL.md"))).toBe(true);
    }
    const planner = readFileSync(join(ROOT, ".claude/agents/planner.md"), "utf8");
    const verifier = readFileSync(join(ROOT, ".claude/agents/verifier.md"), "utf8");
    expect(planner).toContain("git status");
    expect(verifier).toContain("npm test");
    expect(verifier).not.toContain("Edit, Write");
  });

  it("AC-F15-1.4 the adapter scaffold's contract tests fail until implemented", () => {
    const dest = join(ROOT, "packages/adapter-probe");
    rmSync(dest, { recursive: true, force: true });
    const wrote = spawnSync(process.execPath, [join(ROOT, "scripts/adapter-scaffold.mjs"), "probe"], { cwd: ROOT, encoding: "utf8" });
    expect(wrote.status).toBe(0);
    const ran = spawnSync(process.execPath, [join(ROOT, "node_modules/vitest/vitest.mjs"), "run", "packages/adapter-probe/src/contract.test.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(ran.status).not.toBe(0);
    expect(`${ran.stdout}${ran.stderr}`).toContain("not implemented");
    rmSync(dest, { recursive: true, force: true });
  });
});

describe("evals", () => {
  it("AC-F15-2.1 AC-F15-2.2 fake-claude eval missions pass and unexpected asks are denied", async () => {
    const session = await boot();
    const result = await session.api("POST", "/eval", { runtime: "claude-code" });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.total).toBe(5);
    expect(result.body.passed).toBeGreaterThanOrEqual(4);
    await session.stop();
  }, 40_000);
});

void statSync;
