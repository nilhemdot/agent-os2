import { createHash, randomBytes } from "node:crypto";

/** Product identity. Renaming the public name touches this constant and package metadata only. */
export const PRODUCT_CODENAME = "AgentOS";
export const CLI_NAME = "agentos";
export const PRODUCT_VERSION = "0.1.0";

/** 1 USD = 1_000_000_000 nano-USD. */
export const NANO_PER_USD = 1_000_000_000;

export type Effect = "deny" | "ask" | "allow";

export type MissionState = "draft" | "active" | "review_done" | "done" | "cancelled";
export type TaskState = "pending" | "ready" | "running" | "verifying" | "passed" | "failed" | "cancelled";
export type AttemptState =
  | "queued"
  | "starting"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "budget_stopped"
  | "lost";
export type WorkspaceState = "creating" | "leased" | "released" | "stale" | "removed";
export type ApprovalState = "pending" | "allowed" | "denied" | "expired" | "cancelled";
export type ReviewState = "none" | "accepted" | "rejected";
export type PolicyCoverage = "all" | "escalated" | "none";
export type TaskKind = "work" | "verify";
export type CriterionKind = "test_command" | "file_exists" | "command" | "text";

export class AgentError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export interface Clock {
  now(): number;
}

export function systemClock(): Clock {
  return { now: () => Date.now() };
}

export function manualClock(start = 1_700_000_000_000): Clock & { set(ms: number): void; advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    set(ms: number) {
      current = ms;
    },
    advance(ms: number) {
      current += ms;
    },
  };
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(ms = Date.now()): string {
  let time = ms;
  let timePart = "";
  for (let i = 0; i < 10; i++) {
    timePart = CROCKFORD[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(10);
  let rand = "";
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rand += CROCKFORD[(acc >> bits) & 31];
    }
  }
  if (bits > 0) rand += CROCKFORD[(acc << (5 - bits)) & 31];
  return (timePart + rand).slice(0, 26);
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "mission";
}

/** Parse a decimal USD string into nano-USD without binary float drift. */
export function usdToNano(input: string): number {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new AgentError("invalid_argument", `Budget must be a non-negative USD amount, got ${input}`);
  }
  const [whole, frac = ""] = text.split(".");
  const frac9 = (frac + "000000000").slice(0, 9);
  const nano = BigInt(whole) * BigInt(NANO_PER_USD) + BigInt(frac9);
  if (nano > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AgentError("invalid_argument", "Budget exceeds the supported range");
  }
  return Number(nano);
}

