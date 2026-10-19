import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  fstatSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  statSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AgentError,
  CLAUDE_MIN_VERSION,
  NANO_PER_USD,
  PRODUCT_VERSION,
  assertTransition,
  canonicalJson,
  inputHash,
  iso,
  knownEventType,
  maskSecrets,
  parseCriterion,
  sha256Hex,
  slugify,
  systemClock,
  ulid,
  usdToNano,
  type Clock,
  type EventType,
} from "@agentos/core";
import {
  DEFAULT_POLICY_YAML,
  PolicyInvalidError,
  layerPolicies,
  lintRules,
  loadDefaultPolicy,
  parsePolicy,
  resolveDecision,
  type Decision,
  type LayeredPolicy,
  type PolicyDocument,
  type ResolveContext,
} from "@agentos/policy";
import { claudeCapabilities, claudeCommand, claudeSettings, claudeSpawnArgs, checkClaude, isBudgetStop, parseClaudeLine } from "@agentos/adapter-claude-code";
import { checkCodex, codexCapabilities, codexCommand, codexDecision, parseCodexLine } from "@agentos/adapter-codex";
import { blobMatches, countJunit, renderEvidenceMd, writeBlob } from "@agentos/evidence";
import { applyMigrations } from "./migrate.ts";
import {
  addWorktree,
  branchExists,
  changedFiles,
  checkedOutBranches,
  commitAll,
  diffs,
  dirSize,
  git,
  inspectMainCheckout,
  mergeTreeConflicts,
  pathsOverlap,
  removeWorktree,
  worktreeDirty,
} from "./git.ts";

const MIGRATIONS = new URL("./migrations/", import.meta.url).pathname;

export interface PlaneOptions {
  home: string;
  clock?: Clock;
  config?: Record<string, unknown>;
  port?: number;
}

type SqlRow = Record<string, any>;

interface RuntimeChild {
  child: ChildProcess;
  kind: "claude" | "codex";
  logPath?: string;
}

export class ControlPlane {
  readonly home: string;
  readonly clock: Clock;
  readonly db: DatabaseSync;
  readonly config: ReturnType<typeof defaultConfig>;
  port = 0;
  accepting = true;
  readonly startedAt: number;
  dbWritable = true;
  policy: LayeredPolicy = { rules: [], defaults: [] };
  policyDocs: { global?: PolicyDocument; error?: string } = {};
  policyMtime = 0;
  policySize = -1;
  heartbeatsEnabled = true;
  private nextHeartbeat = new Map<string, number>();
  private lastBeatEvent = new Map<string, number>();
  private gateIds = new Map<string, Set<string>>();
  private bypassAt = new Map<string, number>();
  private children = new Map<string, RuntimeChild>();
  private codexWaiters = new Map<string, Map<number, (decision: "accept" | "decline" | "cancel") => void>>();
  private approvalWaiters = new Map<string, (result: { effect: "allow" | "deny"; reason: string }) => void>();
  private sse: { id: number; res: import("node:http").ServerResponse; missionId?: string; attemptId?: string; last: number; queued: number }[] = [];
  private sseSeq = 1;
  private pendingSse: SqlRow[] = [];
  private inTx = false;
  private launchCodes = new Map<string, number>();
  private notified = new Set<string>();
  private lastResult = new Map<string, { subtype: string; usage?: any; total_cost_usd?: number | null }>();
  private finishing = new Set<string>();
  private exiting = new Set<string>();
  private policyHash = "";
  private priceTable: { version: string; models: Record<string, any> } = { version: "unpriced", models: {} };

  private constructor(opts: PlaneOptions, db: DatabaseSync) {
    this.home = opts.home;
    this.clock = opts.clock ?? systemClock();
    this.startedAt = this.clock.now();
    this.db = db;
    this.config = loadConfig(opts.home, opts.config);
    if (opts.port != null) this.config.daemon.port = opts.port;
  }

  static open(opts: PlaneOptions): ControlPlane {
    mkdirSync(opts.home, { recursive: true, mode: 0o700 });
    chmodSync(opts.home, 0o700);
    for (const dir of ["blobs", "logs", "logs/attempts", "attempts", "worktrees", "policy", "policy/repos"]) {
      mkdirSync(join(opts.home, dir), { recursive: true, mode: 0o700 });
    }
    const dbPath = join(opts.home, "agentos.db");
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA journal_mode = WAL");
    const quick = db.prepare("PRAGMA quick_check").get() as { quick_check: string };
    if (quick.quick_check !== "ok") {
      throw new AgentError("db_corrupt", `Database failed PRAGMA quick_check (${quick.quick_check}). Restore the latest backup in ${opts.home}.`, 1);
    }
    const plane = new ControlPlane(opts, db);
    applyMigrations(db, MIGRATIONS, {
      now: iso(plane.clock.now()),
      backupTo: (version) => join(opts.home, `agentos.db.bak-${version}-${plane.clock.now()}`),
    });
    chmodSync(dbPath, 0o600);
    plane.ensureDefaults();
    plane.loadPrices();
    plane.reloadPolicy(true);
    plane.resume();
    return plane;
  }

  /** Reattach attempts left running by a previous daemon process. */
  resume(): void {
    const rows = this.all("SELECT * FROM attempts WHERE state IN ('starting', 'running', 'waiting_approval')");
    for (const attempt of rows) {
      if (attempt.runtime === "codex") {
        if (attempt.pid) void cancelProcess(Number(attempt.pid), 200);
        this.finishAttempt(attempt.id, "lost", "reattach_not_supported", null, null);
        this.emit("attempt.lost", { attemptId: attempt.id, taskId: attempt.task_id, actor: "daemon" }, { reason: "reattach_not_supported" });
        continue;
      }
      this.ingest(attempt.id);
      if (attempt.pid && this.processAlive(attempt)) {
        this.nextHeartbeat.set(attempt.id, this.clock.now());
        continue;
      }
      if (attempt.state === "starting" || attempt.state === "queued") this.finishAttempt(attempt.id, "failed", "process gone", null, null);
      else this.finishLost(attempt.id);
    }
  }

  private closed = false;

  close(): void {
    this.closed = true;
    for (const waiter of this.approvalWaiters.values()) waiter({ effect: "deny", reason: "daemon stopped" });
    this.approvalWaiters.clear();
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }

  nowIso(): string {
    return iso(this.clock.now());
  }

