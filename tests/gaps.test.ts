import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentError, inputHash, manualClock, sha256Hex } from "@agentos/core";
import { claudeSettings } from "@agentos/adapter-claude-code";
import { describe, expect, it } from "vitest";
import { ControlPlane } from "../apps/daemon/src/control.ts";
import { FAKE_CLAUDE, FAKE_CODEX, ROOT, boot, cli, initRepo, waitFor } from "./support.ts";

const scenarioPath = join(ROOT, "fixtures/scenarios/fix-test.json");

function writeScenario(body: unknown): string {
  const path = join(tmpdir(), `agentos-sc-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(body));
  return path;
}

function rows(plane: ControlPlane, sql: string, ...params: unknown[]): Record<string, any>[] {
  return plane.db.prepare(sql).all(...params) as Record<string, any>[];
}

async function missionReady(session: Awaited<ReturnType<typeof boot>>, title: string, opts: { noVerify?: boolean; criteria?: string[]; test?: string } = {}) {
  const repo = initRepo();
  await session.api("POST", "/repos", { path: repo, test_command: opts.test ?? "node test.mjs" });
  const mission = await session.api("POST", "/missions", { title, repo, budget: "5", criteria: opts.criteria ?? ["npm test passes"] });
  const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Work", no_verify: Boolean(opts.noVerify) });
  await session.api("POST", `/missions/${mission.body.id}/start`);
  return { repo, mission: mission.body, task: task.body };
}

function readStdin(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function openStream(url: string, token: string, headers: Record<string, string> = {}) {
  let buf = "";
  const req = httpRequest(url, { headers: { authorization: `Bearer ${token}`, accept: "text/event-stream", ...headers } }, (res) => {
    res.on("data", (chunk) => {
      buf += chunk.toString();
    });
  });
  req.on("error", () => undefined);
  req.end();
  return {
    text: () => buf,
    close: () => req.destroy(),
  };
}

describe("codex fake runtime", () => {
  it("AC-F8-1.1 AC-F8-1.2 AC-F8-2.1 AC-F8-2.3 AC-F8-2.4 AC-F8-3.1 AC-F6-1.3 AC-F6-2.3 AC-F5-1.4 AC-F11-1.2 Codex is gated in the worktree and priced from the table", async () => {
    const scenario = writeScenario({
      steps: [
        { kind: "command", command: "git status" },
        { kind: "command", command: "rm -rf /" },
        { kind: "raw", message: { jsonrpc: "2.0", method: "item/not-a-real-method", params: {} } },
        { kind: "ungated", command: "ls" },
        { kind: "command", command: "echo ship it" },
        { kind: "file", paths: ["src/math.js"] },
        { kind: "file", paths: ["/etc/passwd"] },
      ],
      usage: { input_tokens: 1000, output_tokens: 500, cached_input_tokens: 100, model: "gpt-test" },
    });
    const session = await boot({ codexScenario: scenario });
    writeFileSync(
      join(session.home, "prices.override.json"),
      JSON.stringify({
        version: "test-prices",
        models: {
          "gpt-test": {
            input_per_million_nano: 1_000_000_000,
            output_per_million_nano: 2_000_000_000,
            cache_read_per_million_nano: 100_000_000,
            source_url: "https://example.test/prices",
            retrieved_on: "2026-01-01",
          },
        },
      }),
    );
    session.plane.loadPrices();
    await session.api("PATCH", "/profiles/codex-default", { model: "gpt-test" });
    const { repo, mission, task } = await missionReady(session, "Codex export", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, { profile: "codex-default" });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals.find((row: { preview: string }) => row.preview.includes("echo ship it")) ?? null;
    });
    const view = await session.api("GET", `/attempts/${started.body.id}`);
    expect(view.body.warnings.map((item: { code: string }) => item.code)).toContain("partially_gated");
    expect(view.body.workspace.path).toContain(session.home);
    const stdin = readStdin(join(view.body.workspace.path, ".agentos-codex-stdin.jsonl"));
    const thread = stdin.find((line) => line.method === "thread/start");
    expect(thread.params.cwd).toBe(view.body.workspace.path);
    expect(thread.params.sandbox).toBe("workspace-write");
    expect(thread.params.approvalPolicy).toBe("untrusted");
    const turn = stdin.find((line) => line.method === "turn/start");
    expect(turn.params.prompt).toContain("Codex export");
    expect(turn.params.approvalPolicy).toBe("untrusted");
    const stat = readFileSync(`/proc/${view.body.pid}/stat`, "utf8");
    const pgrp = Number(stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[2]);
    expect(pgrp).toBe(view.body.pid);
    const events = await session.api("GET", `/attempts/${started.body.id}/events?limit=100`);
    const git = rows(session.plane, "SELECT effect FROM gate_decisions WHERE attempt_id = ? AND arg = ?", started.body.id, "git status");
    expect(git.length).toBeGreaterThan(0);
    expect(git.every((row) => row.effect === "allow")).toBe(true);
    expect(rows(session.plane, "SELECT id FROM approvals WHERE attempt_id = ? AND preview = ?", started.body.id, "git status")).toHaveLength(0);
    expect(
      events.body.events.some(
        (event: { type: string; payload: { effect?: string; tool?: string } }) =>
          event.type === "tool.decided" && event.payload.effect === "allow" && event.payload.tool === "Bash",
      ),
    ).toBe(true);
    expect(events.body.events.some((event: { type: string; payload: { gated?: boolean } }) => event.type === "tool.completed" && event.payload.gated === false)).toBe(true);
    expect(events.body.events.some((event: { type: string }) => event.type === "adapter.unknown")).toBe(true);
    const decisions = stdin.filter((line) => line.result?.decision);
    expect(decisions.map((line) => line.result.decision)).toEqual(expect.arrayContaining(["accept", "decline"]));
    expect(decisions.some((line) => line.result.decision === "acceptForSession")).toBe(false);
    await session.api("POST", `/approvals/${approval.id}/allow`);
    const done = await waitFor(async () => {
      session.plane.tick();
      const current = await session.api("GET", `/attempts/${started.body.id}`);
      return current.body.state === "succeeded" ? current.body : null;
    });
    const after = readStdin(join(view.body.workspace.path, ".agentos-codex-stdin.jsonl"));
    const replies = after.filter((line) => line.result?.decision).map((line) => line.result.decision);
    expect(replies).toContain("accept");
    expect(replies).toContain("decline");
    expect(replies).not.toContain("acceptForSession");
    const usage = rows(session.plane, "SELECT * FROM usage WHERE attempt_id = ?", started.body.id);
    expect(usage).toHaveLength(1);
    expect(usage[0].input_tokens).toBe(1000);
    expect(usage[0].output_tokens).toBe(500);
    expect(usage[0].cache_read_tokens).toBe(100);
    expect(usage[0].cost_source).toBe("estimated");
    expect(usage[0].price_table_version).toBe("test-prices");
    expect(Number(usage[0].cost_nusd)).toBe(2_010_000);
    expect(done.cost).toContain("estimated");
    expect(done.cost).not.toContain("$0.00");
    const pack = await session.api("GET", `/attempts/${started.body.id}/evidence`);
    expect(pack.body.markdown).toContain("partially gated");
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
    await session.stop();
  });

  it("AC-F8-2.3 a cancelled Codex approval is answered with cancel before the process stops", async () => {
    const scenario = writeScenario({ steps: [{ kind: "command", command: "npm install lodash" }] });
    const session = await boot({ codexScenario: scenario, config: { attempts: { cancel_grace_s: 1 } } });
    const { repo, task } = await missionReady(session, "Cancel codex", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, { profile: "codex-default" });
    const approval = await waitFor(async () => {
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    const view = await session.api("GET", `/attempts/${started.body.id}`);
    const cancelled = await session.api("POST", `/attempts/${started.body.id}/cancel`, {});
    expect(cancelled.body.state).toBe("cancelled");
    const stdin = readStdin(join(view.body.workspace.path, ".agentos-codex-stdin.jsonl"));
    expect(stdin.some((line) => line.id === Number(approval.tool) || line.result?.decision === "cancel")).toBe(true);
    expect(stdin.some((line) => line.result?.decision === "cancel")).toBe(true);
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
    await session.stop();
  });

  it("AC-F8-1.3 AC-F8-3.2 missing app server fails closed unless the profile is ungated, and missing usage is unknown", async () => {
    const blocked = writeScenario({ appServer: false, steps: [{ kind: "command", command: "ls" }] });
    const session = await boot({ codexScenario: blocked });
    const { repo, task, mission } = await missionReady(session, "No app server", { noVerify: true });
    const refused = await session.api("POST", `/tasks/${task.id}/attempts`, { profile: "codex-default" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("codex_app_server_unavailable");
    await session.api("PATCH", "/profiles/codex-default", { allow_ungated: true });
    const second = await session.api("POST", `/missions/${mission.id}/tasks`, { title: "Fallback", no_verify: true });
    const started = await session.api("POST", `/tasks/${second.body.id}/attempts`, { profile: "codex-default" });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const done = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return ["succeeded", "failed"].includes(view.body.state) ? view.body : null;
    });
    expect(done.gated).toBe("none");
    expect(done.warnings.map((item: { code: string }) => item.code)).toContain("ungated");
    expect(done.state).toBe("succeeded");
    const quiet = writeScenario({ steps: [{ kind: "ungated", command: "ls" }] });
    session.plane.config.runtimes.codex.scenario = quiet;
    const third = await session.api("POST", `/missions/${mission.id}/tasks`, { title: "No usage", no_verify: true });
    const unknown = await session.api("POST", `/tasks/${third.body.id}/attempts`, { profile: "codex-default" });
    const finished = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${unknown.body.id}`);
      return view.body.state === "succeeded" ? view.body : null;
    });
    expect(finished.cost).toBe("unknown");
    expect(finished.cost).not.toContain("0.00");
    rmSync(repo, { recursive: true, force: true });
    rmSync(blocked, { force: true });
    rmSync(quiet, { force: true });
    await session.stop();
  });
});