export function nanoToUsd(nano: number | null | undefined): string | null {
  if (nano == null) return null;
  const neg = nano < 0;
  const abs = Math.abs(nano);
  const whole = Math.floor(abs / NANO_PER_USD);
  const frac = String(abs % NANO_PER_USD).padStart(9, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : String(whole);
  return neg ? `-${body}` : body;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`).join(",")}}`;
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function inputHash(tool: string, input: unknown): string {
  return sha256Hex(canonicalJson({ tool, input }));
}

const MISSION_TRANSITIONS: Record<MissionState, MissionState[]> = {
  draft: ["active", "cancelled"],
  active: ["review_done", "cancelled"],
  review_done: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

const TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  pending: ["ready", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["verifying", "passed", "failed", "cancelled"],
  verifying: ["passed", "failed", "cancelled"],
  passed: [],
  failed: ["ready", "cancelled"],
  cancelled: [],
};

const ATTEMPT_TRANSITIONS: Record<AttemptState, AttemptState[]> = {
  queued: ["starting", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: ["waiting_approval", "succeeded", "failed", "cancelled", "budget_stopped", "lost"],
  waiting_approval: ["running", "succeeded", "failed", "cancelled", "budget_stopped", "lost"],
  succeeded: [],
  failed: [],
  cancelled: [],
  budget_stopped: [],
  lost: [],
};

const WORKSPACE_TRANSITIONS: Record<WorkspaceState, WorkspaceState[]> = {
  creating: ["leased"],
  leased: ["released", "stale"],
  stale: ["released"],
  released: ["removed"],
  removed: [],
};

const APPROVAL_TRANSITIONS: Record<ApprovalState, ApprovalState[]> = {
  pending: ["allowed", "denied", "expired", "cancelled"],
  allowed: [],
  denied: [],
  expired: [],
  cancelled: [],
};

const TABLES = {
  mission: MISSION_TRANSITIONS,
  task: TASK_TRANSITIONS,
  attempt: ATTEMPT_TRANSITIONS,
  workspace: WORKSPACE_TRANSITIONS,
  approval: APPROVAL_TRANSITIONS,
} as const;

export type MachineName = keyof typeof TABLES;

export function canTransition(machine: MachineName, from: string, to: string): boolean {
  const table = TABLES[machine] as Record<string, readonly string[]>;
  return (table[from] ?? []).includes(to);
}

export function assertTransition(machine: MachineName, from: string, to: string): void {
  if (from === to) return;
  if (!canTransition(machine, from, to)) {
    throw new AgentError(
      "invalid_transition",
      `Cannot move ${machine} from ${from} to ${to}`,
      409,
      { machine, from, to },
    );
  }
}

export function isTerminalAttempt(state: AttemptState): boolean {
  return ["succeeded", "failed", "cancelled", "budget_stopped", "lost"].includes(state);
}

/**
 * Display-time secret masking (NFR-SEC-06). Raw evidence is left untouched.
 * Patterns: provider key prefixes, PEM private keys, AWS secret assignments,
 * JWT-like triples, and long high-entropy KEY=value pairs.
 */
export function maskSecrets(input: string): string {
  let text = input;
  text = text.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  );
  text = text.replace(/\b(sk-(?:ant|proj|live|test)-[A-Za-z0-9_\-]{8,})/g, "[REDACTED_KEY]");
  text = text.replace(/\b(sk-[A-Za-z0-9]{16,})\b/g, "[REDACTED_KEY]");
  text = text.replace(/\b(AKIA[0-9A-Z]{16})\b/g, "[REDACTED_KEY]");
  text = text.replace(/\b(ghp_[A-Za-z0-9]{20,})\b/g, "[REDACTED_KEY]");
  text = text.replace(/\b(github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_KEY]");
  text = text.replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[REDACTED_KEY]");
  text = text.replace(/(AWS_SECRET_ACCESS_KEY\s*=\s*)(['"]?)[^\s'"]+/gi, "$1$2[REDACTED]");
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_JWT]",
  );
  text = text.replace(
    /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*)=(['"]?)([^\s'"]{12,})/g,
    "$1=$2[REDACTED]",
  );
  return text;
}

export function looksLikeSecret(input: string): boolean {
  return maskSecrets(input) !== input;
}

export function parseCriterion(value: string): { kind: CriterionKind; value: string } {
  const file = /^file\s+(.+?)\s+exists$/i.exec(value.trim());
  if (file) return { kind: "file_exists", value: file[1] };
  const command = /^command\s+"([\s\S]+)"\s+exits\s+0$/i.exec(value.trim());
  if (command) return { kind: "command", value: command[1] };
  return { kind: "text", value: value.trim() };
}

export function compareVersions(actual: string, minimum: string): number {
  const parse = (v: string) => {
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(v);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const a = parse(actual);
  const b = parse(minimum);
  if (!a || !b) return actual === minimum ? 0 : -1;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export const CLAUDE_MIN_VERSION = "2.1.295";
export const DEFAULT_PORT = 7787;
export const EVENT_TYPES = [
  "mission.created",
  "mission.updated",
  "mission.started",
  "mission.cancelled",
  "mission.done",
  "task.created",
  "task.state_changed",
  "attempt.queued",
  "attempt.started",
  "attempt.heartbeat",
  "attempt.result",
  "attempt.exited",
  "attempt.cancelled",
  "attempt.lost",
  "attempt.budget_stopped",
  "agent.message",
  "tool.requested",
  "tool.decided",
  "tool.completed",
  "approval.created",
  "approval.resolved",
  "approval.expired",
  "approval.cancelled",
  "workspace.created",
  "workspace.leased",
  "workspace.released",
  "workspace.lease_stale",
  "workspace.removed",
  "evidence.added",
  "verify.started",
  "verify.command",
  "verify.finished",
  "usage.recorded",
  "budget.warning",
  "budget.exhausted",
  "policy.reloaded",
  "policy.invalid",
  "adapter.unknown",
  "adapter.raw_text",
  "adapter.error",
  "review.accepted",
  "review.rejected",
  "review.merged",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function knownEventType(type: string): type is EventType {
  return (EVENT_TYPES as readonly string[]).includes(type);
}