  private tx<T>(fn: () => T): T {
    if (this.closed) return fn();
    if (this.inTx) return fn();
    this.inTx = true;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      this.inTx = false;
      this.flushSse();
      return value;
    } catch (error) {
      this.pendingSse = [];
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      this.inTx = false;
      throw error;
    }
  }

  private all(sql: string, ...params: unknown[]): SqlRow[] {
    if (this.closed) return [];
    return this.db.prepare(sql).all(...params) as SqlRow[];
  }
  private one(sql: string, ...params: unknown[]): SqlRow | undefined {
    if (this.closed) return undefined;
    return this.db.prepare(sql).get(...params) as SqlRow | undefined;
  }
  private run(sql: string, ...params: unknown[]) {
    if (this.closed) return { changes: 0, lastInsertRowid: 0 };
    return this.db.prepare(sql).run(...params);
  }

  log(line: string): void {
    const file = join(this.home, "logs", "daemon.log");
    try {
      if (existsSync(file) && statSync(file).size > 10 * 1024 * 1024) {
        for (let i = 4; i >= 1; i--) {
          const src = `${file}.${i}`;
          if (existsSync(src)) renameSync(src, `${file}.${i + 1}`);
        }
        if (existsSync(file)) renameSync(file, `${file}.1`);
      }
      appendFileSync(file, `${this.nowIso()} ${line}\n`);
    } catch {
      // logging must not break the daemon
    }
  }

  private ensureDefaults(): void {
    const now = this.nowIso();
    const tools = JSON.stringify(["Read", "Edit", "Write", "Bash", "Grep", "Glob"]);
    for (const profile of [
      { name: "claude-default", runtime: "claude-code" },
      { name: "codex-default", runtime: "codex" },
    ]) {
      if (!this.one("SELECT id FROM profiles WHERE name = ?", profile.name)) {
        this.run(
          "INSERT INTO profiles (id, name, runtime, model, tools, policy_overlay, attempt_budget_nusd, allow_ungated, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, NULL, 0, ?, ?)",
          ulid(this.clock.now()),
          profile.name,
          profile.runtime,
          tools,
          now,
          now,
        );
      }
    }
    const policyPath = join(this.home, "policy", "global.yaml");
    if (!existsSync(policyPath)) writeFileSync(policyPath, DEFAULT_POLICY_YAML, { mode: 0o600 });
    if (!existsSync(join(this.home, "daemon.token"))) {
      writeFileSync(join(this.home, "daemon.token"), randomBytes(32).toString("hex"), { mode: 0o600 });
    }
    chmodSync(join(this.home, "daemon.token"), 0o600);
  }

  token(): string {
    return readFileSync(join(this.home, "daemon.token"), "utf8").trim();
  }

  private loadPrices(): void {
    this.priceTable = { version: "unpriced", models: {} };
    const override = join(this.home, "prices.override.json");
    if (!existsSync(override)) return;
    const body = JSON.parse(readFileSync(override, "utf8"));
    this.priceTable = { version: String(body.version ?? "override"), models: body.models ?? {} };
  }

  reloadPolicy(force = false): void {
    const file = join(this.home, "policy", "global.yaml");
    const stat = existsSync(file) ? statSync(file) : null;
    const mtime = stat?.mtimeMs ?? 0;
    const size = stat?.size ?? -1;
    if (!force && mtime === this.policyMtime && size === this.policySize) return;
    try {
      const text = readFileSync(file, "utf8");
      const doc = parsePolicy(text, file);
      doc.rules.forEach((rule) => {
        rule.source = "global";
      });
      this.policyDocs = { global: doc };
      this.policy = layerPolicies([{ source: "global", rules: doc.rules, default: doc.default }]);
      this.policyHash = sha256Hex(canonicalJson({ n: doc.rules.length, d: doc.default }));
      if (!force && this.policyMtime) {
        this.emit("policy.reloaded", { actor: "daemon" }, { hash: this.effectiveHash() });
      }
      this.policyMtime = mtime;
      this.policySize = size;
      this.policyDocs.error = undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.policyDocs.error = message;
      if (this.policyMtime) this.emit("policy.invalid", { actor: "daemon" }, { message });
      this.policyMtime = mtime;
      this.policySize = size;
      if (!this.policyDocs.global) throw error;
    }
  }

  effectiveHash(extra?: LayeredPolicy): string {
    const policy = extra ?? this.policy;
    const decision = resolveDecision(policy, { tool: "noop", arg: "" }, this.policyCtx());
    return decision.policyHash;
  }

  private policyCtx(extra: Partial<ResolveContext> = {}): ResolveContext {
    return {
      home: homedir(),
      realpath: resolveReal,
      ...extra,
    };
  }

  health(): Record<string, string | number> {
    let db = "ok";
    try {
      const mode = statSync(join(this.home, "agentos.db")).mode & 0o222;
      if (mode === 0) throw new Error("readonly");
      this.db.exec("BEGIN IMMEDIATE");
      this.db.exec("ROLLBACK");
    } catch {
      db = "db_not_writable";
      this.dbWritable = false;
    }
    const running = this.one(
      "SELECT COUNT(*) AS n FROM attempts WHERE state IN ('starting', 'running', 'waiting_approval')",
    );
    const schema = this.one("SELECT MAX(version) AS v FROM schema_migrations");
    return {
      status: db === "ok" ? "ok" : "degraded",
      version: PRODUCT_VERSION,
      schema_version: Number(schema?.v ?? 0),
      uptime_s: Math.max(0, Math.floor((this.clock.now() - this.startedAt) / 1000)),
      db,
      running_attempts: Number(running?.n ?? 0),
    };
  }

  emit(
    type: EventType | string,
    refs: { missionId?: string | null; taskId?: string | null; attemptId?: string | null; actor: string },
    payload: unknown,
    raw?: unknown,
  ): number {
    const storedType = knownEventType(type) ? type : "adapter.unknown";
    const body = storedType === type ? payload : { original_type: type, payload };
    let rawText: string | null = raw == null ? null : typeof raw === "string" ? raw : JSON.stringify(raw);
    let rawBlob: string | null = null;
    if (rawText && Buffer.byteLength(rawText) > this.config.events.raw_inline_max_bytes) {
      rawBlob = writeBlob(this.home, rawText).sha256;
      rawText = null;
    }
    const write = () => {
      this.run(
        "INSERT INTO events (ts, type, mission_id, task_id, attempt_id, actor, payload, raw, raw_blob_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        this.nowIso(),
        storedType,
        refs.missionId ?? null,
        refs.taskId ?? null,
        refs.attemptId ?? null,
        refs.actor,
        JSON.stringify(body ?? {}),
        rawText,
        rawBlob,
      );
      const id = Number(this.one("SELECT last_insert_rowid() AS id")?.id ?? 0);
      const row = this.one("SELECT * FROM events WHERE id = ?", id);
      if (row) this.pendingSse.push(row);
      return id;
    };
    if (this.inTx) return write();
    return this.tx(write);
  }

  private flushSse(): void {
    const rows = this.pendingSse.splice(0);
    for (const row of rows) {
      const data = JSON.stringify(publicEvent(row, false));
      for (const client of [...this.sse]) {
        if (client.missionId && row.mission_id !== client.missionId) continue;
        if (client.attemptId && row.attempt_id !== client.attemptId) continue;
        if (row.id - client.last > 1000) {
          this.writeSse(client, "resync", String(row.id), "{}");
          client.res.end();
          this.sse = this.sse.filter((item) => item !== client);
          continue;
        }
        this.writeSse(client, "message", String(row.id), data);
        client.last = row.id;
      }
    }
  }

  private writeSse(client: { res: import("node:http").ServerResponse }, event: string, id: string, data: string): void {
    client.res.write(`id: ${id}\nevent: ${event}\ndata: ${data}\n\n`);
  }

  subscribe(res: import("node:http").ServerResponse, opts: { last?: number; missionId?: string; attemptId?: string }): void {
    const last = opts.last ?? 0;
    const rows = this.all(
      `SELECT * FROM events WHERE id > ? ${opts.missionId ? "AND mission_id = ?" : ""} ${opts.attemptId ? "AND attempt_id = ?" : ""} ORDER BY id ASC LIMIT 1001`,
      ...[last, opts.missionId, opts.attemptId].filter((item) => item != null),
    );
    if (rows.length > 1000) {
      res.writeHead(200, sseHeaders());
      res.write(`event: resync\ndata: {}\n\n`);
      res.end();
      return;
    }
    res.writeHead(200, sseHeaders());
    const client = { id: this.sseSeq++, res, missionId: opts.missionId, attemptId: opts.attemptId, last, queued: 0 };
    for (const row of rows) {
      this.writeSse(client, "message", String(row.id), JSON.stringify(publicEvent(row, false)));
      client.last = row.id;
    }
    this.sse.push(client);
    res.on("close", () => {
      this.sse = this.sse.filter((item) => item !== client);
    });
  }

  tick(): void {
    this.reloadPolicy();
    this.expireApprovals();
    this.heartbeats();
    this.reconcile();
    this.promoteQueue();
    this.checkBypass();
    this.sseHeartbeat();
    this.purgeIdempotency();
  }

  private heartbeats(): void {
    if (!this.heartbeatsEnabled) return;
    const now = this.clock.now();
    for (const attempt of this.activeAttempts()) {
      const next = this.nextHeartbeat.get(attempt.id) ?? now;
      if (now < next) continue;
      if (!this.processAlive(attempt)) continue;
      this.nextHeartbeat.set(attempt.id, now + this.config.leases.heartbeat_s * 1000);
      const exp = iso(now + this.config.leases.stale_after_s * 1000);
      this.run(
        "UPDATE workspaces SET lease_expires_at = ?, state = CASE WHEN state = 'stale' THEN state ELSE 'leased' END WHERE id = ?",
        exp,
        attempt.workspace_id,
      );
      const last = this.lastBeatEvent.get(attempt.id) ?? 0;
      if (now - last >= 60_000) {
        this.emit("attempt.heartbeat", { attemptId: attempt.id, missionId: attempt.mission_id, taskId: attempt.task_id, actor: `adapter:${attempt.runtime}` }, {
          lease_expires_at: exp,
        });
        this.lastBeatEvent.set(attempt.id, now);
      }
    }
  }

  private expireApprovals(): void {
    const now = this.nowIso();
    const due = this.all("SELECT * FROM approvals WHERE state = 'pending' AND expires_at <= ?", now);
    for (const approval of due) {
      this.tx(() => {
        const changed = this.run("UPDATE approvals SET state = 'expired', reason = COALESCE(reason, 'approval timed out') WHERE id = ? AND state = 'pending'", approval.id);
        if (!changed.changes) return;
        const attempt = this.attempt(approval.attempt_id);
        this.emit("approval.expired", { attemptId: approval.attempt_id, missionId: attempt?.mission_id, taskId: attempt?.task_id, actor: "daemon" }, { id: approval.id });
        if (attempt && attempt.state === "waiting_approval") this.setAttempt(attempt.id, "running");
      });
      this.approvalWaiters.get(approval.id)?.({ effect: "deny", reason: "approval timed out" });
      this.approvalWaiters.delete(approval.id);
    }
  }

  private reconcile(): void {
    const now = this.clock.now();
    for (const workspace of this.all("SELECT * FROM workspaces WHERE state = 'leased' AND lease_expires_at IS NOT NULL")) {
      if (Date.parse(workspace.lease_expires_at) > now) continue;
      this.tx(() => {
        const current = this.one("SELECT * FROM workspaces WHERE id = ?", workspace.id);
        if (!current || current.state !== "leased") return;
        this.run("UPDATE workspaces SET state = 'stale' WHERE id = ?", workspace.id);
        this.emit("workspace.lease_stale", { attemptId: current.lease_attempt_id, actor: "daemon" }, { workspace_id: workspace.id });
      });
    }
    for (const attempt of this.activeAttempts()) {
      const alive = this.processAlive(attempt);
      if (!alive && attempt.pid) {
        if (!this.exiting.has(attempt.id)) this.finishLost(attempt.id);
        continue;
      }
      if (attempt.state !== "waiting_approval") {
        const idleFor = now - (this.lastBeatEvent.get(attempt.id) ?? Date.parse(attempt.started_at ?? attempt.created_at));
        if (idleFor > this.config.attempts.idle_warning_s * 1000) attempt.idle = true;
      }
      this.ingest(attempt.id);
    }
    this.noteOrphans();
  }

  private checkBypass(): void {
    const limit = this.config.attempts.gate_bypass_ms;
    for (const [key, seen] of this.bypassAt) {
      if (this.clock.now() - seen < limit) continue;
      const [attemptId, toolUse] = key.split(":");
      this.bypassAt.delete(key);
      const attempt = this.attempt(attemptId!);
      if (!attempt || ["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(attempt.state)) continue;
      this.run("UPDATE attempts SET end_reason = 'gate_bypass' WHERE id = ? AND end_reason IS NULL", attemptId);
      void this.cancelAttempt(attemptId!, "gate_bypass", "failed");
    }
  }

  private sseHeartbeat(): void {
    // Real-time heartbeats are sent by the HTTP interval using the clock delta stored per client.
  }

  pulseSse(): void {
    for (const client of this.sse) client.res.write(`: heartbeat ${this.nowIso()}\n\n`);
  }

  private purgeIdempotency(): void {
    const cutoff = iso(this.clock.now() - 24 * 60 * 60 * 1000);
    this.run("DELETE FROM idempotency_keys WHERE created_at < ?", cutoff);
  }

  private noteOrphans(): void {
    // Doctor reports them. The reconciler does not delete anything by itself.
  }

  processAlive(attempt: SqlRow): boolean {
    if (!attempt.pid) return false;
    const ident = processIdentity(Number(attempt.pid));
    if (!ident.alive) return false;
    if (attempt.proc_start_time && ident.startTime && String(attempt.proc_start_time) !== String(ident.startTime)) return false;
    return true;
  }

  private activeAttempts(): SqlRow[] {
    return this.all(
      `SELECT a.*, t.mission_id FROM attempts a JOIN tasks t ON t.id = a.task_id WHERE a.state IN ('starting', 'running', 'waiting_approval')`,
    );
  }

  createMission(input: { title: string; repo?: string; budget?: string; criteria?: string[]; objective?: string }): SqlRow {
    if (!input.title?.trim()) throw new AgentError("invalid_argument", "Title is required", 400);
    return this.tx(() => {
      let repoId: string | null = null;
      if (input.repo) repoId = this.addRepo(input.repo).id;
      const budget = input.budget != null ? usdToNano(input.budget) : null;
      const id = ulid(this.clock.now());
      let slug = slugify(input.title);
      let n = 2;
      while (this.one("SELECT id FROM missions WHERE slug = ?", slug)) slug = `${slugify(input.title)}-${n++}`;
      const now = this.nowIso();
      this.run(
        "INSERT INTO missions (id, slug, title, objective, repo_id, state, budget_nusd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)",
        id,
        slug,
        input.title.trim(),
        input.objective ?? null,
        repoId,
        budget,
        now,
        now,
      );
      (input.criteria ?? []).forEach((value, index) => {
        const parsed = parseCriterion(value);
        this.run(
          "INSERT INTO mission_criteria (id, mission_id, seq, kind, value) VALUES (?, ?, ?, ?, ?)",
          ulid(this.clock.now() + index),
          id,
          index + 1,
          parsed.kind,
          parsed.value,
        );
      });
      this.emit("mission.created", { missionId: id, actor: "user" }, { title: input.title.trim(), slug });
      return this.missionView(id);
    });
  }

  listMissions(): SqlRow[] {
    return this.all("SELECT id FROM missions WHERE archived_at IS NULL ORDER BY created_at DESC, id DESC").map((row) => this.missionView(row.id));
  }

  missionView(id: string): SqlRow {
    const mission = this.one("SELECT * FROM missions WHERE id = ?", id);
    if (!mission) throw new AgentError("not_found", "Mission not found", 404);
    const repo = mission.repo_id ? this.one("SELECT * FROM repos WHERE id = ?", mission.repo_id) : null;
    const counts: Record<string, number> = {};
    for (const row of this.all("SELECT state, COUNT(*) AS n FROM tasks WHERE mission_id = ? GROUP BY state", id)) counts[row.state] = row.n;
    const pending = this.one(
      `SELECT COUNT(*) AS n FROM approvals p JOIN attempts a ON a.id = p.attempt_id JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ? AND p.state = 'pending'`,
      id,
    );
    const running = this.all(
      `SELECT a.id, a.runtime, a.state, a.gated FROM attempts a JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ? AND a.state IN ('starting','running','waiting_approval','queued')`,
      id,
    );
    const failed = this.one("SELECT COUNT(*) AS n FROM tasks WHERE mission_id = ? AND state = 'failed'", id);
    let display = mission.state;
    if (mission.state === "active" && Number(pending?.n) > 0) display = "waiting_on_you";
    else if (mission.state === "active" && Number(failed?.n) > 0) display = "blocked";
    return {
      ...mission,
      repo: repo ? { id: repo.id, name: repo.name, root_path: repo.root_path, base_branch: repo.base_branch } : null,
      criteria: this.all("SELECT * FROM mission_criteria WHERE mission_id = ? ORDER BY seq", id),
      task_counts: counts,
      pending_approvals: Number(pending?.n ?? 0),
      running_attempts: running,
      display_state: display,
      budget_usd: mission.budget_nusd == null ? null : mission.budget_nusd / NANO_PER_USD,
      spent_usd: mission.spent_nusd / NANO_PER_USD,
    };
  }

  updateMission(id: string, patch: { title?: string; budget?: string; criteria?: string[]; objective?: string }): SqlRow {
    const mission = this.mustMission(id);
    if (mission.state !== "draft" && patch.criteria) {
      // budget can be raised later; criteria edits are for drafts
    }
    return this.tx(() => {
      const before = { title: mission.title, budget_nusd: mission.budget_nusd, objective: mission.objective };
      if (patch.title) this.run("UPDATE missions SET title = ? WHERE id = ?", patch.title, id);
      if (patch.objective != null) this.run("UPDATE missions SET objective = ? WHERE id = ?", patch.objective, id);
      if (patch.budget != null) this.run("UPDATE missions SET budget_nusd = ? WHERE id = ?", usdToNano(patch.budget), id);
      if (patch.criteria) {
        this.run("DELETE FROM mission_criteria WHERE mission_id = ?", id);
        patch.criteria.forEach((value, index) => {
          const parsed = parseCriterion(value);
          this.run("INSERT INTO mission_criteria (id, mission_id, seq, kind, value) VALUES (?, ?, ?, ?, ?)", ulid(), id, index + 1, parsed.kind, parsed.value);
        });
      }
      this.run("UPDATE missions SET updated_at = ? WHERE id = ?", this.nowIso(), id);
      const after = this.one("SELECT title, budget_nusd, objective FROM missions WHERE id = ?", id);
      this.emit("mission.updated", { missionId: id, actor: "user" }, { old: before, new: after });
      return this.missionView(id);
    });
  }

  startMission(id: string): SqlRow {
    const mission = this.mustMission(id);
    assertTransition("mission", mission.state, "active");
    const missing: string[] = [];
    if (!mission.repo_id) missing.push("repo");
    if (mission.budget_nusd == null) missing.push("budget");
    const tasks = this.all("SELECT id FROM tasks WHERE mission_id = ?", id);
    if (!tasks.length) missing.push("task");
    if (missing.length) throw new AgentError("mission_incomplete", `Mission is missing ${missing.join(", ")}`, 400, { missing });
    return this.tx(() => {
      this.run("UPDATE missions SET state = 'active', started_at = ?, updated_at = ? WHERE id = ?", this.nowIso(), this.nowIso(), id);
      this.emit("mission.started", { missionId: id, actor: "user" }, {});
      this.refreshTaskReadiness(id);
      return this.missionView(id);
    });
  }

  cancelMission(id: string): SqlRow {
    const mission = this.mustMission(id);
    assertTransition("mission", mission.state, "cancelled");
    const running = this.all(
      `SELECT a.* FROM attempts a JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ? AND a.state IN ('queued','starting','running','waiting_approval')`,
      id,
    );
    for (const attempt of running) void this.cancelAttempt(attempt.id, "mission cancelled");
    return this.tx(() => {
      this.run("UPDATE approvals SET state = 'cancelled' WHERE state = 'pending' AND attempt_id IN (SELECT a.id FROM attempts a JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ?)", id);
      for (const task of this.all("SELECT * FROM tasks WHERE mission_id = ? AND state NOT IN ('passed', 'cancelled')", id)) {
        this.setTask(task.id, "cancelled");
      }
      for (const workspace of this.all(
        `SELECT w.* FROM workspaces w JOIN attempts a ON a.workspace_id = w.id JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ? AND w.state IN ('leased','creating','stale')`,
        id,
      )) {
        this.releaseWorkspaceRow(workspace.id);
      }
      this.run("UPDATE missions SET state = 'cancelled', ended_at = ?, updated_at = ? WHERE id = ?", this.nowIso(), this.nowIso(), id);
      this.emit("mission.cancelled", { missionId: id, actor: "user" }, {});
      return this.missionView(id);
    });
  }

  archiveMission(id: string): SqlRow {
    this.mustMission(id);
    this.run("UPDATE missions SET archived_at = ?, updated_at = ? WHERE id = ?", this.nowIso(), this.nowIso(), id);
    return this.missionView(id);
  }

  addRepo(inputPath: string, testCommand?: string, base?: string): SqlRow {
    const inspected = inspectMainCheckout(inputPath, base);
    const existing = this.one("SELECT * FROM repos WHERE root_path = ?", inspected.root);
    if (existing) return existing;
    const id = ulid(this.clock.now());
    const name = inspected.root.split("/").pop() || "repo";
    this.run(
      "INSERT INTO repos (id, root_path, name, base_branch, test_command, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      inspected.root,
      name,
      inspected.baseBranch,
      testCommand ?? null,
      this.nowIso(),
    );
    return this.one("SELECT * FROM repos WHERE id = ?", id)!;
  }

  listRepos(): SqlRow[] {
    return this.all("SELECT * FROM repos WHERE archived_at IS NULL ORDER BY created_at DESC");
  }

  addProfile(input: { name: string; runtime: string; model?: string; tools: string[]; overlay?: string; budget?: string; allowUngated?: boolean }): SqlRow {
    if (!["claude-code", "codex"].includes(input.runtime)) throw new AgentError("invalid_argument", "Unknown runtime", 400);
    if (input.overlay) parsePolicy(input.overlay, `profile:${input.name}`);
    const now = this.nowIso();
    const id = ulid(this.clock.now());
    this.run(
      "INSERT INTO profiles (id, name, runtime, model, tools, policy_overlay, attempt_budget_nusd, allow_ungated, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      input.name,
      input.runtime,
      input.model ?? null,
      JSON.stringify(input.tools),
      input.overlay ?? null,
      input.budget != null ? usdToNano(input.budget) : null,
      input.allowUngated ? 1 : 0,
      now,
      now,
    );
    return this.one("SELECT * FROM profiles WHERE id = ?", id)!;
  }

  updateProfile(name: string, patch: { model?: string; tools?: string[]; overlay?: string; allowUngated?: boolean; budget?: string }): SqlRow {
    const profile = this.one("SELECT * FROM profiles WHERE name = ?", name);
    if (!profile) throw new AgentError("not_found", "Profile not found", 404);
    if (patch.overlay) parsePolicy(patch.overlay, `profile:${name}`);
    this.run(
      "UPDATE profiles SET model = COALESCE(?, model), tools = COALESCE(?, tools), policy_overlay = COALESCE(?, policy_overlay), allow_ungated = COALESCE(?, allow_ungated), attempt_budget_nusd = COALESCE(?, attempt_budget_nusd), updated_at = ? WHERE id = ?",
      patch.model ?? null,
      patch.tools ? JSON.stringify(patch.tools) : null,
      patch.overlay ?? null,
      patch.allowUngated == null ? null : patch.allowUngated ? 1 : 0,
      patch.budget != null ? usdToNano(patch.budget) : null,
      this.nowIso(),
      profile.id,
    );
    return this.one("SELECT * FROM profiles WHERE id = ?", profile.id)!;
  }

  listProfiles(): SqlRow[] {
    return this.all("SELECT * FROM profiles ORDER BY name");
  }

  addTask(missionRef: string, title: string, opts: { profile?: string; after?: string[]; description?: string; noVerify?: boolean }): SqlRow {
    const mission = this.missionByRef(missionRef);
    if (!title.trim()) throw new AgentError("invalid_argument", "Task title is required", 400);
    const profile = this.one("SELECT * FROM profiles WHERE name = ?", opts.profile || "claude-default");
    if (!profile) throw new AgentError("invalid_argument", "Profile not found", 400);
    return this.tx(() => {
      const seqRow = this.one("SELECT COALESCE(MAX(seq), 0) AS n FROM tasks WHERE mission_id = ?", mission.id);
      const seq = Number(seqRow?.n ?? 0) + 1;
      const id = ulid(this.clock.now());
      const now = this.nowIso();
      const repo = mission.repo_id ? this.one("SELECT * FROM repos WHERE id = ?", mission.repo_id) : null;
      const unverified = opts.noVerify || !repo?.test_command ? 1 : 0;
      this.run(
        "INSERT INTO tasks (id, mission_id, seq, kind, title, description, profile_id, state, unverified, created_at, updated_at) VALUES (?, ?, ?, 'work', ?, ?, ?, 'pending', ?, ?, ?)",
        id,
        mission.id,
        seq,
        title.trim(),
        opts.description ?? null,
        profile.id,
        unverified,
        now,
        now,
      );
      for (const depRef of opts.after ?? []) {
        const dep = this.one("SELECT * FROM tasks WHERE id = ?", depRef) ?? this.taskByRef(mission.id, depRef);
        if (dep.mission_id !== mission.id) throw new AgentError("cross_mission_dependency", "Dependencies must stay inside the mission", 400);
        this.assertNoCycle(id, dep.id);
        this.run("INSERT INTO task_deps (task_id, depends_on_task_id) VALUES (?, ?)", id, dep.id);
      }
      this.emit("task.created", { missionId: mission.id, taskId: id, actor: "user" }, { title, seq, kind: "work" });
      if (!unverified) {
        const verifyId = ulid(this.clock.now() + 1);
        const verifySeq = seq + 1;
        this.run(
          "INSERT INTO tasks (id, mission_id, seq, kind, title, profile_id, verifies_task_id, state, unverified, created_at, updated_at) VALUES (?, ?, ?, 'verify', ?, NULL, ?, 'pending', 0, ?, ?)",
          verifyId,
          mission.id,
          verifySeq,
          `Verify: ${title.trim()}`,
          id,
          now,
          now,
        );
        this.run("INSERT INTO task_deps (task_id, depends_on_task_id) VALUES (?, ?)", verifyId, id);
        this.emit("task.created", { missionId: mission.id, taskId: verifyId, actor: "daemon" }, { title: `Verify: ${title.trim()}`, kind: "verify" });
      }
      if (mission.state === "active") this.refreshTaskReadiness(mission.id);
      return this.one("SELECT * FROM tasks WHERE id = ?", id)!;
    });
  }

  private assertNoCycle(taskId: string, dependsOn: string): void {
    const edges = this.all("SELECT task_id, depends_on_task_id FROM task_deps");
    const graph = new Map<string, string[]>();
    for (const edge of edges) {
      const list = graph.get(edge.task_id) ?? [];
      list.push(edge.depends_on_task_id);
      graph.set(edge.task_id, list);
    }
    const extra = graph.get(taskId) ?? [];
    extra.push(dependsOn);
    graph.set(taskId, extra);
    const color = new Map<string, number>();
    const visit = (node: string): boolean => {
      const state = color.get(node) ?? 0;
      if (state === 1) return true;
      if (state === 2) return false;
      color.set(node, 1);
      for (const next of graph.get(node) ?? []) if (visit(next)) return true;
      color.set(node, 2);
      return false;
    };
    if (visit(taskId)) throw new AgentError("dependency_cycle", "That dependency would create a cycle", 409);
  }

  addDependency(taskId: string, dependsOn: string): SqlRow {
    const task = this.one("SELECT * FROM tasks WHERE id = ?", taskId);
    const dep = this.one("SELECT * FROM tasks WHERE id = ?", dependsOn);
    if (!task || !dep) throw new AgentError("not_found", "Task not found", 404);
    if (task.mission_id !== dep.mission_id) throw new AgentError("cross_mission_dependency", "Dependencies must stay inside the mission", 400);
    this.tx(() => {
      this.assertNoCycle(task.id, dep.id);
      this.run("INSERT INTO task_deps (task_id, depends_on_task_id) VALUES (?, ?)", task.id, dep.id);
    });
    return task;
  }

  listTasks(missionRef: string): SqlRow[] {
    const mission = this.missionByRef(missionRef);
    return this.all("SELECT * FROM tasks WHERE mission_id = ? ORDER BY seq", mission.id);
  }

  private refreshTaskReadiness(missionId: string): void {
    const tasks = this.all("SELECT * FROM tasks WHERE mission_id = ?", missionId);
    for (const task of tasks) {
      if (task.kind === "verify" || task.state !== "pending") continue;
      const deps = this.all("SELECT depends_on_task_id FROM task_deps WHERE task_id = ?", task.id);
      const ready = deps.every((dep) => this.one("SELECT state FROM tasks WHERE id = ?", dep.depends_on_task_id)?.state === "passed");
      if (ready || deps.length === 0) this.setTask(task.id, "ready");
    }
  }

  async startAttempt(taskRef: string, opts: { profile?: string; parallel?: boolean } = {}): Promise<SqlRow> {
    if (!this.accepting) throw new AgentError("daemon_stopping", "Daemon is stopping and is not accepting new attempts", 409);
    const task = this.taskGlobal(taskRef);
    if (task.kind !== "work") throw new AgentError("invalid_argument", "Only work tasks are started directly", 400);
    const mission = this.mustMission(task.mission_id);
    if (mission.state !== "active") throw new AgentError("invalid_transition", "Mission is not active", 409, { from: mission.state, to: "running" });
    if (!["ready", "failed"].includes(task.state) && !(opts.parallel && task.state === "running")) {
      if (task.state === "running" && !opts.parallel) throw new AgentError("attempt_already_running", "An attempt is already running for this task", 409);
      if (task.state !== "ready") throw new AgentError("invalid_transition", `Task is ${task.state}`, 409, { from: task.state, to: "running" });
    }
    const profile = opts.profile ? this.one("SELECT * FROM profiles WHERE name = ?", opts.profile) : this.one("SELECT * FROM profiles WHERE id = ?", task.profile_id);
    if (!profile) throw new AgentError("invalid_argument", "Profile not found", 400);
    this.assertBudget(mission, profile);
    const running = Number(this.one("SELECT COUNT(*) AS n FROM attempts WHERE state IN ('starting','running','waiting_approval')")?.n ?? 0);
    const seq = Number(this.one("SELECT COALESCE(MAX(seq), 0) AS n FROM attempts WHERE task_id = ?", task.id)?.n ?? 0) + 1;
    const id = ulid(this.clock.now());
    const capabilities = profile.runtime === "codex" ? codexCapabilities() : claudeCapabilities();
    let gated = capabilities.policy_coverage;
    if (gated === "none" && !profile.allow_ungated) {
      throw new AgentError("invalid_argument", "Ungated runtimes require allow_ungated on the profile", 400);
    }
    const now = this.nowIso();
    this.tx(() => {
      const state = running >= this.config.daemon.max_running_attempts ? "queued" : "starting";
      this.run(
        `INSERT INTO attempts (id, task_id, seq, runtime, profile_snapshot, state, gated, gate_token, created_at, review_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none')`,
        id,
        task.id,
        seq,
        profile.runtime,
        JSON.stringify(profile),
        state,
        gated,
        randomBytes(24).toString("hex"),
        now,
      );
      if (state === "queued") this.emit("attempt.queued", { missionId: mission.id, taskId: task.id, attemptId: id, actor: "daemon" }, {});
      if (task.state === "ready" || task.state === "failed") this.setTask(task.id, "running");
    });
    const created = this.attempt(id)!;
    if (created.state === "queued") return this.attemptView(id);
    await this.launch(id);
    return this.attemptView(id);
  }

  private assertBudget(mission: SqlRow, profile: SqlRow): void {
    if (mission.budget_nusd != null && mission.spent_nusd >= mission.budget_nusd && !mission.spent_includes_unknown) {
      throw new AgentError("budget_exhausted", "Mission budget is exhausted", 409);
    }
    if (profile.attempt_budget_nusd != null && profile.attempt_budget_nusd <= 0) {
      throw new AgentError("budget_exhausted", "Attempt budget is exhausted", 409);
    }
  }

  private async promoteQueue(): Promise<void> {
    const running = Number(this.one("SELECT COUNT(*) AS n FROM attempts WHERE state IN ('starting','running','waiting_approval')")?.n ?? 0);
    const room = this.config.daemon.max_running_attempts - running;
    if (room <= 0) return;
    const queued = this.all("SELECT id FROM attempts WHERE state = 'queued' ORDER BY created_at ASC LIMIT ?", room);
    for (const row of queued) {
      this.tx(() => this.setAttempt(row.id, "starting"));
      await this.launch(row.id);
    }
  }

  private async launch(attemptId: string): Promise<void> {
    const attempt = this.attempt(attemptId)!;
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    const mission = this.mustMission(task.mission_id);
    const repo = this.one("SELECT * FROM repos WHERE id = ?", mission.repo_id);
    if (!repo) throw new AgentError("mission_incomplete", "Mission has no repo", 400);
    const profile = JSON.parse(attempt.profile_snapshot);
    const command = profile.runtime === "codex" ? codexCommand(this.config.runtimes.codex.command) : claudeCommand(this.config.runtimes["claude-code"].command);
    this.assertLiveAllowed(command);
    if (profile.runtime === "claude-code") {
      const info = checkClaude(command);
      if (!info.installed) throw new AgentError("runtime_not_installed", "Claude Code is not installed", 400);
      if (!info.meetsMin) {
        throw new AgentError("runtime_too_old", `Claude Code ${info.version} is older than ${CLAUDE_MIN_VERSION}`, 400, {
          version: info.version,
          minimum: CLAUDE_MIN_VERSION,
        });
      }
    }
    if (profile.runtime === "codex") {
      const info = checkCodex(command);
      if (!info.installed) throw new AgentError("runtime_not_installed", "Codex is not installed", 400);
    }
    const workspace = this.createWorkspace(repo, mission, task, attempt);
    const prompt = buildPrompt(mission, this.all("SELECT * FROM mission_criteria WHERE mission_id = ? ORDER BY seq", mission.id), task);
    const attemptDir = join(this.home, "attempts", attempt.id);
    mkdirSync(attemptDir, { recursive: true, mode: 0o700 });
    const promptPath = join(attemptDir, "prompt.md");
    writeFileSync(promptPath, prompt, { mode: 0o600 });
    const logPath = join(this.home, "logs", "attempts", `${attempt.id}.jsonl`);
    const stderrPath = `${logPath.replace(/\.jsonl$/, "")}.stderr.log`;
    writeFileSync(logPath, "", { mode: 0o600 });
    writeFileSync(stderrPath, "", { mode: 0o600 });
    const remaining = this.remainingBudget(mission, profile);
    if (profile.runtime === "codex") {
      await this.launchCodex({ attempt, task, mission, workspace, prompt, command, logPath, stderrPath, profile, remaining });
    } else {
      await this.launchClaude({ attempt, task, mission, workspace, prompt, command, logPath, stderrPath, promptPath, profile, remaining });
    }
  }

  private createWorkspace(repo: SqlRow, mission: SqlRow, task: SqlRow, attempt: SqlRow): SqlRow {
    const inspected = inspectMainCheckout(repo.root_path, repo.base_branch);
    const id = ulid(this.clock.now());
    let branch = `agentos/${mission.slug}/${task.seq}-a${attempt.seq}`;
    let n = 2;
    while (branchExists(repo.root_path, branch)) {
      branch = `agentos/${mission.slug}/${task.seq}-a${attempt.seq}-${n++}`;
    }
    if (checkedOutBranches(repo.root_path).has(branch)) {
      throw new AgentError("branch_in_use", `Branch ${branch} is already checked out`, 409, { branch });
    }
    const path = join(this.home, "worktrees", repo.id, id);
    mkdirSync(join(this.home, "worktrees", repo.id), { recursive: true, mode: 0o700 });
    if (pathsOverlap(path, repo.root_path)) throw new AgentError("path_overlap", "Workspace path overlaps the main checkout", 409);
    for (const other of this.all("SELECT path FROM workspaces WHERE state != 'removed'")) {
      if (pathsOverlap(path, other.path)) throw new AgentError("path_overlap", "Workspace path overlaps another workspace", 409);
    }
    if (resolve(path) === resolve(repo.root_path)) throw new AgentError("main_checkout_forbidden", "Agents cannot run in the main checkout", 409);
    addWorktree(repo.root_path, branch, path, inspected.head);
    const now = this.nowIso();
    this.tx(() => {
      this.run(
        "INSERT INTO workspaces (id, repo_id, path, branch, base_commit, state, lease_attempt_id, lease_expires_at, created_at) VALUES (?, ?, ?, ?, ?, 'leased', ?, ?, ?)",
        id,
        repo.id,
        path,
        branch,
        inspected.head,
        attempt.id,
        iso(this.clock.now() + this.config.leases.stale_after_s * 1000),
        now,
      );
      this.run("UPDATE attempts SET workspace_id = ?, base_dirty = ?, log_path = COALESCE(log_path, log_path) WHERE id = ?", id, inspected.dirty ? 1 : 0, attempt.id);
      this.emit("workspace.created", { missionId: mission.id, taskId: task.id, attemptId: attempt.id, actor: "daemon" }, { path, branch, base: inspected.head });
      this.emit("workspace.leased", { missionId: mission.id, taskId: task.id, attemptId: attempt.id, actor: "daemon" }, { workspace_id: id });
    });
    return this.one("SELECT * FROM workspaces WHERE id = ?", id)!;
  }

  private async launchClaude(input: any): Promise<void> {
    const session = randomUUID();
    const settingsPath = join(this.home, "attempts", input.attempt.id, "settings.json");
    const gateUrl = `http://127.0.0.1:${this.port || this.config.daemon.port}/gate/claude/${input.attempt.id}`;
    const timeout = this.config.approvals.timeout_s + 60;
    writeFileSync(settingsPath, JSON.stringify(claudeSettings(gateUrl, timeout), null, 2), { mode: 0o600 });
    const budgetUsd = input.remaining == null ? null : (Math.max(input.remaining, 0) / NANO_PER_USD).toFixed(6);
    const args = claudeSpawnArgs({
      command: input.command,
      sessionId: session,
      settingsPath,
      model: input.profile.model,
      maxBudgetUsd: budgetUsd,
    });
    const out = openSync(input.logPath, "a");
    const err = openSync(input.stderrPath, "a");
    const child = spawn(input.command[0], args, {
      cwd: input.workspace.path,
      detached: true,
      stdio: ["pipe", out, err],
      env: runtimeEnv(input.attempt.gate_token, this.config.runtimes["claude-code"].scenario),
    });
    child.stdin?.write(readFileSync(input.promptPath));
    child.stdin?.end();
    child.unref();
    const ident = processIdentity(child.pid ?? 0);
    this.children.set(input.attempt.id, { child, kind: "claude", logPath: input.logPath });
    child.on("exit", (code, signal) => {
      void this.onRuntimeExit(input.attempt.id, code, signal);
    });
    this.tx(() => {
      this.run(
        "UPDATE attempts SET state = 'running', runtime_session_id = ?, pid = ?, proc_start_time = ?, log_path = ?, stderr_path = ?, started_at = ?, workspace_id = ? WHERE id = ?",
        session,
        child.pid ?? null,
        ident.startTime,
        input.logPath,
        input.stderrPath,
        this.nowIso(),
        input.workspace.path ? input.workspace.id : input.workspace.id,
        input.attempt.id,
      );
    });
    this.nextHeartbeat.set(input.attempt.id, this.clock.now() + this.config.leases.heartbeat_s * 1000);
    await this.waitForLog(input.attempt.id, 2000);
  }

  private async launchCodex(input: any): Promise<void> {
    const scenario = this.config.runtimes.codex.scenario;
    const child = spawn(input.command[0], [...input.command.slice(1)], {
      cwd: input.workspace.path,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: runtimeEnv(input.attempt.gate_token, scenario),
    });
    const stderr: Buffer[] = [];
    child.stderr?.on("data", (chunk) => {
      stderr.push(Buffer.from(chunk));
      appendFileSync(input.stderrPath, chunk);
    });
    const exited = new Promise<number>((resolveExit) => {
      child.once("exit", (code) => resolveExit(code ?? 1));
    });
    const ready = new Promise<boolean>((resolveReady) => {
      const timer = setTimeout(() => resolveReady(false), 400);
      child.once("exit", () => {
        clearTimeout(timer);
        resolveReady(false);
      });
      child.stdout?.once("data", () => {
        clearTimeout(timer);
        resolveReady(true);
      });
    });
    const send = (message: unknown) => child.stdin?.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { client: "agentos" } });
    const ok = await Promise.race([ready, exited.then(() => false)]);
    if (!ok) {
      const text = Buffer.concat(stderr).toString("utf8");
      if (input.profile.allow_ungated) {
        this.run("UPDATE attempts SET gated = 'none' WHERE id = ?", input.attempt.id);
        await this.launchCodexFallback(input);
        return;
      }
      this.failStart(input.attempt.id, "codex_app_server_unavailable", text || "Codex app server unavailable");
      throw new AgentError("codex_app_server_unavailable", "Codex app server is not available. Set allow_ungated to use the JSONL fallback.", 400);
    }
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "thread/start",
      params: { cwd: input.workspace.path, sandbox: "workspace-write", approvalPolicy: "untrusted" },
    });
    send({ jsonrpc: "2.0", id: 3, method: "turn/start", params: { threadId: "pending", prompt: readFileSync(join(this.home, "attempts", input.attempt.id, "prompt.md"), "utf8"), approvalPolicy: "untrusted" } });
    this.children.set(input.attempt.id, { child, kind: "codex" });
    this.codexWaiters.set(input.attempt.id, new Map());
    child.on("exit", (code, signal) => void this.onRuntimeExit(input.attempt.id, code, signal));
    const ident = processIdentity(child.pid ?? 0);
    this.tx(() => {
      this.run(
        "UPDATE attempts SET state = 'running', pid = ?, proc_start_time = ?, log_path = ?, stderr_path = ?, started_at = ? WHERE id = ?",
        child.pid ?? null,
        ident.startTime,
        input.logPath,
        input.stderrPath,
        this.nowIso(),
        input.attempt.id,
      );
      this.emit("attempt.started", { missionId: input.mission.id, taskId: input.task.id, attemptId: input.attempt.id, actor: "adapter:codex" }, {
        session_id: null,
        model: input.profile.model,
      });
    });
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      appendFileSync(input.logPath, chunk);
      this.ingest(input.attempt.id);
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        void this.onCodexLine(input.attempt.id, line);
        nl = buffer.indexOf("\n");
      }
    });
    child.unref();
  }

  private async launchCodexFallback(input: any): Promise<void> {
    const child = spawn(input.command[0], [...input.command.slice(1), "--jsonl"], {
      cwd: input.workspace.path,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: runtimeEnv(input.attempt.gate_token, this.config.runtimes.codex.scenario),
    });
    child.stdin?.end();
    this.children.set(input.attempt.id, { child, kind: "codex" });
    const ident = processIdentity(child.pid ?? 0);
    this.tx(() => {
      this.run(
        "UPDATE attempts SET state = 'running', gated = 'none', pid = ?, proc_start_time = ?, started_at = ?, log_path = ? WHERE id = ?",
        child.pid,
        ident.startTime,
        this.nowIso(),
        input.logPath,
        input.attempt.id,
      );
      this.emit("attempt.started", { missionId: input.mission.id, taskId: input.task.id, attemptId: input.attempt.id, actor: "adapter:codex" }, { gated: "none" });
    });
    child.stdout?.on("data", (chunk) => appendFileSync(input.logPath, chunk));
    child.on("exit", (code, signal) => void this.onRuntimeExit(input.attempt.id, code, signal));
    child.unref();
  }

  private failStart(attemptId: string, reason: string, detail: string): void {
    const attempt = this.attempt(attemptId);
    if (!attempt) return;
    this.tx(() => {
      this.run("UPDATE attempts SET state = 'failed', end_reason = ?, ended_at = ? WHERE id = ?", reason, this.nowIso(), attemptId);
      this.emit("attempt.exited", { attemptId, taskId: attempt.task_id, actor: "daemon" }, { reason, detail });
      this.setTask(attempt.task_id, "failed");
    });
  }

  private async onCodexLine(attemptId: string, line: string): Promise<void> {
    const parsed = parseCodexLine(line);
    if (!parsed) return;
    const attempt = this.attempt(attemptId);
    if (!attempt) return;
    if (!parsed.approval) return;
    const tool = parsed.approval.kind === "command" ? "Bash" : "Edit";
    const paths = parsed.approval.paths ?? [];
    const arg = parsed.approval.command || paths[0] || "";
    const decision = await this.gateCall({
      attempt,
      tool,
      arg,
      input: parsed.approval,
      toolUseId: String(parsed.approval.id),
      paths,
    });
    const effect = decision.effect === "allow" ? "accept" : decision.effect === "cancel" ? "cancel" : "decline";
    const child = this.children.get(attemptId)?.child;
    child?.stdin?.write(codexDecision(parsed.approval.id, effect as "accept" | "decline" | "cancel"));
  }

  private async waitForLog(attemptId: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      this.ingest(attemptId);
      if (this.one("SELECT id FROM events WHERE attempt_id = ? AND type = 'attempt.started'", attemptId)) return;
      await delay(20);
    }
  }

  ingest(attemptId: string): void {
    const attempt = this.attempt(attemptId);
    if (!attempt?.log_path || !existsSync(attempt.log_path)) return;
    const fd = openSync(attempt.log_path, "r");
    try {
      const size = fstatSync(fd).size;
      const offset = Number(attempt.log_offset ?? 0);
      if (size <= offset) return;
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      const text = buf.toString("utf8");
      const end = text.endsWith("\n") ? text.length : text.lastIndexOf("\n") + 1;
      if (end <= 0) return;
      const chunk = text.slice(0, end);
      let cursor = offset;
      const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id);
      const lines = chunk.split("\n");
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? "";
        if (index === lines.length - 1 && line === "") break;
        const events = attempt.runtime === "claude-code" ? parseClaudeLine(line, cursor) : [];
        if (attempt.runtime !== "claude-code") {
          const parsed = parseCodexLine(line);
          if (parsed?.event) events.push({ ...parsed.event, byteOffset: cursor });
        }
        for (const event of events) this.recordRuntimeEvent(attempt, event.type, event.payload, event.raw, task);
        cursor += Buffer.byteLength(line) + 1;
      }
      this.run("UPDATE attempts SET log_offset = ? WHERE id = ?", cursor, attemptId);
    } finally {
      closeSync(fd);
    }
  }

  private recordRuntimeEvent(attempt: SqlRow, type: string, payload: any, raw: unknown, task?: SqlRow): void {
    const missionId = task?.mission_id ?? this.one("SELECT mission_id FROM tasks WHERE id = ?", attempt.task_id)?.mission_id;
    if (type === "attempt.started") {
      const existing = this.one("SELECT id FROM events WHERE attempt_id = ? AND type = 'attempt.started'", attempt.id);
      if (existing) return;
      if (payload.session_id) this.run("UPDATE attempts SET runtime_session_id = COALESCE(runtime_session_id, ?) WHERE id = ?", payload.session_id, attempt.id);
    }
    if (type === "tool.requested" && payload.tool_use_id) {
      const seen = this.gateIds.get(attempt.id) ?? new Set<string>();
      if (!seen.has(String(payload.tool_use_id))) this.bypassAt.set(`${attempt.id}:${payload.tool_use_id}`, this.clock.now());
    }
    if (type === "attempt.result") {
      this.lastResult.set(attempt.id, { subtype: payload.subtype, usage: payload.usage, total_cost_usd: payload.total_cost_usd });
      if (payload.usage || payload.total_cost_usd != null) this.recordUsage(attempt, payload.usage, payload.total_cost_usd, payload.estimated ? "estimated" : "runtime_reported");
    }
    if (type === "usage.recorded" && payload.usage) {
      this.recordUsage(attempt, payload.usage, null, payload.estimated ? "estimated" : "runtime_reported");
    }
    this.emit(type, { missionId, taskId: attempt.task_id, attemptId: attempt.id, actor: `adapter:${attempt.runtime}` }, payload, raw);
  }

  private recordUsage(attempt: SqlRow, usage: any, totalCost: number | null, source: string): void {
    const profile = JSON.parse(attempt.profile_snapshot || "{}");
    const model = profile.model || usage?.model || null;
    let cost: number | null = null;
    let costSource = source;
    if (totalCost != null && source === "runtime_reported") cost = Math.ceil(totalCost * NANO_PER_USD);
    else if (usage) {
      const priced = this.priceUsage(model, usage);
      cost = priced.cost;
      costSource = priced.source;
    }
    this.tx(() => {
      this.run(
        `INSERT INTO usage (id, attempt_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_nusd, cost_source, price_table_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ulid(this.clock.now()),
        attempt.id,
        model,
        Number(usage?.input_tokens ?? 0),
        Number(usage?.output_tokens ?? 0),
        Number(usage?.cache_read_input_tokens ?? usage?.cached_input_tokens ?? 0),
        Number(usage?.cache_creation_input_tokens ?? 0),
        cost,
        costSource,
        this.priceTable.version,
        this.nowIso(),
      );
      this.recomputeSpend(attempt.task_id);
      this.emit("usage.recorded", { attemptId: attempt.id, taskId: attempt.task_id, actor: "daemon" }, { cost_nusd: cost, cost_source: costSource });
    });
    this.enforceBudget(attempt.task_id);
  }

  private priceUsage(model: string | null, usage: any): { cost: number | null; source: string } {
    if (!model || !this.priceTable.models[model]) return { cost: null, source: "unknown" };
    const price = this.priceTable.models[model];
    const parts = [
      [usage.input_tokens, price.input_per_million_nano],
      [usage.output_tokens, price.output_per_million_nano],
      [usage.cache_read_input_tokens ?? usage.cached_input_tokens, price.cache_read_per_million_nano ?? 0],
      [usage.cache_creation_input_tokens, price.cache_write_per_million_nano ?? 0],
    ];
    let total = 0;
    for (const [tokens, rate] of parts) total += Math.ceil((Number(tokens ?? 0) * Number(rate ?? 0)) / 1_000_000);
    return { cost: total, source: "estimated" };
  }

  private recomputeSpend(taskId: string): void {
    const task = this.one("SELECT * FROM tasks WHERE id = ?", taskId);
    if (!task) return;
    const rows = this.all(
      `SELECT u.cost_nusd, u.cost_source FROM usage u JOIN attempts a ON a.id = u.attempt_id JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ?`,
      task.mission_id,
    );
    let spent = 0;
    let estimated = 0;
    let unknown = 0;
    for (const row of rows) {
      if (row.cost_nusd == null || row.cost_source === "unknown") unknown = 1;
      else spent += Number(row.cost_nusd);
      if (row.cost_source === "estimated") estimated = 1;
    }
    this.run(
      "UPDATE missions SET spent_nusd = ?, spent_includes_estimated = ?, spent_includes_unknown = ?, updated_at = ? WHERE id = ?",
      spent,
      estimated,
      unknown,
      this.nowIso(),
      task.mission_id,
    );
  }

  private missionOverBudget(taskId: string): boolean {
    const task = this.one("SELECT * FROM tasks WHERE id = ?", taskId);
    if (!task) return false;
    const mission = this.mustMission(task.mission_id);
    return mission.budget_nusd != null && Number(mission.spent_nusd) >= Number(mission.budget_nusd) && !mission.spent_includes_unknown;
  }

  private enforceBudget(taskId: string): void {
    const task = this.one("SELECT * FROM tasks WHERE id = ?", taskId);
    if (!task) return;
    const mission = this.mustMission(task.mission_id);
    if (mission.budget_nusd == null) return;
    const ratio = mission.spent_nusd / mission.budget_nusd;
    if (ratio >= this.config.budget.warning_ratio && !mission.budget_warned) {
      this.tx(() => {
        this.run("UPDATE missions SET budget_warned = 1 WHERE id = ?", mission.id);
        this.emit("budget.warning", { missionId: mission.id, actor: "daemon" }, { ratio });
      });
    }
    if (mission.spent_nusd >= mission.budget_nusd) {
      const running = this.all(
        `SELECT a.id, a.pid FROM attempts a JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ? AND a.state IN ('starting','running','waiting_approval','queued')`,
        mission.id,
      );
      this.tx(() => {
        this.emit("budget.exhausted", { missionId: mission.id, actor: "daemon" }, { spent: mission.spent_nusd });
        this.run(
          `UPDATE attempts SET end_reason = 'budget' WHERE id IN (SELECT a.id FROM attempts a JOIN tasks t ON t.id = a.task_id WHERE t.mission_id = ?) AND state IN ('starting','running','waiting_approval','queued') AND end_reason IS NULL`,
          mission.id,
        );
      });
      for (const attempt of running) {
        this.finishAttempt(attempt.id, "budget_stopped", "budget", null, null);
        if (attempt.pid) void cancelProcess(Number(attempt.pid), this.config.attempts.cancel_grace_s * 1000);
      }
    }
  }

  private remainingBudget(mission: SqlRow, profile: SqlRow): number | null {
    const missionLeft = mission.budget_nusd == null ? null : Number(mission.budget_nusd) - Number(mission.spent_nusd);
    const attemptCap = profile.attempt_budget_nusd == null ? null : Number(profile.attempt_budget_nusd);
    if (missionLeft == null) return attemptCap;
    if (attemptCap == null) return missionLeft;
    return Math.min(missionLeft, attemptCap);
  }

  async gateClaude(attemptId: string, body: any, started: number): Promise<any> {
    const attempt = this.attempt(attemptId);
    if (!attempt) return denyBody("unknown attempt");
    if (["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(attempt.state)) return denyBody("attempt is no longer running");
    if (body?.hook_event_name && body.hook_event_name !== "PreToolUse") return null;
    const tool = String(body.tool_name ?? "unknown");
    const input = body.tool_input ?? {};
    let arg = tool;
    if (tool === "Bash" || tool === "bash") arg = String(input.command ?? "");
    else if (input.file_path) arg = String(input.file_path);
    else if (input.path) arg = String(input.path);
    else if (input.pattern) arg = String(input.pattern);
    if (String(tool).startsWith("mcp__")) arg = tool;
    const toolUseId = String(body.tool_use_id ?? "");
    if (toolUseId) {
      const set = this.gateIds.get(attemptId) ?? new Set<string>();
      set.add(toolUseId);
      this.gateIds.set(attemptId, set);
      this.bypassAt.delete(`${attemptId}:${toolUseId}`);
    }
    const decision = await this.gateCall({ attempt, tool, arg, input, toolUseId, started });
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision.effect === "allow" ? "allow" : "deny",
        permissionDecisionReason: decision.reason || (decision.effect === "allow" ? "Allowed by AgentOS policy" : `Blocked by AgentOS policy rule ${decision.matchedRuleIds[0] ?? "default"}`),
      },
    };
  }

  private async gateCall(input: { attempt: SqlRow; tool: string; arg: string; input: unknown; toolUseId?: string; paths?: string[]; started?: number }): Promise<Decision & { effect: Decision["effect"] | "cancel" }> {
    const attempt = input.attempt;
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    const mission = this.mustMission(task.mission_id);
    const workspace = attempt.workspace_id ? this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id) : null;
    const profile = JSON.parse(attempt.profile_snapshot);
    const hash = inputHash(input.tool, input.input);
    const grant = this.one("SELECT attempt_id FROM attempt_grants WHERE attempt_id = ? AND input_hash = ?", attempt.id, hash);
    if (grant) {
      const decision: Decision = { effect: "allow", matchedRuleIds: [], policyHash: this.effectiveHash(), sourceLayers: ["profile"], reason: "attempt_grant" };
      this.storeDecision(attempt, input, decision, Date.now() - (input.started ?? Date.now()));
      return decision;
    }
    const pending = this.one("SELECT * FROM approvals WHERE attempt_id = ? AND input_hash = ? AND state = 'pending'", attempt.id, hash);
    const policy = this.policyFor(profile, mission.repo_id);
    const arg = input.paths?.length
      ? input.paths.map((p) => resolveDecision(policy, { tool: input.tool, arg: p }, this.policyCtx({ cwd: workspace?.path, worktree: workspace?.path, tools: JSON.parse(profile.tools) }))).sort((a, b) => rank(b.effect) - rank(a.effect))[0]
      : null;
    const decision = arg
      ? arg
      : resolveDecision(policy, { tool: input.tool, arg: input.arg }, this.policyCtx({ cwd: workspace?.path, worktree: workspace?.path, tools: JSON.parse(profile.tools) }));
    const latency = Math.max(0, Date.now() - (input.started ?? Date.now()));
    if (decision.effect === "allow" || decision.effect === "deny") {
      this.storeDecision(attempt, input, decision, latency);
      this.emit("tool.decided", { missionId: mission.id, taskId: task.id, attemptId: attempt.id, actor: "daemon" }, {
        effect: decision.effect,
        rule: decision.matchedRuleIds,
        reason: decision.reason,
        tool: input.tool,
      });
      return decision;
    }
    let approval = pending;
    if (!approval) {
      const preview = input.tool === "Bash" ? input.arg : `${input.arg}`;
      const id = ulid(this.clock.now());
      this.tx(() => {
        this.run(
          `INSERT INTO approvals (id, attempt_id, tool, input_json, input_hash, preview, matched_rule_ids, policy_hash, state, scope, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'once', ?, ?)`,
          id,
          attempt.id,
          input.tool,
          JSON.stringify(input.input),
          hash,
          preview,
          JSON.stringify(decision.matchedRuleIds),
          decision.policyHash,
          iso(this.clock.now() + this.config.approvals.timeout_s * 1000),
          this.nowIso(),
        );
        this.setAttempt(attempt.id, "waiting_approval");
        this.emit("approval.created", { missionId: mission.id, taskId: task.id, attemptId: attempt.id, actor: "daemon" }, { id, tool: input.tool, preview: maskSecrets(preview) });
      });
      approval = this.one("SELECT * FROM approvals WHERE id = ?", id);
      this.notifyDesktop(approval!);
    }
    const result = await new Promise<{ effect: "allow" | "deny"; reason: string }>((resolveWait) => {
      this.approvalWaiters.set(approval!.id, resolveWait);
    });
    const finalDecision: Decision = {
      effect: result.effect,
      matchedRuleIds: decision.matchedRuleIds,
      policyHash: decision.policyHash,
      sourceLayers: decision.sourceLayers,
      reason: result.reason,
    };
    this.storeDecision(attempt, input, finalDecision, latency, approval!.id);
    return finalDecision;
  }

  private storeDecision(attempt: SqlRow, input: { tool: string; arg: string; input: unknown; toolUseId?: string }, decision: Decision, latency: number, approvalId?: string): void {
    this.tx(() => {
      this.run(
        `INSERT INTO gate_decisions (id, attempt_id, tool_use_ref, tool, arg, input_hash, effect, matched_rule_ids, policy_hash, source_layers, approval_id, latency_ms, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ulid(this.clock.now()),
        attempt.id,
        input.toolUseId ?? null,
        input.tool,
        input.arg,
        inputHash(input.tool, input.input),
        decision.effect,
        JSON.stringify(decision.matchedRuleIds),
        decision.policyHash,
        JSON.stringify(decision.sourceLayers),
        approvalId ?? null,
        latency,
        decision.reason ?? null,
        this.nowIso(),
      );
    });
  }

  private policyFor(profile: SqlRow, repoId: string | null): LayeredPolicy {
    const layers = [{ source: "global" as const, rules: this.policyDocs.global?.rules ?? [], default: this.policyDocs.global?.default }];
    if (repoId) {
      const file = join(this.home, "policy", "repos", `${repoId}.yaml`);
      if (existsSync(file)) {
        const doc = parsePolicy(readFileSync(file, "utf8"), file);
        layers.push({ source: "repo" as const, rules: doc.rules.map((rule) => ({ ...rule, source: "repo" as const })), default: doc.default });
      }
    }
    if (profile.policy_overlay) {
      const doc = parsePolicy(profile.policy_overlay, `profile:${profile.name}`);
      layers.push({ source: "profile" as const, rules: doc.rules.map((rule) => ({ ...rule, source: "profile" as const })), default: doc.default });
    }
    return layerPolicies(layers);
  }

  decideApproval(id: string, effect: "allow" | "deny", opts: { reason?: string; actor?: string; forAttempt?: boolean } = {}): SqlRow {
    const approval = this.one("SELECT * FROM approvals WHERE id = ?", id);
    if (!approval) throw new AgentError("not_found", "Approval not found", 404);
    if (approval.state === "cancelled") throw new AgentError("invalid_transition", "Approval was cancelled", 409, { from: approval.state });
    const attempt = this.attempt(approval.attempt_id)!;
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    const changed = this.tx(() => {
      const result = this.run(
        "UPDATE approvals SET state = ?, reason = ?, decided_by = ?, actor = ?, decided_at = ?, scope = ? WHERE id = ? AND state = 'pending'",
        effect === "allow" ? "allowed" : "denied",
        opts.reason ?? null,
        opts.actor ?? "user",
        opts.actor ?? "user",
        this.nowIso(),
        opts.forAttempt ? "attempt" : "once",
        id,
      );
      if (!result.changes) return false;
      if (opts.forAttempt && effect === "allow") {
        this.run("INSERT OR IGNORE INTO attempt_grants (attempt_id, input_hash, created_at) VALUES (?, ?, ?)", attempt.id, approval.input_hash, this.nowIso());
      }
      if (attempt.state === "waiting_approval") this.setAttempt(attempt.id, "running");
      this.emit("approval.resolved", { missionId: task.mission_id, taskId: task.id, attemptId: attempt.id, actor: "user" }, { id, state: effect === "allow" ? "allowed" : "denied" });
      this.emit("tool.decided", { missionId: task.mission_id, taskId: task.id, attemptId: attempt.id, actor: "user" }, { effect, reason: opts.reason, approval_id: id });
      return true;
    });
    if (!changed) {
      const current = this.one("SELECT * FROM approvals WHERE id = ?", id)!;
      throw new AgentError("already_decided", `Approval already ${current.state}`, 409, { state: current.state });
    }
    const reason = effect === "deny" ? opts.reason || "Denied by user" : "Allowed by user";
    this.approvalWaiters.get(id)?.({ effect: effect === "allow" ? "allow" : "deny", reason });
    this.approvalWaiters.delete(id);
    return this.one("SELECT * FROM approvals WHERE id = ?", id)!;
  }

  listApprovals(pendingOnly = false): SqlRow[] {
    const rows = this.all(`SELECT * FROM approvals ${pendingOnly ? "WHERE state = 'pending'" : ""} ORDER BY created_at DESC`);
    return rows.map((row) => this.approvalView(row, false));
  }

  approvalView(row: SqlRow, reveal: boolean): SqlRow {
    const attempt = this.attempt(row.attempt_id);
    const task = attempt ? this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id) : null;
    const mission = task ? this.missionView(task.mission_id) : null;
    const workspace = attempt?.workspace_id ? this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id) : null;
    const events = attempt
      ? this.all("SELECT * FROM events WHERE attempt_id = ? ORDER BY id DESC LIMIT 5", attempt.id).reverse().map((event) => publicEvent(event, false))
      : [];
    return {
      ...row,
      preview: reveal ? row.preview : maskSecrets(row.preview),
      preview_masked: maskSecrets(row.preview) !== row.preview,
      mission: mission ? { id: mission.id, title: mission.title } : null,
      task: task ? { id: task.id, title: task.title } : null,
      runtime: attempt?.runtime,
      worktree: workspace?.path,
      branch: workspace?.branch,
      time_left_s: Math.max(0, Math.floor((Date.parse(row.expires_at) - this.clock.now()) / 1000)),
      recent_events: events,
    };
  }

  async cancelAttempt(id: string, reason = "cancelled", terminal: "cancelled" | "budget_stopped" | "failed" = "cancelled"): Promise<SqlRow> {
    const attempt = this.attempt(id);
    if (!attempt) throw new AgentError("not_found", "Attempt not found", 404);
    if (["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(attempt.state)) {
      return this.attemptView(id);
    }
    const child = this.children.get(id);
    if (terminal === "cancelled" && child?.kind === "codex") {
      try {
        child.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 99, method: "turn/interrupt", params: {} })}\n`);
      } catch {
        // process may already be gone
      }
    }
    if (attempt.pid) await cancelProcess(Number(attempt.pid), this.config.attempts.cancel_grace_s * 1000);
    this.finishAttempt(id, terminal, reason, null, null);
    return this.attemptView(id);
  }

  private async onRuntimeExit(attemptId: string, code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    if (this.closed || this.exiting.has(attemptId)) return;
    this.exiting.add(attemptId);
    try {
      await this.settleExit(attemptId, code, signal);
    } finally {
      this.exiting.delete(attemptId);
    }
  }

  private async settleExit(attemptId: string, code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    if (this.closed) return;
    this.ingest(attemptId);
    if (!this.lastResult.has(attemptId)) {
      await delay(80);
      if (this.closed) return;
      this.ingest(attemptId);
    }
    if (this.closed) return;
    const attempt = this.attempt(attemptId);
    if (!attempt || ["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(attempt.state)) return;
    if (attempt.end_reason === "gate_bypass") {
      this.finishAttempt(attemptId, "failed", "gate_bypass", code, signal);
      return;
    }
    if (attempt.end_reason === "budget" || this.missionOverBudget(attempt.task_id)) {
      this.finishAttempt(attemptId, "budget_stopped", "budget", code, signal);
      return;
    }
    const result = this.lastResult.get(attemptId);
    const subtype = result?.subtype ?? null;
    if (!result && code == null && signal == null) {
      this.finishAttempt(attemptId, "lost", "process gone", code, signal);
      this.emit("attempt.lost", { attemptId, taskId: attempt.task_id, actor: "daemon" }, { reason: "process gone" });
      return;
    }
    let terminal: "succeeded" | "failed" | "budget_stopped" = "failed";
    if (isBudgetStop(subtype)) terminal = "budget_stopped";
    else if (subtype === "success" && (code === 0 || code == null)) terminal = "succeeded";
    this.finishAttempt(attemptId, terminal, subtype, code, signal);
  }

  private finishAttempt(id: string, terminal: string, reason: string | null, code: number | null, signal: NodeJS.Signals | null): void {
    if (this.finishing.has(id)) return;
    const attempt = this.attempt(id);
    if (!attempt || ["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(attempt.state)) return;
    this.finishing.add(id);
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    this.tx(() => {
      const target = terminal;
      if (attempt.state === "waiting_approval" || attempt.state === "running" || attempt.state === "starting" || attempt.state === "queued") {
        this.run(
          "UPDATE attempts SET state = ?, end_reason = ?, exit_code = ?, exit_signal = ?, ended_at = ? WHERE id = ?",
          target,
          reason,
          code,
          signal,
          this.nowIso(),
          id,
        );
        this.emit(target === "budget_stopped" ? "attempt.budget_stopped" : target === "cancelled" ? "attempt.cancelled" : "attempt.exited", {
          missionId: task.mission_id,
          taskId: task.id,
          attemptId: id,
          actor: "daemon",
        }, { exit_code: code, signal, reason, subtype: reason });
      }
      this.run("UPDATE approvals SET state = 'cancelled' WHERE attempt_id = ? AND state = 'pending'", id);
      for (const approval of this.all("SELECT id FROM approvals WHERE attempt_id = ? AND state = 'cancelled'", id)) {
        this.approvalWaiters.get(approval.id)?.({ effect: "deny", reason: "attempt cancelled" });
        this.approvalWaiters.delete(approval.id);
        this.emit("approval.cancelled", { attemptId: id, taskId: task.id, missionId: task.mission_id, actor: "daemon" }, { id: approval.id });
      }
      if (attempt.workspace_id) this.releaseWorkspaceRow(attempt.workspace_id);
    });
    try {
      this.captureEvidence(id);
    } catch (error) {
      this.log(`evidence failed ${id}: ${error instanceof Error ? error.message : error}`);
    }
    if (terminal === "succeeded") void this.afterSuccess(id);
    else if (terminal === "failed" || terminal === "cancelled" || terminal === "budget_stopped") {
      const current = this.one("SELECT state FROM tasks WHERE id = ?", task.id);
      if (current && !["passed", "cancelled", "failed"].includes(current.state)) this.setTask(task.id, "failed");
    }
    this.finishing.delete(id);
  }

  private finishLost(id: string): void {
    if (this.exiting.has(id) || this.finishing.has(id)) return;
    const attempt = this.attempt(id);
    if (!attempt || ["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(attempt.state)) return;
    void this.onRuntimeExit(id, null, null);
  }

  private afterSuccess(attemptId: string): void {
    const attempt = this.attempt(attemptId)!;
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    if (task.unverified) return;
    const verify = this.one("SELECT * FROM tasks WHERE verifies_task_id = ? AND kind = 'verify'", task.id);
    if (!verify) return;
    this.setTask(task.id, "verifying");
    this.setTask(verify.id, "ready");
    this.setTask(verify.id, "running");
    void this.runVerify(verify.id, attemptId);
  }

  private async runVerify(verifyTaskId: string, attemptId: string): Promise<void> {
    const verify = this.one("SELECT * FROM tasks WHERE id = ?", verifyTaskId)!;
    const work = this.one("SELECT * FROM tasks WHERE id = ?", verify.verifies_task_id)!;
    const mission = this.mustMission(work.mission_id);
    const repo = this.one("SELECT * FROM repos WHERE id = ?", mission.repo_id)!;
    const attempt = this.attempt(attemptId)!;
    const workspace = this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id)!;
    this.emit("verify.started", { missionId: mission.id, taskId: verify.id, attemptId, actor: "daemon" }, { command: repo.test_command });
    const checks: { name: string; passed: boolean; detail?: string }[] = [];
    const result = await runShell(repo.test_command, workspace.path, Number(repo.test_timeout_s) * 1000, JSON.parse(repo.test_env_allowlist || "[]"));
    this.emit("verify.command", { missionId: mission.id, taskId: verify.id, attemptId, actor: "daemon" }, { command: repo.test_command, exit_code: result.code });
    const log = writeBlob(this.home, result.output);
    this.addEvidence(attempt, verify.id, "test_log", "text/plain", log.sha256, log.size, "test log", { exit_code: result.code });
    checks.push({ name: repo.test_command, passed: result.code === 0, detail: `exit ${result.code}` });
    for (const criterion of this.all("SELECT * FROM mission_criteria WHERE mission_id = ? ORDER BY seq", mission.id)) {
      if (criterion.kind === "file_exists") {
        const target = resolve(workspace.path, criterion.value);
        const ok = target.startsWith(workspace.path + sep) && existsSync(target);
        checks.push({ name: `file ${criterion.value} exists`, passed: ok });
        const blob = writeBlob(this.home, ok ? "exists" : "missing");
        this.addEvidence(attempt, verify.id, "check_result", "text/plain", blob.sha256, blob.size, criterion.value, { passed: ok });
      } else if (criterion.kind === "command") {
        const extra = await runShell(criterion.value, workspace.path, Number(repo.test_timeout_s) * 1000, []);
        checks.push({ name: criterion.value, passed: extra.code === 0 });
        const blob = writeBlob(this.home, extra.output);
        this.addEvidence(attempt, verify.id, "check_result", "text/plain", blob.sha256, blob.size, criterion.value, { exit_code: extra.code });
      }
    }
    if (repo.junit_path) {
      const junitFile = resolve(workspace.path, repo.junit_path);
      if (existsSync(junitFile)) {
        const xml = readFileSync(junitFile);
        const blob = writeBlob(this.home, xml);
        const counts = countJunit(xml.toString("utf8"));
        this.addEvidence(attempt, verify.id, "junit", "application/xml", blob.sha256, blob.size, "junit", counts);
      }
    }
    const passed = checks.every((check) => check.passed);
    this.tx(() => {
      this.setTask(verify.id, passed ? "passed" : "failed");
      this.setTask(work.id, passed ? "passed" : "failed");
      this.run("UPDATE attempts SET verification_label = ? WHERE id = ?", passed ? "passed" : "verification_failed", attempt.id);
      this.emit("verify.finished", { missionId: mission.id, taskId: verify.id, attemptId, actor: "daemon" }, { passed, checks });
      this.maybeReviewDone(mission.id);
    });
    this.writeEvidenceMd(attemptId);
  }

  private captureEvidence(attemptId: string): void {
    const attempt = this.attempt(attemptId);
    if (!attempt?.workspace_id) return;
    const workspace = this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id);
    if (!workspace || !existsSync(workspace.path)) return;
    const diff = diffs(workspace.path, workspace.base_commit);
    const committed = writeBlob(this.home, diff.committed);
    this.addEvidence(attempt, attempt.task_id, "diff", "text/x-diff", committed.sha256, committed.size, "diff.patch", {});
    const extra = writeBlob(this.home, diff.uncommitted);
    this.addEvidence(attempt, attempt.task_id, "uncommitted_diff", "text/x-diff", extra.sha256, extra.size, "uncommitted.patch", {});
    const stat = writeBlob(this.home, diff.stat);
    this.addEvidence(attempt, attempt.task_id, "diffstat", "text/plain", stat.sha256, stat.size, "diffstat", {});
    if (diff.dirty) {
      try {
        commitAll(workspace.path, `agentos: snapshot of uncommitted changes (attempt ${attempt.id})`);
      } catch (error) {
        this.log(`snapshot commit failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (attempt.log_path && existsSync(attempt.log_path)) {
      const transcript = writeBlob(this.home, readFileSync(attempt.log_path));
      this.addEvidence(attempt, attempt.task_id, "transcript_ref", "application/jsonl", transcript.sha256, transcript.size, "transcript.jsonl", { path: attempt.log_path });
    }
    this.writeEvidenceMd(attemptId);
  }

  private addEvidence(attempt: SqlRow, taskId: string, kind: string, media: string, sha: string, size: number, label: string, meta: unknown): void {
    this.tx(() => {
      this.run(
        "INSERT INTO evidence (id, attempt_id, task_id, kind, media_type, sha256, size_bytes, label, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ulid(this.clock.now()),
        attempt.id,
        taskId,
        kind,
        media,
        sha,
        size,
        label,
        JSON.stringify(meta ?? {}),
        this.nowIso(),
      );
      this.emit("evidence.added", { attemptId: attempt.id, taskId, actor: "daemon" }, { kind, sha256: sha, label });
    });
  }

  private writeEvidenceMd(attemptId: string): void {
    const attempt = this.attempt(attemptId);
    if (!attempt) return;
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    const mission = this.mustMission(task.mission_id);
    const workspace = attempt.workspace_id ? this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id) : null;
    const items = this.all("SELECT * FROM evidence WHERE attempt_id = ?", attemptId);
    const diffstat = items.find((item) => item.kind === "diffstat");
    const text = renderEvidenceMd({
      missionTitle: mission.title,
      taskTitle: task.title,
      runtime: attempt.runtime,
      model: JSON.parse(attempt.profile_snapshot).model ?? null,
      branch: workspace?.branch ?? "",
      baseCommit: workspace?.base_commit ?? "",
      diffStat: diffstat ? readBlobText(this.home, diffstat.sha256) : "",
      checks: items.filter((item) => item.kind === "check_result" || item.kind === "test_log").map((item) => ({
        name: item.label,
        passed: item.kind === "test_log" ? JSON.parse(item.meta).exit_code === 0 : JSON.parse(item.meta).passed !== false,
      })),
      approvals: this.all("SELECT * FROM approvals WHERE attempt_id = ?", attemptId).map((row) => ({ state: row.state, tool: row.tool, preview: row.preview })),
      tokens: this.tokenTotals(attemptId),
      costLabel: this.costLabel(attemptId),
      duration: attempt.started_at && attempt.ended_at ? `${Date.parse(attempt.ended_at) - Date.parse(attempt.started_at)} ms` : "n/a",
      gating: attempt.gated === "all" ? "fully gated" : attempt.gated === "none" ? "ungated" : "partially gated",
      worktree: workspace?.path ?? "",
      transcript: attempt.log_path ?? "",
    });
    const blob = writeBlob(this.home, text);
    const existing = this.one("SELECT id FROM evidence WHERE attempt_id = ? AND kind = 'evidence_md'", attemptId);
    if (!existing) this.addEvidence(attempt, task.id, "evidence_md", "text/markdown", blob.sha256, blob.size, "evidence.md", {});
  }

  private tokenTotals(attemptId: string) {
    const row = this.one(
      "SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o, COALESCE(SUM(cache_read_tokens),0) AS r, COALESCE(SUM(cache_write_tokens),0) AS w FROM usage WHERE attempt_id = ?",
      attemptId,
    );
    return { input: Number(row?.i ?? 0), output: Number(row?.o ?? 0), cacheRead: Number(row?.r ?? 0), cacheWrite: Number(row?.w ?? 0) };
  }

  private costLabel(attemptId: string): string {
    const rows = this.all("SELECT cost_nusd, cost_source FROM usage WHERE attempt_id = ?", attemptId);
    if (!rows.length) return "cost so far: not reported yet";
    if (rows.some((row) => row.cost_source === "unknown" || row.cost_nusd == null)) return "unknown";
    const total = rows.reduce((sum, row) => sum + Number(row.cost_nusd), 0);
    const source = rows.some((row) => row.cost_source === "estimated") ? "estimated" : "reported by runtime (its own estimate)";
    return `${(total / NANO_PER_USD).toFixed(6)} USD (${source})`;
  }

  acceptAttempt(id: string, override?: string): SqlRow {
    const attempt = this.mustAttempt(id);
    if (attempt.review_state === "accepted") return this.attemptView(id);
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    const verified = task.state === "passed" || task.unverified === 1;
    if (!verified && !override) throw new AgentError("not_verified", "Verification has not passed", 409);
    const other = this.one("SELECT id FROM attempts WHERE task_id = ? AND review_state = 'accepted' AND id != ?", task.id, id);
    if (other) throw new AgentError("already_decided", "Another attempt is already accepted", 409, { other_attempt_id: other.id });
    this.tx(() => {
      this.run("UPDATE attempts SET review_state = 'accepted', override_reason = ?, review_note = ? WHERE id = ?", override ?? null, override ?? null, id);
      this.emit("review.accepted", { missionId: task.mission_id, taskId: task.id, attemptId: id, actor: "user" }, { override: override ?? null });
      if (task.unverified && task.state === "running") this.setTask(task.id, "passed");
      this.maybeReviewDone(task.mission_id);
    });
    return this.attemptView(id);
  }

  rejectAttempt(id: string, reason: string): SqlRow {
    const attempt = this.mustAttempt(id);
    if (attempt.review_state === "rejected") return this.attemptView(id);
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    this.tx(() => {
      this.run("UPDATE attempts SET review_state = 'rejected', review_note = ? WHERE id = ?", reason, id);
      this.emit("review.rejected", { missionId: task.mission_id, taskId: task.id, attemptId: id, actor: "user" }, { reason });
      const sibling = this.one("SELECT id FROM attempts WHERE task_id = ? AND review_state = 'accepted'", task.id);
      if (!sibling && task.state === "passed") {
        this.run("UPDATE tasks SET state = 'ready', updated_at = ? WHERE id = ?", this.nowIso(), task.id);
        this.emit("task.state_changed", { missionId: task.mission_id, taskId: task.id, actor: "daemon" }, { from: "passed", to: "ready", reason: "reject" });
      } else if (!sibling && task.state === "failed") this.setTask(task.id, "ready");
    });
    return this.attemptView(id);
  }

  mergeAttempt(id: string): SqlRow {
    const attempt = this.mustAttempt(id);
    if (attempt.review_state !== "accepted") throw new AgentError("invalid_transition", "Only an accepted attempt can be merged", 409);
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id)!;
    const mission = this.mustMission(task.mission_id);
    const repo = this.one("SELECT * FROM repos WHERE id = ?", mission.repo_id)!;
    const workspace = this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id)!;
    const conflicts = mergeTreeConflicts(repo.root_path, repo.base_branch, workspace.branch);
    if (conflicts.length) throw new AgentError("merge_conflict", "Merge would conflict", 409, { files: conflicts });
    const branch = git(repo.root_path, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    const dirty = git(repo.root_path, ["status", "--porcelain"]).trim();
    if (branch !== repo.base_branch || dirty) {
      throw new AgentError("main_checkout_not_ready", dirty ? "Main checkout has uncommitted changes" : `Main checkout is on ${branch}, expected ${repo.base_branch}`, 409);
    }
    git(repo.root_path, ["merge", "--no-ff", "--no-edit", "-m", `Merge AgentOS attempt ${id}: ${task.title}`, workspace.branch]);
    this.tx(() => {
      this.emit("review.merged", { missionId: mission.id, taskId: task.id, attemptId: id, actor: "user" }, { branch: workspace.branch });
      if (mission.state === "review_done") {
        this.run("UPDATE missions SET state = 'done', ended_at = ?, updated_at = ? WHERE id = ?", this.nowIso(), this.nowIso(), mission.id);
        this.emit("mission.done", { missionId: mission.id, actor: "user" }, {});
      }
    });
    return this.attemptView(id);
  }

  private maybeReviewDone(missionId: string): void {
    const mission = this.mustMission(missionId);
    if (mission.state !== "active") return;
    const tasks = this.all("SELECT * FROM tasks WHERE mission_id = ?", missionId);
    if (!tasks.length || tasks.some((task) => task.state !== "passed")) return;
    for (const task of tasks.filter((item) => item.kind === "work")) {
      const accepted = this.one("SELECT id FROM attempts WHERE task_id = ? AND review_state = 'accepted'", task.id);
      if (!accepted) return;
    }
    this.run("UPDATE missions SET state = 'review_done', updated_at = ? WHERE id = ?", this.nowIso(), missionId);
    this.emit("mission.updated", { missionId, actor: "daemon" }, { state: "review_done" });
  }

  attemptView(id: string): SqlRow {
    const attempt = this.mustAttempt(id);
    const task = this.one("SELECT * FROM tasks WHERE id = ?", attempt.task_id);
    const workspace = attempt.workspace_id ? this.one("SELECT * FROM workspaces WHERE id = ?", attempt.workspace_id) : null;
    const warnings: { code: string; files?: string[] }[] = [];
    if (attempt.base_dirty) warnings.push({ code: "base_dirty" });
    if (attempt.gated === "escalated") warnings.push({ code: "partially_gated" });
    if (attempt.gated === "none") warnings.push({ code: "ungated" });
    if (workspace && task) warnings.push(...this.fileOverlaps(attempt, workspace));
    const idle = this.idleFlag(attempt);
    if (idle) warnings.push({ code: "idle" });
    return {
      ...attempt,
      profile_snapshot: JSON.parse(attempt.profile_snapshot),
      workspace,
      warnings,
      cost: this.costLabel(id),
      tokens: this.tokenTotals(id),
      evidence: this.all("SELECT id, kind, label, size_bytes, sha256, created_at, meta FROM evidence WHERE attempt_id = ?", id),
    };
  }

  private idleFlag(attempt: SqlRow): boolean {
    if (["waiting_approval", "succeeded", "failed", "cancelled", "lost", "budget_stopped", "queued"].includes(attempt.state)) return false;
    const last = this.lastBeatEvent.get(attempt.id) ?? Date.parse(attempt.started_at ?? attempt.created_at);
    return this.clock.now() - last > this.config.attempts.idle_warning_s * 1000;
  }

  private fileOverlaps(attempt: SqlRow, workspace: SqlRow): { code: string; files: string[] }[] {
    if (!existsSync(workspace.path)) return [];
    const mine = new Set(changedFiles(workspace.path, workspace.base_commit));
    const hits = new Set<string>();
    const others = this.all(
      `SELECT a.id, w.path, w.base_commit FROM attempts a JOIN workspaces w ON w.id = a.workspace_id JOIN tasks t ON t.id = a.task_id
       WHERE a.state IN ('running','waiting_approval','starting') AND w.repo_id = ? AND a.id != ?`,
      workspace.repo_id,
      attempt.id,
    );
    for (const other of others) {
      if (!existsSync(other.path)) continue;
      for (const file of changedFiles(other.path, other.base_commit)) if (mine.has(file)) hits.add(file);
    }
    return hits.size ? [{ code: "file_overlap", files: [...hits] }] : [];
  }

  listWorkspaces(): SqlRow[] {
    return this.all("SELECT * FROM workspaces ORDER BY created_at DESC");
  }

  releaseWorkspace(id: string): SqlRow {
    const workspace = this.one("SELECT * FROM workspaces WHERE id = ?", id);
    if (!workspace) throw new AgentError("not_found", "Workspace not found", 404);
    this.releaseWorkspaceRow(id);
    return this.one("SELECT * FROM workspaces WHERE id = ?", id)!;
  }

  private releaseWorkspaceRow(id: string): void {
    const workspace = this.one("SELECT * FROM workspaces WHERE id = ?", id);
    if (!workspace || workspace.state === "released" || workspace.state === "removed") return;
    this.run("UPDATE workspaces SET state = 'released', released_at = ? WHERE id = ?", this.nowIso(), id);
    this.emit("workspace.released", { attemptId: workspace.lease_attempt_id, actor: "daemon" }, { workspace_id: id });
  }

  removeWorkspace(id: string, opts: { force?: boolean; deleteBranch?: boolean } = {}): SqlRow {
    const workspace = this.one("SELECT * FROM workspaces WHERE id = ?", id);
    if (!workspace) throw new AgentError("not_found", "Workspace not found", 404);
    if (["leased", "creating", "stale"].includes(workspace.state)) throw new AgentError("workspace_leased", "Workspace is still leased", 409);
    const repo = this.one("SELECT * FROM repos WHERE id = ?", workspace.repo_id)!;
    if (existsSync(workspace.path) && worktreeDirty(workspace.path) && !opts.force) {
      throw new AgentError("workspace_dirty", "Workspace has uncommitted changes", 409);
    }
    if (opts.force && existsSync(workspace.path)) {
      const attempt = workspace.lease_attempt_id ? this.attempt(workspace.lease_attempt_id) : null;
      if (attempt) {
        const diff = diffs(workspace.path, workspace.base_commit);
        const blob = writeBlob(this.home, diff.uncommitted);
        this.addEvidence(attempt, attempt.task_id, "uncommitted_diff", "text/x-diff", blob.sha256, blob.size, "forced-remove.patch", { forced: true });
      }
    }
    if (existsSync(workspace.path)) removeWorktree(repo.root_path, workspace.path, Boolean(opts.force));
    if (opts.deleteBranch) {
      const attempt = workspace.lease_attempt_id ? this.attempt(workspace.lease_attempt_id) : null;
      const merged = git(repo.root_path, ["branch", "--merged", repo.base_branch]);
      if (attempt?.review_state === "accepted" && !merged.includes(workspace.branch)) {
        throw new AgentError("invalid_argument", "Refusing to delete an unmerged accepted branch", 400);
      }
      try {
        git(repo.root_path, ["branch", "-D", workspace.branch]);
      } catch {
        // branch may already be gone
      }
    }
    this.run("UPDATE workspaces SET state = 'removed', removed_at = ? WHERE id = ?", this.nowIso(), id);
    this.emit("workspace.removed", { attemptId: workspace.lease_attempt_id, actor: "user" }, { workspace_id: id });
    return this.one("SELECT * FROM workspaces WHERE id = ?", id)!;
  }

  gc(opts: { olderThanMs?: number; yes?: boolean; dryRun?: boolean }): SqlRow {
    const cutoff = this.clock.now() - (opts.olderThanMs ?? 14 * 24 * 60 * 60 * 1000);
    const candidates = this.all("SELECT * FROM workspaces WHERE state = 'released'").filter((row) => Date.parse(row.released_at ?? row.created_at) <= cutoff);
    const listed = candidates.map((row) => ({ id: row.id, path: row.path, bytes: existsSync(row.path) ? dirSize(row.path) : 0 }));
    if (opts.dryRun || !opts.yes) {
      return { removed: [], would_remove: listed, blobs_bytes: dirSize(join(this.home, "blobs")), logs_bytes: dirSize(join(this.home, "logs")), worktrees_bytes: dirSize(join(this.home, "worktrees")) };
    }
    for (const row of candidates) this.removeWorkspace(row.id, { force: true });
    return { removed: listed };
  }

  evidenceList(attemptId: string): SqlRow {
    this.mustAttempt(attemptId);
    const md = this.one("SELECT * FROM evidence WHERE attempt_id = ? AND kind = 'evidence_md'", attemptId);
    return {
      items: this.all("SELECT id, kind, label, size_bytes, sha256, media_type, created_at FROM evidence WHERE attempt_id = ? ORDER BY created_at", attemptId),
      markdown: md ? readBlobText(this.home, md.sha256) : "",
    };
  }

  exportEvidence(attemptId: string, outPath: string, redact: boolean): string {
    const list = this.evidenceList(attemptId);
    const dir = join(this.home, "tmp-export", attemptId);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const names: Record<string, string> = {
      diff: "diff.patch",
      uncommitted_diff: "uncommitted.patch",
      test_log: "test.log",
      junit: "junit.xml",
      transcript_ref: "transcript.jsonl",
      evidence_md: "evidence.md",
      diffstat: "diffstat.txt",
    };
    const manifest: { name: string; sha256: string }[] = [];
    const items = this.all("SELECT * FROM evidence WHERE attempt_id = ?", attemptId);
    for (const item of items) {
      const name = names[item.kind] ?? item.label;
      let body = readFileSync(join(this.home, "blobs", item.sha256.slice(0, 2), item.sha256));
      if (redact && (item.media_type.startsWith("text") || name.endsWith(".md") || name.endsWith(".log") || name.endsWith(".jsonl"))) {
        body = Buffer.from(maskSecrets(body.toString("utf8")));
      }
      writeFileSync(join(dir, name), body);
      manifest.push({ name, sha256: sha256Hex(body) });
    }
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ attempt_id: attemptId, files: manifest }, null, 2));
    spawnSync("tar", ["-czf", outPath, "-C", dir, "."], { stdio: "ignore" });
    return outPath;
  }

  policyCheck(tool: string, arg: string, opts: { profile?: string; repo?: string } = {}): Decision {
    const profile = opts.profile ? this.one("SELECT * FROM profiles WHERE name = ?", opts.profile) : null;
    const repo = opts.repo ? this.addRepo(opts.repo) : null;
    const policy = this.policyFor(profile ?? { policy_overlay: null, name: "ad-hoc", tools: null }, repo?.id ?? null);
    const tools = profile ? JSON.parse(profile.tools) : undefined;
    return resolveDecision(policy, { tool, arg }, this.policyCtx({ tools, worktree: undefined }));
  }

  policyLint(): ReturnType<typeof lintRules> {
    return lintRules(this.policy.rules);
  }

  adapters(): SqlRow[] {
    const claudeBin = claudeCommand(this.config.runtimes["claude-code"].command);
    const codexBin = codexCommand(this.config.runtimes.codex.command);
    const claude = checkClaude(claudeBin);
    const codex = checkCodex(codexBin);
    return [
      { runtime: "claude-code", ...claudeCapabilities(), installed: claude.installed, version: claude.version, meets_min: claude.meetsMin },
      { runtime: "codex", ...codexCapabilities(), installed: codex.installed, version: codex.version, meets_min: codex.meetsMin },
    ];
  }

  doctor(): { lines: { name: string; status: "OK" | "WARN" | "FAIL"; detail: string }[] } {
    const lines: { name: string; status: "OK" | "WARN" | "FAIL"; detail: string }[] = [];
    const nodeMajor = Number(process.versions.node.split(".")[0]);
    lines.push({ name: "node", status: nodeMajor >= 22 ? "OK" : "FAIL", detail: process.versions.node });
    let gitVersion = "";
    try {
      gitVersion = git(this.home, ["--version"]);
    } catch {
      gitVersion = "";
    }
    const gitOk = /(\d+)\.(\d+)/.exec(gitVersion);
    const gitFine = gitOk ? Number(gitOk[1]) > 2 || Number(gitOk[2]) >= 40 : false;
    lines.push({ name: "git", status: gitFine ? "OK" : "FAIL", detail: gitVersion.trim() || "not found" });
    lines.push({ name: "daemon", status: "OK", detail: `pid ${process.pid}` });
    const schema = this.one("SELECT MAX(version) AS v FROM schema_migrations");
    lines.push({ name: "schema", status: "OK", detail: `version ${schema?.v}` });
    const dirMode = statSync(this.home).mode & 0o777;
    lines.push({ name: "data-dir", status: dirMode === 0o700 ? "OK" : "FAIL", detail: `mode ${dirMode.toString(8)}` });
    const tokenPath = join(this.home, "daemon.token");
    const tokenMode = existsSync(tokenPath) ? statSync(tokenPath).mode & 0o777 : 0;
    lines.push({
      name: "token",
      status: tokenMode === 0o600 ? "OK" : "FAIL",
      detail: tokenMode === 0o600 ? "mode 600" : `mode ${tokenMode.toString(8)}; fix: chmod 600 ${tokenPath}`,
    });
    for (const repo of this.listRepos()) {
      const ok = existsSync(repo.root_path);
      lines.push({ name: `repo ${repo.name}`, status: ok ? "OK" : "FAIL", detail: repo.root_path });
    }
    for (const adapter of this.adapters()) {
      const min = adapter.runtime === "claude-code" ? CLAUDE_MIN_VERSION : "unpinned";
      lines.push({
        name: adapter.runtime,
        status: !adapter.installed ? "FAIL" : adapter.meets_min ? "OK" : "FAIL",
        detail: adapter.installed ? `${adapter.version} (minimum ${min})` : "not found",
      });
    }
    const free = Number(spawnSync("df", ["-Pk", this.home], { encoding: "utf8" }).stdout.split("\n")[1]?.split(/\s+/)[3] ?? 0);
    lines.push({ name: "disk", status: free > 50_000 ? "OK" : "WARN", detail: `${free} KB free` });
    const orphans = this.orphanWorktrees();
    lines.push({ name: "worktrees", status: orphans.length ? "WARN" : "OK", detail: orphans.length ? orphans.join(", ") : "none" });
    for (const item of this.all("SELECT sha256 FROM evidence")) {
      if (!blobMatches(this.home, item.sha256)) lines.push({ name: "evidence", status: "FAIL", detail: `evidence_corrupt ${item.sha256}` });
    }
    const unknownModels = this.all("SELECT DISTINCT model FROM usage WHERE cost_source = 'unknown' AND model IS NOT NULL");
    for (const row of unknownModels) lines.push({ name: "price", status: "WARN", detail: `unknown model ${row.model}` });
    return { lines };
  }

  private orphanWorktrees(): string[] {
    const root = join(this.home, "worktrees");
    const known = new Set(this.all("SELECT path FROM workspaces").map((row) => row.path));
    const found: string[] = [];
    if (!existsSync(root)) return found;
    const walk = (dir: string) => {
      for (const entry of readdirSafe(dir)) {
        const path = join(dir, entry);
        if (existsSync(join(path, ".git")) || existsSync(join(path, "package.json"))) {
          if (!known.has(path)) found.push(path);
        } else {
          try {
            if (statSync(path).isDirectory()) walk(path);
          } catch {
            // ignore
          }
        }
      }
    };
    walk(root);
    for (const row of this.all("SELECT path FROM workspaces WHERE state != 'removed'")) if (!existsSync(row.path)) found.push(`missing ${row.path}`);
    return found;
  }

  issueLaunchCode(): { url: string; code: string } {
    const code = randomBytes(24).toString("hex");
    this.launchCodes.set(code, this.clock.now() + 60_000);
    const port = this.port || this.config.daemon.port;
    return { code, url: `http://127.0.0.1:${port}/auth?code=${code}` };
  }

  consumeLaunchCode(code: string): boolean {
    const exp = this.launchCodes.get(code);
    this.launchCodes.delete(code);
    return Boolean(exp && exp >= this.clock.now());
  }

  idempotency(key: string | undefined, requestHash: string, status: number, body: string, replay: boolean): { hit: boolean; status?: number; body?: string } {
    if (!key) return { hit: false };
    const existing = this.one("SELECT * FROM idempotency_keys WHERE key = ?", key);
    if (existing) {
      if (existing.request_hash !== requestHash) throw new AgentError("idempotency_key_reused", "Idempotency key was reused with a different body", 422);
      return { hit: true, status: existing.response_status, body: existing.response_body };
    }
    if (!replay) {
      this.run(
        "INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, created_at) VALUES (?, ?, ?, ?, ?)",
        key,
        requestHash,
        status,
        body,
        this.nowIso(),
      );
    }
    return { hit: false };
  }

  async runEval(runtime: string): Promise<SqlRow> {
    if (process.env.AGENTOS_ALLOW_LIVE_RUNTIMES !== "1") {
      const node = process.execPath;
      const root = repoRoot();
      this.config.runtimes["claude-code"].command = [node, join(root, "fixtures/fake-runtimes/fake-claude.mjs")];
      this.config.runtimes.codex.command = [node, join(root, "fixtures/fake-runtimes/fake-codex.mjs")];
    }
    const dir = join(repoRoot(), "evals", "missions");
    const files = readdirSafe(dir).filter((name) => name.endsWith(".json"));
    const results = [];
    for (const file of files) {
      const mission = JSON.parse(readFileSync(join(dir, file), "utf8"));
      results.push(await this.runOneEval(mission, runtime));
    }
    const passed = results.filter((result) => result.passed).length;
    return { passed, total: results.length, results };
  }

  private async runOneEval(mission: any, runtime: string): Promise<SqlRow> {
    const root = join(this.home, "evals", mission.id);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    for (const [name, content] of Object.entries(mission.files as Record<string, string>)) {
      mkdirSync(join(root, name, ".."), { recursive: true });
      writeFileSync(join(root, name), content);
    }
    spawnSync("git", ["init", "-b", "main"], { cwd: root });
    spawnSync("git", ["config", "user.email", "eval@localhost"], { cwd: root });
    spawnSync("git", ["config", "user.name", "Eval"], { cwd: root });
    spawnSync("git", ["add", "-A"], { cwd: root });
    spawnSync("git", ["commit", "-m", "init"], { cwd: root });
    const scenarioPath = join(this.home, "evals", `${mission.id}.scenario.json`);
    writeFileSync(scenarioPath, JSON.stringify(mission.scenario));
    const previous = this.config.runtimes["claude-code"].scenario;
    this.config.runtimes["claude-code"].scenario = scenarioPath;
    try {
      const created = this.createMission({ title: mission.title, repo: root, budget: mission.budget ?? "1.00", criteria: mission.criteria ?? [], objective: mission.objective });
      if (mission.test_command) this.run("UPDATE repos SET test_command = ? WHERE id = ?", mission.test_command, created.repo.id);
      this.addTask(created.id, mission.task ?? mission.title, { profile: runtime === "codex" ? "codex-default" : "claude-default" });
      this.startMission(created.id);
      const task = this.listTasks(created.id).find((item) => item.kind === "work")!;
      const attempt = await this.startAttempt(task.id);
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        this.tick();
        const pending = this.all("SELECT * FROM approvals WHERE attempt_id = ? AND state = 'pending'", attempt.id);
        for (const approval of pending) {
          const answer = mission.answers?.[approval.preview];
          if (answer === "allow") this.decideApproval(approval.id, "allow", { actor: "eval" });
          else this.decideApproval(approval.id, "deny", { actor: "eval", reason: answer ? "scripted deny" : "unexpected ask" });
        }
        const current = this.attempt(attempt.id)!;
        if (["succeeded", "failed", "cancelled", "lost", "budget_stopped"].includes(current.state)) {
          await delay(50);
          this.tick();
          const verify = this.one("SELECT state FROM tasks WHERE verifies_task_id = ?", task.id);
          if (!verify || ["passed", "failed"].includes(verify.state) || current.state !== "succeeded") break;
        }
        await delay(30);
      }
      const finalAttempt = this.attemptView(attempt.id);
      const verify = this.one("SELECT state FROM tasks WHERE verifies_task_id = ?", task.id);
      return {
        id: mission.id,
        passed: finalAttempt.state === "succeeded" && (!verify || verify.state === "passed"),
        state: finalAttempt.state,
        verification: verify?.state ?? (finalAttempt.profile_snapshot ? "n/a" : "n/a"),
        cost: finalAttempt.cost,
        approvals: this.all("SELECT state FROM approvals WHERE attempt_id = ?", attempt.id).length,
      };
    } finally {
      this.config.runtimes["claude-code"].scenario = previous;
    }
  }

  events(attemptId: string, after = 0, limit = 50, raw = false): SqlRow[] {
    return this.all("SELECT * FROM events WHERE attempt_id = ? AND id > ? ORDER BY id ASC LIMIT ?", attemptId, after, Math.min(limit, 500)).map((row) => publicEvent(row, raw));
  }

  private setAttempt(id: string, state: string): void {
    const attempt = this.attempt(id);
    if (!attempt || attempt.state === state) return;
    assertTransition("attempt", attempt.state, state);
    this.run("UPDATE attempts SET state = ? WHERE id = ?", state, id);
  }

  private setTask(id: string, state: string): void {
    const task = this.one("SELECT * FROM tasks WHERE id = ?", id);
    if (!task || task.state === state) return;
    assertTransition("task", task.state, state);
    this.run("UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?", state, this.nowIso(), id);
    this.emit("task.state_changed", { missionId: task.mission_id, taskId: id, actor: "daemon" }, { from: task.state, to: state });
  }

  private mustMission(id: string): SqlRow {
    const mission = this.one("SELECT * FROM missions WHERE id = ?", id);
    if (!mission) throw new AgentError("not_found", "Mission not found", 404);
    return mission;
  }
  private mustAttempt(id: string): SqlRow {
    const attempt = this.attempt(id);
    if (!attempt) throw new AgentError("not_found", "Attempt not found", 404);
    return attempt;
  }
  requestTaskState(id: string, state: string): SqlRow {
    const task = this.one("SELECT * FROM tasks WHERE id = ?", id);
    if (!task) throw new AgentError("not_found", "Task not found", 404);
    if (task.state === state) return task;
    this.tx(() => this.setTask(id, state));
    return this.one("SELECT * FROM tasks WHERE id = ?", id)!;
  }

  evidenceById(id: string): SqlRow {
    const row = this.one("SELECT * FROM evidence WHERE id = ?", id);
    if (!row) throw new AgentError("not_found", "Evidence not found", 404);
    return row;
  }

  attempt(id: string): SqlRow | undefined {
    return this.one("SELECT * FROM attempts WHERE id = ?", id);
  }
  private missionByRef(ref: string): SqlRow {
    return this.one("SELECT * FROM missions WHERE id = ? OR slug = ?", ref, ref) ?? (() => { throw new AgentError("not_found", "Mission not found", 404); })();
  }
  private taskByRef(missionId: string, ref: string): SqlRow {
    const task = this.one("SELECT * FROM tasks WHERE mission_id = ? AND (id = ? OR seq = ? OR title = ?)", missionId, ref, Number(ref), ref);
    if (!task) throw new AgentError("not_found", "Task not found", 404);
    if (task.mission_id !== missionId) throw new AgentError("cross_mission_dependency", "Dependencies must stay inside the mission", 400);
    return task;
  }
  private taskGlobal(ref: string): SqlRow {
    const task = this.one("SELECT * FROM tasks WHERE id = ? OR seq = ?", ref, Number(ref));
    if (!task) throw new AgentError("not_found", "Task not found", 404);
    return task;
  }

  lease(workspaceId: string, attemptId: string): void {
    const exp = iso(this.clock.now() + this.config.leases.stale_after_s * 1000);
    const changed = this.run(
      "UPDATE workspaces SET lease_attempt_id = ?, state = 'leased', lease_expires_at = ? WHERE id = ? AND (lease_attempt_id IS NULL OR lease_attempt_id = ?)",
      attemptId,
      exp,
      workspaceId,
      attemptId,
    );
    if (!changed.changes) {
      const holder = this.one("SELECT lease_attempt_id FROM workspaces WHERE id = ?", workspaceId);
      throw new AgentError("lease_conflict", "Workspace is already leased", 409, { holder: holder?.lease_attempt_id });
    }
  }

  private notifyDesktop(approval: SqlRow): void {
    if (!this.config.notifications.desktop || this.notified.has(approval.id)) return;
    this.notified.add(approval.id);
    const child = spawn("notify-send", ["AgentOS", "An attempt is waiting for approval"], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  }

  private assertLiveAllowed(command: string[]): void {
    const bin = command[0] ?? "";
    const base = bin.split("/").pop() ?? bin;
    const joined = command.join(" ");
    if (joined.includes("fake-claude") || joined.includes("fake-codex")) return;
    if (process.env.AGENTOS_ALLOW_LIVE_RUNTIMES === "1") return;
    if (base === "claude" || base === "codex") {
      throw new AgentError("live_runtime_disabled", "Refusing to start a live Claude Code or Codex process without AGENTOS_ALLOW_LIVE_RUNTIMES=1", 400);
    }
  }

  corruptCheck(): string[] {
    return this.all("SELECT sha256 FROM evidence")
      .filter((item) => !blobMatches(this.home, item.sha256))
      .map((item) => item.sha256);
  }
}