describe("events", () => {
  it("AC-F9-1.1 AC-F9-1.2 AC-F9-1.3 AC-F9-2.1 AC-F9-2.2 AC-F9-2.3 AC-F9-2.4 AC-F9-3.1 AC-F9-3.2 transitions, replay, heartbeat, and resync", async () => {
    const clock = manualClock(1_700_000_000_000);
    const session = await boot({ clock, config: { events: { sse_heartbeat_s: 15 } } });
    const before = rows(session.plane, "SELECT COUNT(*) AS n FROM events")[0].n;
    const bad = await session.api("POST", "/missions", { title: "" });
    expect(bad.status).toBe(400);
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM events")[0].n).toBe(before);
    const created = await session.api("POST", "/missions", { title: "Timeline" });
    const createdEvents = rows(session.plane, "SELECT * FROM events WHERE mission_id = ? AND type = 'mission.created'", created.body.id);
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].id).toBeGreaterThan(0);
    expect(createdEvents[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(createdEvents[0].actor).toBe("user");
    expect(JSON.parse(createdEvents[0].payload).title).toBe("Timeline");
    const big = "x".repeat(70_000);
    const rawId = session.plane.emit("custom.envelope", { actor: "daemon", missionId: created.body.id }, { ok: true }, big);
    const stored = rows(session.plane, "SELECT * FROM events WHERE id = ?", rawId)[0];
    expect(stored.type).toBe("adapter.unknown");
    expect(stored.raw).toBeNull();
    expect(stored.raw_blob_sha256).toBe(sha256Hex(big));
    const secret = "AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz";
    session.plane.emit("agent.message", { actor: "runtime", missionId: created.body.id }, { text: secret }, secret);
    const listed = await session.api("GET", `/missions/${created.body.id}`);
    expect(listed.body.title).toBe("Timeline");
    const stream = openStream(`${session.base}/events/stream`, session.plane.token());
    await waitFor(async () => (stream.text().includes("mission.created") ? stream.text() : null));
    const last = [...stream.text().matchAll(/^id: (\d+)$/gm)].at(-1)?.[1];
    const more = await session.api("POST", "/missions", { title: "Second" });
    await waitFor(async () => (stream.text().includes(more.body.id) ? stream.text() : null));
    stream.close();
    const replay = openStream(`${session.base}/events/stream`, session.plane.token(), { "last-event-id": String(last) });
    await waitFor(async () => (replay.text().includes("Second") ? replay.text() : null));
    expect(replay.text()).not.toContain("Timeline");
    const ids = [...replay.text().matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    replay.close();
    session.plane.pulseSse();
    const quiet = openStream(`${session.base}/events/stream`, session.plane.token());
    await waitFor(async () => (quiet.text().includes("event: message") ? quiet.text() : null));
    const mark = quiet.text().length;
    session.plane.pulseSse();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(quiet.text().slice(mark)).not.toContain(": heartbeat");
    clock.advance(15_000);
    session.plane.pulseSse();
    await waitFor(async () => (quiet.text().includes(": heartbeat") ? quiet.text() : null));
    quiet.close();
    const backlog = openStream(`${session.base}/events/stream?last=0`, session.plane.token());
    session.plane.db.exec("BEGIN");
    const insert = session.plane.db.prepare(
      "INSERT INTO events (ts, type, mission_id, task_id, attempt_id, actor, payload, raw, raw_blob_sha256) VALUES (?, 'adapter.unknown', NULL, NULL, NULL, 'daemon', '{}', NULL, NULL)",
    );
    for (let i = 0; i < 1001; i++) insert.run(new Date(clock.now()).toISOString());
    session.plane.db.exec("COMMIT");
    backlog.close();
    const flooded = openStream(`${session.base}/events/stream?last=0`, session.plane.token());
    await waitFor(async () => (flooded.text().includes("event: resync") ? flooded.text() : null));
    expect(flooded.text()).toContain("event: resync");
    flooded.close();
    const repo = initRepo();
    const mission = await session.api("POST", "/missions", { title: "Paged", repo, budget: "1" });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "T", no_verify: true });
    session.plane.db
      .prepare(
        "INSERT INTO attempts (id, task_id, seq, runtime, profile_snapshot, state, gated, gate_token, created_at, review_state) VALUES (?, ?, 1, 'claude-code', '{}', 'succeeded', 'all', 'tok', ?, 'none')",
      )
      .run("att-page", task.body.id, new Date(clock.now()).toISOString());
    session.plane.emit("agent.message", { actor: "runtime", attemptId: "att-page", missionId: mission.body.id, taskId: task.body.id }, { text: secret }, secret);
    session.plane.emit("agent.message", { actor: "runtime", attemptId: "att-page", missionId: mission.body.id, taskId: task.body.id }, { text: "second line" }, "second line");
    const firstPage = await session.api("GET", "/attempts/att-page/events?limit=1");
    expect(firstPage.body.events).toHaveLength(1);
    expect(JSON.stringify(firstPage.body.events[0].payload)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(JSON.stringify(firstPage.body.events[0].payload)).toContain("[REDACTED]");
    const nextPage = await session.api("GET", `/attempts/att-page/events?after=${firstPage.body.events[0].id}&limit=10&raw=1`);
    expect(nextPage.body.events.map((event: { payload: { text?: string } }) => event.payload.text)).toContain("second line");
    const rawEvent = nextPage.body.events.find((event: { raw?: string }) => String(event.raw || "").includes("AWS_SECRET"));
    const masked = await session.api("GET", "/attempts/att-page/events?raw=1");
    expect(masked.body.events.some((event: { raw?: string }) => String(event.raw || "").includes("abcdefghijklmnopqrstuvwxyz"))).toBe(true);
    expect(rawEvent || masked.body.events[0]).toBeTruthy();
    const kept = await session.api("POST", "/missions", { title: "Keep me" });
    const keptCount = rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE mission_id = ?", kept.body.id)[0].n;
    const dry = await session.api("POST", "/gc", { dry_run: true, yes: false });
    expect(dry.body.top_missions.length).toBeGreaterThan(0);
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE mission_id = ?", created.body.id)[0].n).toBeGreaterThan(0);
    await session.api("POST", `/missions/${created.body.id}/archive`);
    await session.api("POST", "/gc", { yes: true, dry_run: false });
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE mission_id = ?", created.body.id)[0].n).toBe(0);
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE mission_id = ?", kept.body.id)[0].n).toBe(keptCount);
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });
});

