import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentError } from "@agentos/core";

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(dir: string): MigrationFile[] {
  const files = readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  return files.map((name) => {
    const version = Number(name.split("_")[0]);
    const sql = readFileSync(join(dir, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    return { version, name, sql, checksum };
  });
}

export function applyMigrations(db: DatabaseSync, dir: string, opts: { now: string; backupTo?: (version: number) => string } ): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const files = loadMigrations(dir);
  const applied = db.prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version").all() as {
    version: number;
    name: string;
    checksum: string;
  }[];
  const known = new Map(files.map((file) => [file.version, file]));
  const maxKnown = files.reduce((max, file) => Math.max(max, file.version), 0);
  const maxApplied = applied.reduce((max, row) => Math.max(max, row.version), 0);
  if (maxApplied > maxKnown) {
    throw new AgentError("schema_too_new", `Database schema version ${maxApplied} is newer than this code (${maxKnown})`, 1);
  }
  for (const row of applied) {
    const file = known.get(row.version);
    if (!file) {
      throw new AgentError("schema_too_new", `Database has migration ${row.version} which this code does not include`, 1);
    }
    if (file.checksum !== row.checksum) {
      throw new AgentError(
        "migration_checksum_mismatch",
        `Migration ${file.name} was edited after it was applied`,
        1,
        { version: row.version, name: file.name },
      );
    }
  }
  const pending = files.filter((file) => !applied.some((row) => row.version === file.version));
  if (pending.length === 0) return;
  if (applied.length > 0 && opts.backupTo) {
    const dest = opts.backupTo(maxApplied);
    const escaped = dest.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${escaped}'`);
  }
  for (const file of pending) {
    db.exec("BEGIN");
    try {
      db.exec(file.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)").run(
        file.version,
        file.name,
        file.checksum,
        opts.now,
      );
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // already rolled back
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentError("migration_failed", `Migration ${file.name} failed: ${message}`, 1, {
        version: file.version,
        name: file.name,
      });
    }
  }
}