function defaultConfig() {
  return {
    daemon: { port: 7787, max_running_attempts: 4 },
    approvals: { timeout_s: 1800 },
    leases: { heartbeat_s: 15, stale_after_s: 60 },
    attempts: { idle_warning_s: 600, cancel_grace_s: 10, gate_bypass_ms: 2000 },
    budget: { warning_ratio: 0.8 },
    events: { raw_inline_max_bytes: 65536, sse_heartbeat_s: 15 },
    ui: { open_browser_on_start: false },
    notifications: { desktop: false },
    runtimes: {
      "claude-code": { command: ["claude"] as string[], scenario: undefined as string | undefined },
      codex: { command: ["codex"] as string[], scenario: undefined as string | undefined },
    },
  };
}

function loadConfig(home: string, overlay?: Record<string, unknown>) {
  const config = defaultConfig();
  const file = join(home, "config.json");
  let raw: Record<string, any> = {};
  if (existsSync(file)) raw = JSON.parse(readFileSync(file, "utf8"));
  if (overlay) raw = { ...raw, ...overlay };
  const known = new Set(["daemon", "approvals", "leases", "attempts", "budget", "events", "ui", "notifications", "runtimes"]);
  for (const key of Object.keys(raw)) if (!known.has(key)) console.warn(`unknown config key ${key}`);
  for (const section of known) {
    if (raw[section] && typeof raw[section] === "object") Object.assign((config as any)[section], raw[section]);
  }
  if (raw.daemon?.port != null && (!Number.isInteger(raw.daemon.port) || raw.daemon.port < 0 || raw.daemon.port > 65535)) {
    throw new AgentError("config_invalid", "Invalid daemon.port", 1, { key: "daemon.port" });
  }
  return config;
}