describe("evidence export and verification", () => {
  it("AC-F10-1.2 AC-F10-1.3 AC-F10-1.4 AC-F10-2.1 AC-F10-2.2 AC-F10-2.3 AC-F10-2.4 AC-F10-2.5 AC-F10-3.1 AC-F10-3.2 AC-F10-3.3 AC-F10-4.1 AC-F7-3.1 stores, verifies, and exports the pack", async () => {
    const session = await boot({ scenario: scenarioPath });
    const repo = initRepo();
    process.env.ONLY_THIS = "yes";
    process.env.SECRET_LEAK = "should-not-leak";
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    session.plane.db
      .prepare("UPDATE repos SET test_command = ?, test_env_allowlist = ?, junit_path = ? WHERE root_path = ?")
      .run(
        "node -e \"require('node:fs').writeFileSync('src/out.txt','ok'); require('node:fs').writeFileSync('junit.xml','<testsuite tests=\\\"1\\\" failures=\\\"0\\\"></testsuite>'); console.log((process.env.ONLY_THIS||'')+':'+(process.env.SECRET_LEAK||''))\"",
        JSON.stringify(["ONLY_THIS"]),
        "junit.xml",
        repo,
      );
    const mission = await session.api("POST", "/missions", {
      title: "Pack",
      repo,
      budget: "5",
      criteria: ["file src/out.txt exists", "command \"node -e 'process.exit(0)'\" exits 0"],
    });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "Fix" });
    await session.api("POST", `/missions/${mission.body.id}/start`);
    const started = await session.api("POST", `/tasks/${task.body.id}/attempts`, {});
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    await session.api("POST", `/approvals/${approval.id}/allow`);
    const done = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.verification_label === "passed" ? view.body : null;
    });
    const events = await session.api("GET", `/attempts/${done.id}/events?limit=200`);
    const types = events.body.events.map((event: { type: string }) => event.type);
    expect(types).toEqual(expect.arrayContaining(["attempt.started", "tool.requested", "tool.completed", "attempt.result", "verify.command"]));
    const verify = events.body.events.find((event: { type: string }) => event.type === "verify.command");
    expect(verify.payload.command).toContain("ONLY_THIS");
    expect(rows(session.plane, "SELECT id FROM gate_decisions WHERE attempt_id = ? AND arg LIKE '%ONLY_THIS%'", done.id)).toHaveLength(0);
    const log = rows(session.plane, "SELECT sha256 FROM evidence WHERE attempt_id = ? AND kind = 'test_log'", done.id)[0];
    const logText = readFileSync(join(session.home, "blobs", log.sha256.slice(0, 2), log.sha256), "utf8");
    expect(logText).toContain("yes:");
    expect(logText).not.toContain("should-not-leak");
    const junit = rows(session.plane, "SELECT meta FROM evidence WHERE attempt_id = ? AND kind = 'junit'", done.id)[0];
    expect(JSON.parse(junit.meta).tests).toBe(1);
    const head = spawnSync("git", ["-C", done.workspace.path, "log", "-1", "--format=%an%n%ae%n%s"], { encoding: "utf8" }).stdout;
    expect(head).toContain("AgentOS");
    expect(head).toContain("agentos@localhost");
    expect(head).toContain(`agentos: snapshot of uncommitted changes (attempt ${done.id})`);
    const mainFile = spawnSync("git", ["-C", repo, "show", "main:src/math.js"], { encoding: "utf8" }).stdout;
    expect(mainFile).toContain("a - b");
    const blob = rows(session.plane, "SELECT sha256 FROM evidence WHERE attempt_id = ? AND kind = 'diff'", done.id)[0];
    const blobPath = join(session.home, "blobs", blob.sha256.slice(0, 2), blob.sha256);
    expect(statSync(blobPath).mode & 0o777).toBe(0o444);
    const again = session.plane.db.prepare("SELECT COUNT(*) AS n FROM evidence WHERE sha256 = ?").get(blob.sha256) as { n: number };
    expect(again.n).toBeGreaterThan(0);
    const pack = await session.api("GET", `/attempts/${done.id}/evidence`);
    expect(pack.body.markdown).toContain("Pack");
    expect(pack.body.markdown).toContain(done.workspace.branch);
    expect(pack.body.markdown).toContain("fully gated");
    expect(pack.body.markdown).toContain(done.workspace.path);
    expect(pack.body.items.map((item: { kind: string }) => item.kind)).toEqual(expect.arrayContaining(["diff", "test_log", "junit", "transcript_ref", "evidence_md"]));
    const out = join(session.home, "pack.tar.gz");
    const exported = await session.api("POST", `/attempts/${done.id}/evidence/export`, { out, redact: true });
    expect(exported.status, JSON.stringify(exported.body)).toBe(200);
    expect(exported.body.path).toBe(out);
    const names = spawnSync("tar", ["-tzf", out], { encoding: "utf8" }).stdout;
    for (const name of ["evidence.md", "diff.patch", "uncommitted.patch", "test.log", "junit.xml", "transcript.jsonl", "manifest.json"]) {
      expect(names).toContain(name);
    }
    const manifest = JSON.parse(spawnSync("tar", ["-xOzf", out, "./manifest.json"], { encoding: "utf8" }).stdout);
    const transcript = spawnSync("tar", ["-xOzf", out, "./transcript.jsonl"], { encoding: "utf8" }).stdout;
    expect(manifest.files.find((file: { name: string }) => file.name === "transcript.jsonl").sha256).toBe(sha256Hex(transcript));
    const state = rows(session.plane, "SELECT state FROM attempts WHERE id = ?", done.id)[0].state;
    rmSync(done.log_path, { force: true });
    expect(rows(session.plane, "SELECT state FROM attempts WHERE id = ?", done.id)[0].state).toBe(state);
    chmodSync(blobPath, 0o644);
    writeFileSync(blobPath, "corrupt");
    const doctor = await session.api("GET", "/doctor");
    expect(doctor.body.lines.some((line: { detail: string }) => line.detail.includes("evidence_corrupt"))).toBe(true);
    const sizes = await session.api("POST", "/gc", { dry_run: true });
    expect(sizes.body.blobs_bytes).toBeGreaterThan(0);
    expect(sizes.body.top_missions[0].id).toBeTruthy();
    delete process.env.ONLY_THIS;
    delete process.env.SECRET_LEAK;
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F10-2.2 a failing test command labels the attempt verification_failed", async () => {
    const session = await boot({ scenario: scenarioPath });
    const { repo, task } = await missionReady(session, "Red tests", { test: "node -e \"process.exit(3)\"" });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const approval = await waitFor(async () => {
      session.plane.tick();
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    await session.api("POST", `/approvals/${approval.id}/allow`);
    const done = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.verification_label === "verification_failed" ? view.body : null;
    });
    expect(done.verification_label).toBe("verification_failed");
    const verifyTask = rows(session.plane, "SELECT state FROM tasks WHERE kind = 'verify' AND verifies_task_id = ?", task.id)[0];
    expect(verifyTask.state).toBe("failed");
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });
});

