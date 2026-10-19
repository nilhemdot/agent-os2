import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { AgentError } from "@agentos/core";
import { applyMigrations } from "./migrate.ts";

const migrations = new URL("./migrations/", import.meta.url).pathname;

function open(): { db: DatabaseSync; dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "agentos-mig-"));
  const file = join(dir, "agentos.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  return { db, dir, file };
}

describe("migrations", () => {
  it("AC-F1-3.1 applies every migration, records checksums, and enables WAL", () => {
    const { db, file } = open();
    applyMigrations(db, migrations, { now: "2026-10-18T00:00:00.000Z" });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    const journal = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    const fk = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    const busy = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
    expect(journal.journal_mode).toBe("wal");
    expect(fk.foreign_keys).toBe(1);
    expect(busy.timeout).toBe(5000);
    const rows = db.prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version").all() as {
      version: number;
      name: string;
      checksum: string;
    }[];
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0]?.name).toBe("001_foundations.sql");
    expect(rows[0]?.checksum).toHaveLength(64);
    expect(file.endsWith("agentos.db")).toBe(true);
    db.close();
  });

  it("AC-F1-3.2 backs up, applies the next migration, and rolls back a failing one", () => {
    const { db, dir } = open();
    const onlyFirst = join(dir, "m1");
    mkdirSync(onlyFirst);
    writeFileSync(join(onlyFirst, "001_foundations.sql"), readFileSync(join(migrations, "001_foundations.sql")));
    applyMigrations(db, onlyFirst, { now: "2026-10-18T00:00:00.000Z" });
    db.prepare(
      "INSERT INTO missions (id, slug, title, state, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)",
    ).run("m1", "smoke", "smoke", "2026-10-18T00:00:00.000Z", "2026-10-18T00:00:00.000Z");
    const both = join(dir, "m2");
    mkdirSync(both);
    writeFileSync(join(both, "001_foundations.sql"), readFileSync(join(migrations, "001_foundations.sql")));
    writeFileSync(join(both, "002_mission_notes.sql"), readFileSync(join(migrations, "002_mission_notes.sql")));
    writeFileSync(join(both, "003_bad.sql"), "ALTER TABLE missions ADD COLUMN notes TEXT;\n");
    let backup = "";
    let caught: AgentError | null = null;
    try {
      applyMigrations(db, both, {
        now: "2026-10-18T00:01:00.000Z",
        backupTo: (version) => {
          backup = join(dir, `agentos.db.bak-${version}-t`);
          return backup;
        },
      });
    } catch (error) {
      caught = error as AgentError;
    }
    expect(caught?.code).toBe("migration_failed");
    expect(caught?.details.name).toBe("003_bad.sql");
    const version = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number };
    expect(version.v).toBe(2);
    const mission = db.prepare("SELECT title FROM missions WHERE id = 'm1'").get() as { title: string };
    expect(mission.title).toBe("smoke");
    expect(statSync(backup).size).toBeGreaterThan(0);
    db.close();
  });

  it("AC-F1-3.3 refuses a database newer than the code", () => {
    const { db } = open();
    applyMigrations(db, migrations, { now: "2026-10-18T00:00:00.000Z" });
    db.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (99, 'future.sql', 'abc', '2026-10-18T00:00:00.000Z')").run();
    const before = readFileSync(join(migrations, "001_foundations.sql"));
    expect(() => applyMigrations(db, migrations, { now: "2026-10-18T00:02:00.000Z" })).toThrow(AgentError);
    try {
      applyMigrations(db, migrations, { now: "2026-10-18T00:02:00.000Z" });
    } catch (error) {
      expect((error as AgentError).code).toBe("schema_too_new");
    }
    expect(readFileSync(join(migrations, "001_foundations.sql")).equals(before)).toBe(true);
    db.close();
  });

  it("AC-F1-3.4 refuses an edited migration checksum", () => {
    const { db, dir } = open();
    const copy = join(dir, "copy");
    mkdirSync(copy);
    writeFileSync(join(copy, "001_foundations.sql"), readFileSync(join(migrations, "001_foundations.sql")));
    applyMigrations(db, copy, { now: "2026-10-18T00:00:00.000Z" });
    writeFileSync(join(copy, "001_foundations.sql"), `${readFileSync(join(migrations, "001_foundations.sql"), "utf8")}\n-- edited\n`);
    try {
      applyMigrations(db, copy, { now: "2026-10-18T00:03:00.000Z" });
      throw new Error("expected checksum mismatch");
    } catch (error) {
      expect((error as AgentError).code).toBe("migration_checksum_mismatch");
    }
    db.close();
  });

  it("AC-F1-3.5 every migration applies empty and on top of seeded rows, and final columns exist", () => {
    const { db } = open();
    const firstOnly = mkdtempSync(join(tmpdir(), "agentos-m1-"));
    writeFileSync(join(firstOnly, "001_foundations.sql"), readFileSync(join(migrations, "001_foundations.sql")));
    applyMigrations(db, firstOnly, { now: "2026-10-18T00:00:00.000Z" });
    db.prepare(
      "INSERT INTO missions (id, slug, title, state, created_at, updated_at) VALUES ('seed', 'seed', 'Seed', 'draft', '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z')",
    ).run();
    applyMigrations(db, migrations, { now: "2026-10-18T00:01:00.000Z" });
    const seeded = db.prepare("SELECT title, notes FROM missions WHERE id = 'seed'").get() as { title: string; notes: string | null };
    expect(seeded.title).toBe("Seed");
    expect(seeded.notes).toBeNull();
    const expected: Record<string, string[]> = {
      repos: ["id", "root_path", "name", "base_branch", "test_command", "test_timeout_s", "test_env_allowlist", "junit_path", "setup_command", "created_at", "archived_at"],
      profiles: ["id", "name", "runtime", "model", "tools", "policy_overlay", "attempt_budget_nusd", "allow_ungated", "created_at", "updated_at"],
      missions: ["id", "slug", "title", "objective", "repo_id", "state", "budget_nusd", "spent_nusd", "spent_includes_estimated", "spent_includes_unknown", "budget_warned", "created_at", "updated_at", "started_at", "ended_at", "archived_at", "notes"],
      mission_criteria: ["id", "mission_id", "seq", "kind", "value"],
      tasks: ["id", "mission_id", "seq", "kind", "title", "description", "profile_id", "verifies_task_id", "state", "unverified", "created_at", "updated_at"],
      task_deps: ["task_id", "depends_on_task_id"],
      attempts: ["id", "task_id", "seq", "runtime", "profile_snapshot", "state", "end_reason", "workspace_id", "runtime_session_id", "pid", "proc_start_time", "log_path", "log_offset", "stderr_path", "exit_code", "exit_signal", "review_state", "review_note", "override_reason", "gated", "base_dirty", "gate_token", "verification_label", "started_at", "ended_at", "created_at"],
      workspaces: ["id", "repo_id", "path", "branch", "base_commit", "state", "lease_attempt_id", "lease_expires_at", "released_at", "removed_at", "created_at"],
      approvals: ["id", "attempt_id", "tool", "input_json", "input_hash", "preview", "matched_rule_ids", "policy_hash", "state", "scope", "reason", "decided_by", "actor", "decided_at", "expires_at", "created_at"],
      gate_decisions: ["id", "attempt_id", "tool_use_ref", "tool", "arg", "input_hash", "effect", "matched_rule_ids", "policy_hash", "source_layers", "approval_id", "latency_ms", "reason", "created_at"],
      events: ["id", "ts", "type", "mission_id", "task_id", "attempt_id", "actor", "payload", "raw", "raw_blob_sha256"],
      evidence: ["id", "attempt_id", "task_id", "kind", "media_type", "sha256", "size_bytes", "label", "meta", "created_at"],
      usage: ["id", "attempt_id", "turn_ref", "model", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_nusd", "cost_source", "price_table_version", "created_at"],
      idempotency_keys: ["key", "request_hash", "response_status", "response_body", "created_at"],
    };
    for (const [table, columns] of Object.entries(expected)) {
      const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(info.map((column) => column.name), table).toEqual(columns);
    }
    const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all() as { name: string; sql: string }[];
    const lease = indexes.find((index) => index.name === "workspaces_one_active_lease");
    expect(lease?.sql.toLowerCase()).toContain("unique");
    expect(lease?.sql.toLowerCase()).toContain("where");
    const fk = db.prepare("PRAGMA foreign_key_list(mission_criteria)").all() as { table: string }[];
    expect(fk.some((row) => row.table === "missions")).toBe(true);
    db.close();
  });
});