function runtimeEnv(gateToken: string, scenario?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("AGENTOS_")) continue;
    if (value != null) env[key] = value;
  }
  env.AGENTOS_GATE_TOKEN = gateToken;
  if (scenario) env.AGENTOS_FAKE_SCENARIO = scenario;
  return env;
}

function resolveReal(path: string): string {
  let current = path;
  const tail: string[] = [];
  while (!existsSync(current)) {
    const parent = join(current, "..");
    if (parent === current) break;
    tail.push(current.slice(parent.length + 1));
    current = parent;
  }
  let out = existsSync(current) ? require("node:fs").realpathSync(current) : current;
  for (const part of tail.reverse()) out = join(out, part);
  return out;
}

function processIdentity(pid: number): { alive: boolean; startTime: string | null } {
  if (!pid) return { alive: false, startTime: null };
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const rest = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    return { alive: true, startTime: rest[19] ?? null };
  } catch {
    return { alive: false, startTime: null };
  }
}

async function cancelProcess(pid: number, graceMs: number): Promise<void> {
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pid, sig);
    } catch {
      try {
        process.kill(pid, sig);
      } catch {
        // already gone
      }
    }
  };
  signal("SIGINT");
  if (await waitDead(pid, graceMs || 200)) return;
  signal("SIGTERM");
  if (await waitDead(pid, 5000)) return;
  signal("SIGKILL");
  await waitDead(pid, 1000);
}