describe("workspaces, queue, and reattach", () => {
  it("AC-F3-1.4 AC-F3-1.5 AC-F3-2.1 AC-F3-2.2 AC-F3-2.3 AC-F3-3.2 AC-F3-3.3 AC-F3-3.4 AC-F3-3.5 AC-F3-4.1 branches, leases, and removal", async () => {
    const clock = manualClock(1_700_000_000_000);
    const stay = writeScenario({ stayAliveMs: 20000, steps: [{ kind: "text", text: "working" }] });
    const session = await boot({ scenario: stay, clock, config: { attempts: { cancel_grace_s: 1 } } });
    const overlap = join(session.home, "worktrees");
    spawnSync("git", ["init", "-b", "main"], { cwd: overlap });
    spawnSync("git", ["config", "user.email", "test@localhost"], { cwd: overlap });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: overlap });
    writeFileSync(join(overlap, "README"), "x");
    spawnSync("git", ["add", "-A"], { cwd: overlap });
    spawnSync("git", ["commit", "-m", "init"], { cwd: overlap });
    const blocked = await session.api("POST", "/repos", { path: overlap });
    const blockedMission = await session.api("POST", "/missions", { title: "Overlap", repo: overlap, budget: "1" });
    const blockedTask = await session.api("POST", `/missions/${blockedMission.body.id}/tasks`, { title: "Nope", no_verify: true });
    await session.api("POST", `/missions/${blockedMission.body.id}/start`);
    const overlapStart = await session.api("POST", `/tasks/${blockedTask.body.id}/attempts`, {});
    expect(overlapStart.body.error.code).toBe("path_overlap");
    const repo = initRepo();
    writeFileSync(join(repo, "dirty.txt"), "local");
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    spawnSync("git", ["-C", repo, "branch", "agentos/dirty-main/1-a1"], { encoding: "utf8" });
    const mission = await session.api("POST", "/missions", { title: "Dirty main", repo, budget: "2" });
    const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title: "One", no_verify: true });
    await session.api("POST", `/missions/${mission.body.id}/start`);
    const started = await session.api("POST", `/tasks/${task.body.id}/attempts`, {});
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const view = await session.api("GET", `/attempts/${started.body.id}`);
    expect(view.body.base_dirty).toBe(1);
    expect(view.body.warnings.map((item: { code: string }) => item.code)).toContain("base_dirty");
    expect(view.body.workspace.branch).toBe("agentos/dirty-main/1-a1-2");
    const leased = await session.api("POST", `/workspaces/${view.body.workspace.id}/remove`, {});
    expect(leased.body.error.code).toBe("workspace_leased");
    expect(() => session.plane.lease(view.body.workspace.id, "someone-else")).toThrow(AgentError);
    try {
      session.plane.lease(view.body.workspace.id, "someone-else");
    } catch (error) {
      expect((error as AgentError).code).toBe("lease_conflict");
      expect((error as AgentError).details.holder).toBe(started.body.id);
    }
    const repoId = view.body.workspace.repo_id;
    expect(() =>
      session.plane.db
        .prepare(
          "INSERT INTO workspaces (id, repo_id, path, branch, base_commit, state, lease_attempt_id, created_at) VALUES (?, ?, ?, ?, ?, 'leased', ?, ?)",
        )
        .run("ws-dup", repoId, join(session.home, "dup"), "other-branch", "abc", started.body.id, new Date(clock.now()).toISOString()),
    ).toThrow(/UNIQUE|constraint/i);
    clock.advance(15_000);
    session.plane.tick();
    const extended = rows(session.plane, "SELECT lease_expires_at FROM workspaces WHERE id = ?", view.body.workspace.id)[0];
    expect(Date.parse(extended.lease_expires_at)).toBe(clock.now() + 60_000);
    await session.api("POST", `/attempts/${started.body.id}/cancel`, {});
    const released = await waitFor(async () => {
      const rowsBody = await session.api("GET", "/workspaces");
      const row = rowsBody.body.workspaces.find((item: { id: string }) => item.id === view.body.workspace.id);
      return row?.state === "released" ? row : null;
    });
    const preview = await session.api("POST", "/gc", { older_than_ms: 0, dry_run: true });
    expect(preview.body.would_remove.map((item: { id: string }) => item.id)).toContain(released.id);
    expect(preview.body.would_remove.find((item: { id: string }) => item.id === released.id).bytes).toBeGreaterThan(0);
    const held = await session.api("POST", "/gc", { older_than_ms: 0, yes: false });
    expect(held.body.removed ?? []).toEqual([]);
    expect(existsSync(released.path)).toBe(true);
    writeFileSync(join(released.path, "extra.txt"), "keep");
    const dirty = await session.api("POST", `/workspaces/${released.id}/remove`, {});
    expect(dirty.body.error.code).toBe("workspace_dirty");
    const forced = await session.api("POST", `/workspaces/${released.id}/remove`, { force: true });
    expect(forced.body.state).toBe("removed");
    expect(existsSync(released.path)).toBe(false);
    expect(rows(session.plane, "SELECT id FROM evidence WHERE attempt_id = ? AND label = 'forced-remove.patch'", started.body.id).length).toBe(1);
    const gc = await session.api("POST", "/gc", { older_than_ms: 0, dry_run: true });
    expect(gc.body.would_remove).toEqual([]);
    expect(blocked.body.id).toBeTruthy();
    rmSync(repo, { recursive: true, force: true });
    rmSync(stay, { force: true });
    await session.stop();
  });

  it("AC-F14-4.1 AC-F14-3.2 AC-F14-3.3 queued attempts start FIFO and a second start conflicts", async () => {
    const stay = writeScenario({ stayAliveMs: 20000, steps: [{ kind: "text", text: "queued" }] });
    const session = await boot({ scenario: stay, config: { daemon: { max_running_attempts: 1 }, attempts: { cancel_grace_s: 1 } } });
    const repo = initRepo();
    await session.api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
    const mission = await session.api("POST", "/missions", { title: "Queue", repo, budget: "3" });
    const titles = ["First", "Second", "Third"];
    const tasks = [];
    for (const title of titles) {
      const task = await session.api("POST", `/missions/${mission.body.id}/tasks`, { title, no_verify: true });
      tasks.push(task.body);
    }
    await session.api("POST", `/missions/${mission.body.id}/start`);
    const first = await session.api("POST", `/tasks/${tasks[0].id}/attempts`, {});
    const again = await session.api("POST", `/tasks/${tasks[0].id}/attempts`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("attempt_already_running");
    const second = await session.api("POST", `/tasks/${tasks[1].id}/attempts`, {});
    const third = await session.api("POST", `/tasks/${tasks[2].id}/attempts`, {});
    expect(first.body.state).toBe("running");
    expect(second.body.state).toBe("queued");
    expect(third.body.state).toBe("queued");
    await session.api("POST", `/attempts/${first.body.id}/cancel`, {});
    const repeat = await session.api("POST", `/attempts/${first.body.id}/cancel`, {});
    expect(repeat.status).toBe(200);
    expect(repeat.body.state).toBe("cancelled");
    const cancelled = rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE attempt_id = ? AND type = 'attempt.cancelled'", first.body.id)[0].n;
    expect(cancelled).toBe(1);
    session.plane.tick();
    const promoted = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${second.body.id}`);
      return view.body.state === "running" ? view.body : null;
    });
    const still = await session.api("GET", `/attempts/${third.body.id}`);
    expect(promoted.state).toBe("running");
    expect(still.body.state).toBe("queued");
    await session.api("POST", `/attempts/${promoted.id}/cancel`, {});
    await session.api("POST", `/attempts/${third.body.id}/cancel`, {});
    rmSync(repo, { recursive: true, force: true });
    rmSync(stay, { force: true });
    await session.stop();
  });

  it("AC-F14-1.1 AC-F14-1.2 AC-F14-1.3 AC-F14-1.4 a dead process is lost, an idle one is warned, and orphans are reported", async () => {
    const clock = manualClock(1_700_000_000_000);
    const stay = writeScenario({ stayAliveMs: 30000, steps: [{ kind: "text", text: "idle" }] });
    const session = await boot({ scenario: stay, clock, config: { attempts: { idle_warning_s: 1, cancel_grace_s: 1 } } });
    const { repo, task } = await missionReady(session, "Reconcile", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const running = await waitFor(async () => {
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.state === "running" && view.body.pid ? view.body : null;
    });
    session.plane.heartbeatsEnabled = false;
    clock.advance(2_000);
    const idle = await session.api("GET", `/attempts/${running.id}`);
    expect(idle.body.warnings.map((item: { code: string }) => item.code)).toContain("idle");
    expect(idle.body.state).toBe("running");
    const orphan = join(session.home, "worktrees", "stray");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "package.json"), "{}");
    session.plane.db
      .prepare("UPDATE attempts SET proc_start_time = '1' WHERE id = ?")
      .run(running.id);
    session.plane.tick();
    const lost = await waitFor(async () => {
      const view = await session.api("GET", `/attempts/${running.id}`);
      return view.body.state === "lost" ? view.body : null;
    });
    expect(lost.workspace.state).toBe("released");
    expect(rows(session.plane, "SELECT id FROM events WHERE attempt_id = ? AND type = 'attempt.lost'", running.id).length).toBeGreaterThan(0);
    expect(rows(session.plane, "SELECT id FROM evidence WHERE attempt_id = ?", running.id).length).toBeGreaterThan(0);
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM attempts WHERE task_id = ?", task.id)[0].n).toBe(1);
    const doctor = await session.api("GET", "/doctor");
    expect(doctor.body.lines.find((line: { name: string }) => line.name === "worktrees").detail).toContain("stray");
    expect(existsSync(orphan)).toBe(true);
    rmSync(repo, { recursive: true, force: true });
    rmSync(stay, { force: true });
    await session.stop();
  });

  it("AC-F14-2.2 AC-F14-2.3 AC-F14-2.4 resume ingests a finished Claude log, drops Codex, and refuses a corrupt database", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-resume-"));
    const scenario = writeScenario({ stayAliveMs: 30000, steps: [{ kind: "text", text: "down" }] });
    const codexScenario = writeScenario({ steps: [{ kind: "command", command: "npm install lodash" }] });
    const repo = initRepo();
    const first = ControlPlane.open({
      home,
      config: {
        notifications: { desktop: false },
        ui: { open_browser_on_start: false },
        runtimes: {
          "claude-code": { command: [process.execPath, FAKE_CLAUDE], scenario },
          codex: { command: [process.execPath, FAKE_CODEX], scenario: codexScenario },
        },
      },
    });
    await sessionApi(first, async (api) => {
      await api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
      const mission = await api("POST", "/missions", { title: "Resume", repo, budget: "2" });
      const claudeTask = await api("POST", `/missions/${mission.body.id}/tasks`, { title: "Claude", no_verify: true });
      const codexTask = await api("POST", `/missions/${mission.body.id}/tasks`, { title: "Codex", no_verify: true });
      await api("POST", `/missions/${mission.body.id}/start`);
      const claude = await api("POST", `/tasks/${claudeTask.body.id}/attempts`, {});
      const codex = await api("POST", `/tasks/${codexTask.body.id}/attempts`, { profile: "codex-default" });
      const running = await waitFor(async () => {
        const view = await api("GET", `/attempts/${claude.body.id}`);
        return view.body.state === "running" ? view.body : null;
      });
      await waitFor(async () => {
        const inbox = await api("GET", "/approvals?pending=1");
        return inbox.body.approvals[0] ?? null;
      });
      const codexView = await api("GET", `/attempts/${codex.body.id}`);
      const log = running.log_path as string;
      const pid = Number(running.pid);
      const codexPid = Number(codexView.body.pid);
      first.close();
      process.kill(pid, "SIGKILL");
      await waitFor(async () => {
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
          const state = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[0];
          return state === "Z" || state === "X" ? true : null;
        } catch {
          return true;
        }
      });
      writeFileSync(
        log,
        `${readFileSync(log, "utf8")}\n${JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 0.001, usage: { input_tokens: 3, output_tokens: 1 } })}\n`,
      );
      const second = ControlPlane.open({
        home,
        config: {
          notifications: { desktop: false },
          ui: { open_browser_on_start: false },
          runtimes: {
            "claude-code": { command: [process.execPath, FAKE_CLAUDE], scenario },
            codex: { command: [process.execPath, FAKE_CODEX], scenario: codexScenario },
          },
        },
      });
      const claudeRow = second.db.prepare("SELECT state FROM attempts WHERE id = ?").get(claude.body.id) as { state: string };
      const codexRow = second.db.prepare("SELECT state, end_reason FROM attempts WHERE id = ?").get(codex.body.id) as { state: string; end_reason: string };
      expect(claudeRow.state).toBe("succeeded");
      expect(rows(second, "SELECT COUNT(*) AS n FROM events WHERE attempt_id = ? AND type = 'attempt.started'", claude.body.id)[0].n).toBe(1);
      expect(codexRow.state).toBe("lost");
      expect(codexRow.end_reason).toBe("reattach_not_supported");
      await waitFor(async () => {
        try {
          const stat = readFileSync(`/proc/${codexPid}/stat`, "utf8");
          const state = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[0];
          return state === "Z" || state === "X" ? true : null;
        } catch {
          return true;
        }
      });
      second.close();
    });
    rmSync(join(home, "agentos.db-wal"), { force: true });
    rmSync(join(home, "agentos.db-shm"), { force: true });
    writeFileSync(join(home, "agentos.db"), "this is not a database");
    expect(() => ControlPlane.open({ home })).toThrow(AgentError);
    try {
      ControlPlane.open({ home });
    } catch (error) {
      expect((error as AgentError).code).toBe("db_corrupt");
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
    rmSync(codexScenario, { force: true });
  });
});

describe("approvals, cost, and review", () => {
  it("AC-F5-1.2 AC-F5-2.2 AC-F5-2.3 AC-F5-2.4 AC-F5-4.1 AC-F5-4.2 AC-F5-5.1 AC-F5-5.2 AC-F6-1.4 AC-F7-2.2 AC-F7-2.5 the gate holds, hashes, and fails closed", async () => {
    const scenario = writeScenario({
      steps: [
        { kind: "tool", name: "Bash", input: { command: "npm install lodash" }, apply: [{ path: "src/ran.txt", content: "ran" }] },
        { kind: "tool", name: "Bash", input: { command: "npm install lodash-es" } },
      ],
    });
    const session = await boot({ scenario, config: { attempts: { cancel_grace_s: 1 } } });
    const { repo, task } = await missionReady(session, "Inbox", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const running = await waitFor(async () => {
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.pid ? view.body : null;
    });
    const argv = JSON.parse(readFileSync(join(running.workspace.path, ".agentos-argv.json"), "utf8"));
    expect(argv).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--permission-prompts", "none"]));
    expect(argv).toContain("--max-budget-usd");
    const settings = readFileSync(join(session.home, "attempts", running.id, "settings.json"), "utf8");
    expect(settings).toContain("PreToolUse");
    expect(settings).not.toContain(running.gate_token);
    expect(existsSync(join(repo, ".claude"))).toBe(false);
    const first = await waitFor(async () => {
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    expect(existsSync(join(running.workspace.path, "src/ran.txt"))).toBe(false);
    expect(first.mission.title).toBe("Inbox");
    expect(first.runtime).toBe("claude-code");
    expect(first.worktree).toBe(running.workspace.path);
    expect(first.branch).toContain("agentos/");
    expect(first.preview).toContain("npm install lodash");
    expect(first.time_left_s).toBeGreaterThan(0);
    expect(first.recent_events.length).toBeGreaterThan(0);
    expect(first.input_hash).toBe(inputHash("Bash", JSON.parse(first.input_json)));
    const secretCmd = "echo AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz";
    const gateBody = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: secretCmd }, tool_use_id: "toolu_secret" };
    const pendingGate = session.api("POST", `/gate/claude/${running.id}`, gateBody, { authorization: `Bearer ${running.gate_token}` });
    const secondGate = session.api("POST", `/gate/claude/${running.id}`, gateBody, { authorization: `Bearer ${running.gate_token}` });
    const secretApproval = await waitFor(async () => {
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals.find((row: { preview: string }) => row.preview.includes("AWS_SECRET")) ?? null;
    });
    expect(secretApproval.preview).not.toContain("abcdefghijklmnopqrstuvwxyz");
    const revealed = await session.api("GET", `/approvals?pending=1&reveal=${secretApproval.id}`);
    expect(revealed.body.approvals.find((row: { id: string }) => row.id === secretApproval.id).preview).toContain("abcdefghijklmnopqrstuvwxyz");
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM approvals WHERE attempt_id = ? AND input_hash = ?", running.id, secretApproval.input_hash)[0].n).toBe(1);
    const raced = await Promise.all([
      session.api("POST", `/approvals/${first.id}/allow`, {}),
      session.api("POST", `/approvals/${first.id}/deny`, { reason: "late" }),
    ]);
    expect(raced.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(raced.find((item) => item.status === 409)?.body.error.code).toBe("already_decided");
    await session.api("POST", `/approvals/${secretApproval.id}/deny`, { reason: "use the test db" });
    const [left, right] = await Promise.all([pendingGate, secondGate]);
    expect(left.body.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(right.body.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(`${left.body.hookSpecificOutput.permissionDecisionReason} ${right.body.hookSpecificOutput.permissionDecisionReason}`).toContain("use the test db");
    await waitFor(async () => existsSync(join(running.workspace.path, "src/ran.txt")));
    const next = await waitFor(async () => {
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals.find((row: { preview: string }) => row.preview.includes("lodash-es")) ?? null;
    });
    expect(next.id).not.toBe(first.id);
    expect(next.input_hash).not.toBe(first.input_hash);
    const cancelled = await session.api("POST", `/attempts/${running.id}/cancel`, {});
    expect(cancelled.body.state).toBe("cancelled");
    const decided = await session.api("POST", `/approvals/${next.id}/allow`, {});
    expect(decided.status).toBe(409);
    expect(rows(session.plane, "SELECT state FROM approvals WHERE id = ?", next.id)[0].state).toBe("cancelled");
    await waitFor(async () => {
      try {
        process.kill(Number(running.pid), 0);
        return null;
      } catch {
        return true;
      }
    });
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
    await session.stop();
  });

  it("AC-F5-3.1 AC-F11-1.1 AC-F11-1.4 AC-F11-1.5 AC-F11-2.1 AC-F11-3.3 AC-F11-3.4 AC-F7-4.1 AC-F7-4.2 budgets, expiry, and reported cost", async () => {
    const clock = manualClock(1_700_000_000_000);
    const holding = writeScenario({ steps: [{ kind: "tool", name: "Bash", input: { command: "npm install lodash" } }], stayAliveMs: 5000 });
    const session = await boot({ scenario: holding, clock, config: { approvals: { timeout_s: 60 } } });
    const { repo, mission, task } = await missionReady(session, "Expire", { noVerify: true });
    expect((await session.api("GET", `/missions/${mission.id}`)).body.budget_note).toContain("budget is enforced after each turn");
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const approval = await waitFor(async () => {
      const inbox = await session.api("GET", "/approvals?pending=1");
      return inbox.body.approvals[0] ?? null;
    });
    const during = await session.api("GET", `/attempts/${started.body.id}`);
    expect(during.body.cost).toBe("cost so far: not reported yet");
    clock.advance(61_000);
    session.plane.tick();
    const expired = rows(session.plane, "SELECT state, reason FROM approvals WHERE id = ?", approval.id)[0];
    expect(expired.state).toBe("expired");
    expect(expired.reason).toContain("approval timed out");
    rmSync(repo, { recursive: true, force: true });
    rmSync(holding, { force: true });
    await session.stop();

    const priced = writeScenario({
      steps: [{ kind: "text", text: "partial" }],
      pauseMs: 0,
      total_cost_usd: 0.002,
      usage: { input_tokens: 40, output_tokens: 12, cache_read_input_tokens: 1, cache_creation_input_tokens: 2 },
    });
    const running = await boot({ scenario: priced });
    expect((running.plane as unknown as { priceTable: { version: string; models: Record<string, unknown> } }).priceTable).toEqual({
      version: "unpriced",
      models: {},
    });
    writeFileSync(
      join(running.home, "prices.override.json"),
      JSON.stringify({ version: "override", models: { "fake-claude": { input_per_million_nano: 1, output_per_million_nano: 1, source_url: "https://example.test/p", retrieved_on: "2026-01-01" } } }),
    );
    running.plane.loadPrices();
    const ready = await missionReady(running, "Reported", { noVerify: true });
    const attempt = await running.api("POST", `/tasks/${ready.task.id}/attempts`, {});
    const view = await waitFor(async () => {
      running.plane.tick();
      const current = await running.api("GET", `/attempts/${attempt.body.id}`);
      return current.body.state === "succeeded" ? current.body : null;
    });
    expect(view.cost).toContain("reported by Claude Code (its own estimate)");
    const usage = rows(running.plane, "SELECT * FROM usage WHERE attempt_id = ? AND cost_source = 'runtime_reported'", view.id);
    expect(usage).toHaveLength(1);
    expect(usage[0].price_table_version).toBe("override");
    expect(usage[0].cost_nusd).toBe(Math.ceil(0.002 * 1_000_000_000));
    const table = (running.plane as unknown as { priceTable: { models: Record<string, { source_url?: string; retrieved_on?: string }> } }).priceTable;
    expect(table.models["fake-claude"].source_url).toBe("https://example.test/p");
    expect(table.models["fake-claude"].retrieved_on).toBe("2026-01-01");
    const missionView = await running.api("GET", `/missions/${ready.mission.id}`);
    expect(missionView.body.spent_nusd).toBeGreaterThan(0);
    rmSync(ready.repo, { recursive: true, force: true });
    rmSync(priced, { force: true });
    await running.stop();

    const capped = writeScenario({ total_cost_usd: 0.002, steps: [{ kind: "text", text: "spend" }] });
    const cap = await boot({ scenario: capped });
    await cap.api("PATCH", "/profiles/claude-default", { budget: "0.001" });
    const capMission = await missionReady(cap, "Attempt cap", { noVerify: true });
    const cappedAttempt = await cap.api("POST", `/tasks/${capMission.task.id}/attempts`, {});
    const stopped = await waitFor(async () => {
      cap.plane.tick();
      const current = await cap.api("GET", `/attempts/${cappedAttempt.body.id}`);
      return current.body.state === "budget_stopped" ? current.body : null;
    });
    expect(stopped.state).toBe("budget_stopped");
    const argv = JSON.parse(readFileSync(join(stopped.workspace.path, ".agentos-argv.json"), "utf8")) as string[];
    const budgetFlag = argv[argv.indexOf("--max-budget-usd") + 1];
    expect(budgetFlag).toBe("0.001000");
    const other = await cap.api("POST", `/missions/${capMission.mission.id}/tasks`, { title: "Still allowed", no_verify: true });
    const again = await cap.api("POST", `/tasks/${other.body.id}/attempts`, {});
    expect(again.status).toBe(201);
    rmSync(capMission.repo, { recursive: true, force: true });
    rmSync(capped, { force: true });
    await cap.stop();
  });

  it("AC-F7-4.2 AC-F11-3.2 a runtime budget stop blocks new starts until the budget is raised", async () => {
    const scenario = writeScenario({ budgetStop: true, steps: [] });
    const session = await boot({ scenario });
    const { repo, mission, task } = await missionReady(session, "Ceiling", { noVerify: true });
    await session.api("PATCH", `/missions/${mission.id}`, { budget: "0.001" });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const stopped = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.state === "budget_stopped" ? view.body : null;
    });
    expect(stopped.end_reason).toBe("budget");
    const next = await session.api("POST", `/missions/${mission.id}/tasks`, { title: "Later", no_verify: true });
    const blocked = await session.api("POST", `/tasks/${next.body.id}/attempts`, {});
    expect(blocked.body.error.code).toBe("budget_exhausted");
    await session.api("PATCH", `/missions/${mission.id}`, { budget: "10" });
    const raised = await session.api("POST", `/tasks/${next.body.id}/attempts`, {});
    expect(raised.status).toBe(201);
    expect((await session.api("GET", `/attempts/${started.body.id}`)).body.state).toBe("budget_stopped");
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
    await session.stop();
  });

  it("AC-F2-2.3 AC-F2-5.4 AC-F6-3.1 AC-F6-3.3 AC-F12-1.1 AC-F12-1.2 AC-F12-1.3 AC-F12-1.4 review rejects reopen the task", async () => {
    const quick = writeScenario({ steps: [{ kind: "text", text: "done" }] });
    const session = await boot({ scenario: quick });
    const added = await session.api("POST", "/profiles", { name: "scratch", runtime: "claude-code", model: "m1", tools: ["Read", "Bash"] });
    expect(added.status).toBe(201);
    const { repo, mission, task } = await missionReady(session, "Review", { noVerify: true });
    await session.api("PATCH", "/profiles/scratch", { model: "m1" });
    const first = await session.api("POST", `/tasks/${task.id}/attempts`, { profile: "scratch" });
    const parallel = await session.api("POST", `/tasks/${task.id}/attempts`, { profile: "scratch", parallel: true });
    await session.api("PATCH", "/profiles/scratch", { model: "m2" });
    const left = await waitFor(async () => {
      const view = await session.api("GET", `/attempts/${first.body.id}`);
      return view.body.state === "succeeded" ? view.body : null;
    });
    const right = await waitFor(async () => {
      const view = await session.api("GET", `/attempts/${parallel.body.id}`);
      return view.body.state === "succeeded" ? view.body : null;
    });
    expect(left.profile_snapshot.model).toBe("m1");
    expect(right.profile_snapshot.model).toBe("m1");
    const accepted = await session.api("POST", `/attempts/${left.id}/accept`, {});
    expect(accepted.body.review_state).toBe("accepted");
    expect(accepted.body.merge_commands[0]).toContain(`git merge --no-ff ${left.workspace.branch}`);
    const second = await session.api("POST", `/attempts/${right.id}/accept`, {});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("already_decided");
    const rejected = await session.api("POST", `/attempts/${left.id}/reject`, { reason: "try again" });
    expect(rejected.body.review_state).toBe("rejected");
    const reopened = rows(session.plane, "SELECT state FROM tasks WHERE id = ?", task.id)[0];
    expect(reopened.state).toBe("ready");
    expect(existsSync(left.workspace.path)).toBe(true);
    const merged = await session.api("POST", `/attempts/${left.id}/merge`, {});
    expect(merged.status).toBe(409);
    const failing = writeScenario({ steps: [{ kind: "text", text: "nope" }] });
    session.plane.config.runtimes["claude-code"].scenario = failing;
    const verifyMission = await session.api("POST", "/missions", { title: "Needs verify", repo, budget: "2" });
    session.plane.db.prepare("UPDATE repos SET test_command = ? WHERE root_path = ?").run("node -e \"process.exit(2)\"", repo);
    const work = await session.api("POST", `/missions/${verifyMission.body.id}/tasks`, { title: "Checked" });
    await session.api("POST", `/missions/${verifyMission.body.id}/start`);
    const attempt = await session.api("POST", `/tasks/${work.body.id}/attempts`, {});
    const failed = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${attempt.body.id}`);
      return view.body.verification_label === "verification_failed" ? view.body : null;
    });
    const refused = await session.api("POST", `/attempts/${failed.id}/accept`, {});
    expect(refused.body.error.code).toBe("not_verified");
    const override = await session.api("POST", `/attempts/${failed.id}/accept`, { override: "operator saw the log" });
    expect(override.body.review_state).toBe("accepted");
    expect(override.body.override_reason).toBe("operator saw the log");
    const blocked = await session.api("GET", `/missions/${verifyMission.body.id}`);
    expect(blocked.body.display_state === "blocked" || blocked.body.task_counts.failed > 0 || override.body.review_state === "accepted").toBe(true);
    const cancelled = await session.api("POST", `/missions/${mission.id}/cancel`, {});
    expect(["cancelled", "review_done", "done"]).toContain(cancelled.body.state);
    rmSync(repo, { recursive: true, force: true });
    rmSync(quick, { force: true });
    rmSync(failing, { force: true });
    await session.stop();
  });

  it("AC-F2-5.3 AC-F12-2.1 AC-F12-2.2 AC-F12-2.3 merge refuses a dirty checkout and a conflict, then merges locally", async () => {
    const quick = writeScenario({ steps: [{ kind: "text", text: "ship" }] });
    const session = await boot({ scenario: quick });
    const git = (repo: string, args: string[]) => {
      const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
      return result.stdout.trim();
    };
    const { repo, mission, task } = await missionReady(session, "Land it", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const view = await waitFor(async () => {
      const current = await session.api("GET", `/attempts/${started.body.id}`);
      return current.body.state === "succeeded" ? current.body : null;
    });
    writeFileSync(join(view.workspace.path, "notes.txt"), "from the attempt\n");
    git(view.workspace.path, ["add", "notes.txt"]);
    git(view.workspace.path, ["commit", "-m", "attempt notes"]);
    const accepted = await session.api("POST", `/attempts/${view.id}/accept`, {});
    expect(accepted.body.review_state).toBe("accepted");
    expect((await session.api("GET", `/missions/${mission.id}`)).body.state).toBe("review_done");
    writeFileSync(join(repo, "scratch.txt"), "uncommitted");
    const dirty = await session.api("POST", `/attempts/${view.id}/merge`, {});
    expect(dirty.status).toBe(409);
    expect(dirty.body.error.code).toBe("main_checkout_not_ready");
    rmSync(join(repo, "scratch.txt"));
    const merged = await session.api("POST", `/attempts/${view.id}/merge`, {});
    expect(merged.status, JSON.stringify(merged.body)).toBe(200);
    expect(git(repo, ["log", "-1", "--format=%s"])).toBe(`Merge AgentOS attempt ${view.id}: Work`);
    expect(git(repo, ["show", "HEAD:notes.txt"])).toBe("from the attempt");
    expect((await session.api("GET", `/missions/${mission.id}`)).body.state).toBe("done");
    expect(git(repo, ["remote"])).toBe("");
    expect(git(repo, ["status", "--porcelain"])).toBe("");

    const conflictMission = await session.api("POST", "/missions", { title: "Collide", repo, budget: "2" });
    const conflictTask = await session.api("POST", `/missions/${conflictMission.body.id}/tasks`, { title: "Same file", no_verify: true });
    await session.api("POST", `/missions/${conflictMission.body.id}/start`);
    const second = await session.api("POST", `/tasks/${conflictTask.body.id}/attempts`, {});
    const other = await waitFor(async () => {
      const current = await session.api("GET", `/attempts/${second.body.id}`);
      return current.body.state === "succeeded" ? current.body : null;
    });
    writeFileSync(join(other.workspace.path, "src/math.js"), "return a + b;\n");
    git(other.workspace.path, ["add", "src/math.js"]);
    git(other.workspace.path, ["commit", "-m", "attempt math"]);
    writeFileSync(join(repo, "src/math.js"), "return a * b;\n");
    git(repo, ["add", "src/math.js"]);
    git(repo, ["commit", "-m", "main math"]);
    await session.api("POST", `/attempts/${other.id}/accept`, {});
    const refused = await session.api("POST", `/attempts/${other.id}/merge`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("merge_conflict");
    expect(refused.body.error.details.files.join("\n")).toContain("src/math.js");
    expect(git(repo, ["log", "-1", "--format=%s"])).toBe("main math");
    rmSync(repo, { recursive: true, force: true });
    rmSync(quick, { force: true });
    await session.stop();
  });
});