function waitDead(pid: number, ms: number): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolvePromise) => {
    const timer = setInterval(() => {
      if (!processIdentity(pid).alive || Date.now() - start >= ms) {
        clearInterval(timer);
        resolvePromise(!processIdentity(pid).alive);
      }
    }, 30);
  });
}

function runShell(command: string, cwd: string, timeoutMs: number, allow: string[]): Promise<{ code: number; output: string }> {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || "C.UTF-8" };
  for (const key of allow) if (process.env[key]) env[key] = process.env[key];
  return new Promise((resolvePromise) => {
    const child = spawn("bash", ["-lc", command], { cwd, env });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, output: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

function buildPrompt(mission: SqlRow, criteria: SqlRow[], task: SqlRow): string {
  return [
    "# Mission",
    mission.objective || mission.title,
    "",
    "## Success criteria",
    ...criteria.map((criterion) => `- [ ] ${criterion.kind === "text" ? criterion.value : `${criterion.kind}: ${criterion.value}`}`),
    "",
    "## Task",
    task.title,
    task.description || "",
    "",
    "## Working rules",
    "- Work only inside the current directory.",
    "- Do not push, do not change git remotes, and do not edit files outside this directory.",
    "- Some actions need human approval and may be denied. If an action is denied, choose another approach or stop and explain.",
    "- Finish with a short summary of what changed and how it was verified.",
    "",
  ].join("\n");
}

function publicEvent(row: SqlRow, raw: boolean): SqlRow {
  const payload = JSON.parse(row.payload);
  const masked = JSON.parse(maskSecrets(JSON.stringify(payload)));
  return {
    id: row.id,
    ts: row.ts,
    type: row.type,
    mission_id: row.mission_id,
    task_id: row.task_id,
    attempt_id: row.attempt_id,
    actor: row.actor,
    payload: masked,
    ...(raw ? { raw: row.raw, raw_blob_sha256: row.raw_blob_sha256 } : {}),
  };
}

function sseHeaders(): Record<string, string> {
  return {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  };
}

function denyBody(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

function rank(effect: string): number {
  return effect === "deny" ? 3 : effect === "ask" ? 2 : 1;
}

function readBlobText(home: string, sha: string): string {
  return readFileSync(join(home, "blobs", sha.slice(0, 2), sha), "utf8");
}

function readdirSafe(dir: string): string[] {
  try {
    return require("node:fs").readdirSync(dir) as string[];
  } catch {
    return [];
  }
}

function repoRoot(): string {
  return new URL("../../../", import.meta.url).pathname;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export { delay };