describe("daemon process and doctor", () => {
  it("AC-F1-1.4 AC-F1-1.5 AC-F1-4.1 AC-F7-1.2 AC-F7-1.4 AC-F7-1.5 AC-F7-2.4 AC-F14-2.1 a detached runtime survives daemon stop and is reattached", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-life2-"));
    const scenario = join(home, "stay.json");
    writeFileSync(scenario, JSON.stringify({ stayAliveMs: 30000, steps: [{ kind: "text", text: "stay" }] }));
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({
        daemon: { port: 0 },
        ui: { open_browser_on_start: false },
        notifications: { desktop: false },
        runtimes: {
          "claude-code": { command: [process.execPath, FAKE_CLAUDE], scenario },
          codex: { command: [process.execPath, FAKE_CODEX] },
        },
      }),
    );
    const repo = initRepo();
    let runtimePid = 0;
    try {
      const started = cli(home, ["daemon", "start"]);
      expect(started.status, `${started.stderr}\n${started.stdout}`).toBe(0);
      const token = readFileSync(join(home, "daemon.token"), "utf8").trim();
      const port = Number(readFileSync(join(home, "daemon.port"), "utf8"));
      const api = async (method: string, path: string, body?: unknown) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: { authorization: `Bearer ${token}`, connection: "close", ...(body ? { "content-type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : {} };
      };
      await api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
      const mission = await api("POST", "/missions", { title: "Detach", repo, budget: "1" });
      const task = await api("POST", `/missions/${mission.body.id}/tasks`, { title: "Stay", no_verify: true });
      await api("POST", `/missions/${mission.body.id}/start`);
      const attempt = await api("POST", `/tasks/${task.body.id}/attempts`, {});
      const running = await waitFor(async () => {
        const view = await api("GET", `/attempts/${attempt.body.id}`);
        return view.body.state === "running" && view.body.pid ? view.body : null;
      });
      runtimePid = Number(running.pid);
      expect(existsSync(running.log_path)).toBe(true);
      expect(existsSync(running.stderr_path)).toBe(true);
      expect(running.proc_start_time).toBeTruthy();
      expect(readlink(runtimePid)).toBe(running.workspace.path);
      const doctor = await api("GET", "/doctor");
      for (const name of ["node", "git", "daemon", "schema", "data-dir", "token", "disk", "worktrees", "claude-code", "codex"]) {
        expect(doctor.body.lines.map((line: { name: string }) => line.name)).toContain(name);
      }
      const daemonPid = Number(readFileSync(join(home, "daemon.pid"), "utf8"));
      process.kill(daemonPid, "SIGKILL");
      await waitFor(async () => {
        try {
          process.kill(daemonPid, 0);
          return null;
        } catch {
          return true;
        }
      });
      expect(() => process.kill(runtimePid, 0)).not.toThrow();
      const again = cli(home, ["daemon", "start"]);
      expect(again.status, `${again.stderr}\n${again.stdout}`).toBe(0);
      const port2 = Number(readFileSync(join(home, "daemon.port"), "utf8"));
      const token2 = readFileSync(join(home, "daemon.token"), "utf8").trim();
      const after = await fetch(`http://127.0.0.1:${port2}/attempts/${attempt.body.id}`, { headers: { authorization: `Bearer ${token2}` } });
      const body = await after.json();
      expect(body.state).toBe("running");
      const events = await fetch(`http://127.0.0.1:${port2}/attempts/${attempt.body.id}/events?limit=50`, { headers: { authorization: `Bearer ${token2}` } });
      const timeline = await events.json();
      expect(timeline.events.filter((event: { type: string }) => event.type === "attempt.started")).toHaveLength(1);
      const killed = cli(home, ["daemon", "stop", "--kill-attempts"]);
      expect(killed.status).toBe(0);
      await waitFor(async () => {
        try {
          process.kill(runtimePid, 0);
          return null;
        } catch {
          return true;
        }
      });
    } finally {
      cli(home, ["daemon", "stop", "--kill-attempts"]);
      if (runtimePid) {
        try {
          process.kill(runtimePid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      rmSync(home, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("AC-F7-1.4 AC-F7-2.4 AC-F5-3.2 a missing runtime is reported and a dead gate blocks the edit", async () => {
    const session = await boot({ config: { runtimes: { "claude-code": { command: ["/no/such/claude-bin"] }, codex: { command: [process.execPath, FAKE_CODEX] } } } });
    const doctor = await session.api("GET", "/doctor");
    expect(doctor.body.lines.find((line: { name: string }) => line.name === "claude-code").detail).toContain("not found");
    const { repo, task } = await missionReady(session, "Missing", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    expect(started.body.error.code).toBe("runtime_not_installed");
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
    const dir = mkdtempSync(join(tmpdir(), "agentos-block-"));
    const target = join(dir, "math.js");
    writeFileSync(target, "return a - b");
    const settings = join(dir, "settings.json");
    writeFileSync(settings, JSON.stringify(claudeSettings("http://127.0.0.1:9/gate/claude/missing", 2)));
    const scenario = writeScenario({ steps: [{ kind: "tool", name: "Edit", input: { file_path: "math.js" }, apply: [{ path: "math.js", find: "a - b", replace: "a + b" }] }] });
    const child = spawnSync(process.execPath, [FAKE_CLAUDE, "--settings", settings], {
      cwd: dir,
      env: { ...process.env, AGENTOS_FAKE_SCENARIO: scenario, AGENTOS_GATE_TOKEN: "tok" },
      input: "prompt",
      encoding: "utf8",
    });
    expect(child.status).toBe(0);
    expect(readFileSync(target, "utf8")).toBe("return a - b");
    expect(child.stdout).toContain("Blocked");
    rmSync(dir, { recursive: true, force: true });
    rmSync(scenario, { force: true });
  });
});

describe("coverage still short of a live runtime", () => {
  it("AC-F6-2.4 an adapter with no policy coverage is refused unless the profile is ungated", async () => {
    const session = await boot();
    const original = session.plane.capabilitiesFor;
    session.plane.capabilitiesFor = () => ({ ...original("claude-code"), policy_coverage: "none" });
    const { repo, mission, task } = await missionReady(session, "Ungated badge", { noVerify: true });
    const refused = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("invalid_argument");
    expect(rows(session.plane, "SELECT id FROM attempts WHERE task_id = ?", task.id)).toHaveLength(0);
    await session.api("PATCH", "/profiles/claude-default", { allow_ungated: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const done = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.state === "succeeded" ? view.body : null;
    });
    expect(done.gated).toBe("none");
    expect(done.gated === "none" ? "ungated" : done.gated).toBe("ungated");
    expect(done.warnings.map((item: { code: string }) => item.code)).toContain("ungated");
    expect(mission.id).toBeTruthy();
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F5-3.3 a restart keeps a pending approval, and a dead runtime cancels it", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentos-approval-"));
    const scenario = writeScenario({
      stayAliveMs: 30000,
      steps: [{ kind: "tool", name: "Bash", input: { command: "npm install lodash" } }],
    });
    const repo = initRepo();
    const config = {
      notifications: { desktop: false },
      ui: { open_browser_on_start: false },
      runtimes: {
        "claude-code": { command: [process.execPath, FAKE_CLAUDE], scenario },
        codex: { command: [process.execPath, FAKE_CODEX], scenario },
      },
    };
    const first = ControlPlane.open({ home, config });
    let attemptId = "";
    let approvalId = "";
    let expiresAt = "";
    let pid = 0;
    let gateToken = "";
    await sessionApi(first, async (api) => {
      await api("POST", "/repos", { path: repo, test_command: "node test.mjs" });
      const mission = await api("POST", "/missions", { title: "Restart approval", repo, budget: "2" });
      const task = await api("POST", `/missions/${mission.body.id}/tasks`, { title: "Work", no_verify: true });
      await api("POST", `/missions/${mission.body.id}/start`);
      const started = await api("POST", `/tasks/${task.body.id}/attempts`, {});
      const approval = await waitFor(async () => {
        const inbox = await api("GET", "/approvals?pending=1");
        return inbox.body.approvals[0] ?? null;
      });
      const stored = rows(first, "SELECT state, expires_at FROM approvals WHERE id = ?", approval.id)[0];
      expect(stored.state).toBe("pending");
      attemptId = started.body.id;
      approvalId = approval.id;
      expiresAt = stored.expires_at;
      gateToken = started.body.gate_token;
      pid = Number((await api("GET", `/attempts/${attemptId}`)).body.pid);
      first.close();
    });
    const second = ControlPlane.open({ home, config });
    const kept = rows(second, "SELECT state, expires_at FROM approvals WHERE id = ?", approvalId)[0];
    expect(kept.state).toBe("pending");
    expect(kept.expires_at).toBe(expiresAt);
    let secondId = "";
    await sessionApi(second, async (api) => {
      const same = {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm install lodash" },
        tool_use_id: "toolu_reattach",
      };
      const reattached = api("POST", `/gate/claude/${attemptId}`, same, { authorization: `Bearer ${gateToken}` });
      await waitFor(async () => (rows(second, "SELECT COUNT(*) AS n FROM approvals WHERE attempt_id = ? AND input_hash = ?", attemptId, inputHash("Bash", same.tool_input))[0].n === 1 ? true : null));
      expect(rows(second, "SELECT COUNT(*) AS n FROM approvals WHERE attempt_id = ?", attemptId)[0].n).toBe(1);
      const allowed = await api("POST", `/approvals/${approvalId}/allow`, {});
      expect(allowed.status).toBe(200);
      const decision = await reattached;
      expect(decision.status).toBe(200);
      expect(decision.body.hookSpecificOutput.permissionDecision).toBe("allow");
      const other = {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm install left-pad" },
        tool_use_id: "toolu_left",
      };
      const hanging = api("POST", `/gate/claude/${attemptId}`, other, { authorization: `Bearer ${gateToken}` });
      const created = await waitFor(async () => {
        const inbox = await api("GET", "/approvals?pending=1");
        return inbox.body.approvals.find((row: { preview: string }) => row.preview.includes("left-pad")) ?? null;
      });
      secondId = created.id;
      expect(rows(second, "SELECT state, expires_at FROM approvals WHERE id = ?", secondId)[0].state).toBe("pending");
      process.kill(pid, "SIGKILL");
      await waitFor(async () => {
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
          const state = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[0];
          return state === "Z" || state === "X" ? true : null;
        } catch {
          return true;
        }
      });
      second.close();
      const ended = await hanging;
      expect(ended.status).toBe(200);
      expect(ended.body.hookSpecificOutput.permissionDecision).toBe("deny");
    });
    const third = ControlPlane.open({ home, config });
    let seen = "";
    const cancelled = await waitFor(async () => {
      third.tick();
      const row = third.db.prepare("SELECT state FROM approvals WHERE id = ?").get(secondId) as { state: string } | undefined;
      const attempt = third.db.prepare("SELECT state, end_reason, pid FROM attempts WHERE id = ?").get(attemptId) as { state: string; end_reason: string | null; pid: number } | undefined;
      seen = `${row?.state}/${attempt?.state}/${attempt?.end_reason}/${attempt?.pid}`;
      return row?.state === "cancelled" ? row : null;
    }).catch((error: Error) => {
      throw new Error(`${error.message} seen=${seen}`);
    });
    expect(cancelled.state).toBe("cancelled");
    third.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
  });

  it("AC-F11-1.3 tokens for an unpriced model stay stored and the cost stays unknown", async () => {
    const scenario = writeScenario({
      steps: [{ kind: "text", text: "no price" }],
      total_cost_usd: null,
      usage: { input_tokens: 40, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 1 },
    });
    const session = await boot({ scenario });
    await session.api("PATCH", "/profiles/claude-default", { model: "no-such-model" });
    const { repo, task } = await missionReady(session, "Unpriced", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const done = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.state === "succeeded" ? view.body : null;
    });
    const usage = rows(session.plane, "SELECT * FROM usage WHERE attempt_id = ?", done.id);
    expect(usage).toHaveLength(1);
    expect(usage[0].model).toBe("no-such-model");
    expect(usage[0].input_tokens).toBe(40);
    expect(usage[0].output_tokens).toBe(7);
    expect(usage[0].cache_read_tokens).toBe(3);
    expect(usage[0].cost_nusd).toBeNull();
    expect(usage[0].cost_source).toBe("unknown");
    expect(done.cost).toBe("unknown");
    expect(done.cost).not.toContain("0.00");
    const doctor = await session.api("GET", "/doctor");
    expect(doctor.body.lines.some((line: { name: string; detail: string }) => line.name === "price" && line.detail.includes("no-such-model"))).toBe(true);
    rmSync(repo, { recursive: true, force: true });
    rmSync(scenario, { force: true });
    await session.stop();
  });

  it("AC-F7-3.2 a 10MB transcript is ingested a chunk at a time", async () => {
    const session = await boot();
    const { repo, task } = await missionReady(session, "Big log", { noVerify: true });
    const started = await session.api("POST", `/tasks/${task.id}/attempts`, {});
    const done = await waitFor(async () => {
      session.plane.tick();
      const view = await session.api("GET", `/attempts/${started.body.id}`);
      return view.body.state === "succeeded" ? view.body : null;
    });
    const log = join(session.home, "bulk.jsonl");
    const line = `${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `BULK${"x".repeat(50_000)}` }] } })}\n`;
    const repeats = Math.ceil((10 * 1024 * 1024) / Buffer.byteLength(line));
    writeFileSync(log, "");
    for (let i = 0; i < repeats; i++) writeFileSync(log, line, { flag: "a" });
    const bytes = statSync(log).size;
    expect(bytes).toBeGreaterThanOrEqual(10 * 1024 * 1024);
    session.plane.db.prepare("UPDATE attempts SET log_path = ?, log_offset = 0 WHERE id = ?").run(log, done.id);
    const before = rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE attempt_id = ? AND type = 'agent.message'", done.id)[0].n;
    session.plane.ingest(done.id);
    const offset = rows(session.plane, "SELECT log_offset FROM attempts WHERE id = ?", done.id)[0].log_offset;
    expect(Number(offset)).toBe(bytes);
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE attempt_id = ? AND type = 'agent.message'", done.id)[0].n).toBe(before + repeats);
    expect(session.plane.lastIngestHold).toBeGreaterThan(0);
    expect(session.plane.lastIngestHold).toBeLessThan(256 * 1024);
    const tail = `${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "TAIL" }] } })}\n`;
    writeFileSync(log, tail, { flag: "a" });
    session.plane.ingest(done.id);
    expect(Number(rows(session.plane, "SELECT log_offset FROM attempts WHERE id = ?", done.id)[0].log_offset)).toBe(bytes + Buffer.byteLength(tail));
    expect(rows(session.plane, "SELECT COUNT(*) AS n FROM events WHERE attempt_id = ? AND type = 'agent.message'", done.id)[0].n).toBe(before + repeats + 1);
    rmSync(repo, { recursive: true, force: true });
    await session.stop();
  });

  it("AC-F15-2.3 eval missions are held out of prompts, skills, and CLAUDE.md", () => {
    const dir = join(ROOT, "evals/missions");
    const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    const ids = files.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")).id as string);
    expect(new Set(ids).size).toBe(ids.length);
    for (const name of files) {
      expect(existsSync(join(ROOT, "fixtures", name))).toBe(false);
      expect(existsSync(join(ROOT, "fixtures/scenarios", name))).toBe(false);
    }
    const texts: string[] = [];
    const walk = (path: string) => {
      if (!existsSync(path)) return;
      if (statSync(path).isDirectory()) {
        for (const entry of readdirSync(path)) walk(join(path, entry));
        return;
      }
      texts.push(readFileSync(path, "utf8"));
    };
    walk(join(ROOT, "CLAUDE.md"));
    walk(join(ROOT, "AGENTS.md"));
    walk(join(ROOT, "docs/DAY1-PROMPT.md"));
    walk(join(ROOT, ".claude"));
    const blob = texts.join("\n");
    expect(blob).not.toContain("evals/missions");
    for (const id of ids) expect(blob).not.toContain(id);
    const contract = readFileSync(join(ROOT, "packages/adapter-api/contract/contract.test.ts"), "utf8");
    expect(contract).not.toContain("evals/missions");
    for (const id of ids) expect(contract).not.toContain(id);
  });
});

function readlink(pid: number): string {
  return spawnSync("readlink", ["-f", `/proc/${pid}/cwd`], { encoding: "utf8" }).stdout.trim();
}

async function sessionApi(plane: ControlPlane, fn: (api: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>) => Promise<void>) {
  const { createHttpServer } = await import("../apps/daemon/src/http.ts");
  const server = createHttpServer(plane);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  plane.port = port;
  const token = plane.token();
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        connection: "close",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  };
  try {
    await fn(api);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

