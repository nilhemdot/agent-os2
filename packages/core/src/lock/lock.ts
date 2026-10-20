import { createHash } from "node:crypto";
import type { Finding, SourceFile } from "../model/types.js";
import { PRODUCT } from "../product.js";
import { isObj, isStr, mcpServers, MCP_KINDS, SETTINGS_KINDS, ZERO_RANGE, clip, type Path } from "../rules/helpers.js";
import { SECRET_PATTERNS, SECRET_KEY_NAME, redactFindingText } from "../secrets/patterns.js";

/**
 * AG-012: lock file and drift ("rug-pull" class). The lock records a hash of every MCP server definition and every hook
 * command at a point in time the user reviewed. `verifyLock` then reports definitions that changed, appeared or disappeared.
 * The lock stores a redacted human-readable summary only to explain the difference; the hash covers the full definition
 * (including env and header values), which is never written to the lock.
 */

export const LOCK_FILE = PRODUCT.lockFile;

export type LockKind = "mcp-server" | "hook";

export interface LockEntry {
  kind: LockKind;
  file: string;
  /** JSON path of the definition inside the file, e.g. mcpServers.fs or hooks.SessionStart.0.hooks.0 */
  key: string;
  sha256: string;
  /** redacted, truncated; only used for before/after evidence */
  summary: string;
}

export interface LockFile { version: 1; tool: string; entries: LockEntry[] }

export class LockError extends Error {}

/** Entry plus data used only for matching and locating (never written to the lock). */
interface Collected extends LockEntry { group: string; path: Path; source: SourceFile }

// ------------------------------------------------------------------ canonical hashing

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObj(v)) { const o: Record<string, unknown> = {}; for (const k of Object.keys(v).sort()) o[k] = canonical(v[k]); return o; }
  return v;
}
const hashOf = (v: unknown): string => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

// ------------------------------------------------------------------ redacted summaries

function scrub(text: string): string {
  let t = text;
  for (const p of SECRET_PATTERNS) t = t.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g"), "‹redacted›");
  return t;
}

function scrubArgs(args: string[]): string[] {
  const out: string[] = [];
  let hideNext = false;
  for (const a of args) {
    if (hideNext) { out.push("‹redacted›"); hideNext = false; continue; }
    const m = /^(--?[\w-]+)=(.+)$/.exec(a);
    if (m && SECRET_KEY_NAME.test(m[1]!)) { out.push(`${m[1]}=‹redacted›`); continue; }
    if (/^--?[\w-]+$/.test(a) && SECRET_KEY_NAME.test(a)) { out.push(a); hideNext = true; continue; }
    out.push(a);
  }
  return out;
}

const names = (v: unknown): string[] => (isObj(v) ? Object.keys(v).sort() : []);

function mcpSummary(def: Record<string, unknown>): string {
  const parts: string[] = [];
  if (isStr(def.command)) parts.push(scrub([def.command, ...scrubArgs(Array.isArray(def.args) ? def.args.filter(isStr) : [])].join(" ")));
  if (isStr(def.url)) parts.push(scrub(def.url));
  if (isStr(def.type) && !isStr(def.url) && !isStr(def.command)) parts.push(`type ${def.type}`);
  const env = names(def.env); const headers = names(def.headers);
  if (env.length) parts.push(`[env: ${env.join(",")}]`);
  if (headers.length) parts.push(`[headers: ${headers.join(",")}]`);
  return clip(parts.join(" ") || "(empty definition)", 200);
}

function hookSummary(event: string, matcher: unknown, h: Record<string, unknown>): string {
  const what = isStr(h.url) ? `http ${scrub(h.url)}` : [isStr(h.command) ? h.command : "", ...(Array.isArray(h.args) ? scrubArgs(h.args.filter(isStr)) : [])].join(" ").trim();
  return clip(`${event}${isStr(matcher) && matcher ? ` [${matcher}]` : ""}: ${scrub(what) || "(no command)"}`, 200);
}

// ------------------------------------------------------------------ collection

/** Every MCP server definition and hook command in the given parsed files. */
function collect(files: SourceFile[]): Collected[] {
  const out: Collected[] = [];
  for (const file of files) {
    if (file.parseError) continue;
    if ((MCP_KINDS as string[]).includes(file.kind)) {
      for (const s of mcpServers(file)) {
        out.push({ kind: "mcp-server", file: file.path, key: s.path.join("."), sha256: hashOf(s.def), summary: mcpSummary(s.def), group: `mcp:${s.path.join(".")}`, path: s.path, source: file });
      }
    }
    if ((SETTINGS_KINDS as string[]).includes(file.kind) && isObj(file.parsed) && isObj(file.parsed.hooks)) {
      for (const [event, groups] of Object.entries(file.parsed.hooks)) {
        if (!Array.isArray(groups)) continue;
        groups.forEach((g, gi) => {
          if (!isObj(g) || !Array.isArray(g.hooks)) return;
          g.hooks.forEach((h, hi) => {
            if (!isObj(h)) return;
            const path: Path = ["hooks", event, gi, "hooks", hi];
            out.push({
              kind: "hook", file: file.path, key: path.join("."), group: `hook:${event}`, path, source: file,
              sha256: hashOf({ event, matcher: g.matcher ?? null, hook: h }), summary: hookSummary(event, g.matcher, h),
            });
          });
        });
      }
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.key.localeCompare(b.key));
}

export function collectLockEntries(files: SourceFile[]): LockEntry[] {
  return collect(files).map(({ kind, file, key, sha256, summary }) => ({ kind, file, key, sha256, summary }));
}

// ------------------------------------------------------------------ file format

export const createLock = (files: SourceFile[]): LockFile => ({ version: 1, tool: PRODUCT.name, entries: collectLockEntries(files) });
export const serializeLock = (l: LockFile): string => JSON.stringify(l, null, 2) + "\n";

export function parseLock(text: string): LockFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new LockError(`lock is not valid JSON: ${(e as Error).message}`); }
  if (!isObj(raw) || raw.version !== 1) throw new LockError("lock has an unsupported or missing version (expected 1)");
  if (!Array.isArray(raw.entries)) throw new LockError("lock has no entries array");
  const entries: LockEntry[] = [];
  for (const e of raw.entries) {
    if (!isObj(e) || (e.kind !== "mcp-server" && e.kind !== "hook") || !isStr(e.file) || !isStr(e.key) || !isStr(e.sha256) || !/^[0-9a-f]{64}$/.test(e.sha256)) throw new LockError("lock has an invalid entry");
    entries.push({ kind: e.kind, file: e.file, key: e.key, sha256: e.sha256, summary: isStr(e.summary) ? e.summary : "" });
  }
  return { version: 1, tool: isStr(raw.tool) ? raw.tool : PRODUCT.name, entries };
}

// ------------------------------------------------------------------ drift

export type DriftType = "changed" | "added" | "removed";
export interface Drift { type: DriftType; before?: LockEntry; after?: LockEntry }

export interface VerifyResult { drift: Drift[]; findings: Finding[]; counts: { changed: number; added: number; removed: number }; entries: number }

const M012 = { id: "AG-012", references: ["https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices"] };

/** Compare the lock with the files as they are now. Pure; reads nothing. */
export function verifyLock(lock: LockFile, files: SourceFile[]): VerifyResult {
  const current = collect(files);
  const used = new Set<Collected>();
  const drift: Drift[] = [];
  const free = new Set<Collected>(current);
  let locked = [...lock.entries];

  // 1) identical definition at the same place, then 2) identical definition elsewhere (re-ordered hooks, moved file): not drift
  const take = (pred: (l: LockEntry, c: Collected) => boolean) => {
    locked = locked.filter((l) => {
      for (const c of free) if (c.kind === l.kind && c.sha256 === l.sha256 && pred(l, c)) { free.delete(c); used.add(c); return false; }
      return true;
    });
  };
  take((l, c) => c.file === l.file && c.key === l.key);
  take(() => true);

  // 3) same place, different definition: changed
  locked = locked.filter((l) => {
    for (const c of free) if (c.kind === l.kind && c.file === l.file && c.key === l.key) { free.delete(c); used.add(c); drift.push({ type: "changed", before: l, after: c }); return false; }
    return true;
  });
  const stillLocked = locked;
  const freeCurrent = [...free];

  // exactly one removed and one added in the same file+group (e.g. a hook command edited AND shifted): treat as a change
  const groupOf = (l: LockEntry): string => (l.kind === "mcp-server" ? `mcp:${l.key}` : `hook:${l.key.split(".")[1] ?? ""}`);
  const lockedByGroup = new Map<string, LockEntry[]>();
  for (const l of stillLocked) { const k = `${l.file}|${groupOf(l)}`; (lockedByGroup.get(k) ?? lockedByGroup.set(k, []).get(k)!).push(l); }
  const freeByGroup = new Map<string, Collected[]>();
  for (const c of freeCurrent) { const k = `${c.file}|${c.group}`; (freeByGroup.get(k) ?? freeByGroup.set(k, []).get(k)!).push(c); }
  const pairedLocked = new Set<LockEntry>(); const pairedCurrent = new Set<Collected>();
  for (const [k, ls] of lockedByGroup) {
    const cs = freeByGroup.get(k);
    if (ls.length === 1 && cs?.length === 1) { drift.push({ type: "changed", before: ls[0], after: cs[0] }); pairedLocked.add(ls[0]!); pairedCurrent.add(cs[0]!); }
  }
  for (const l of stillLocked) if (!pairedLocked.has(l)) drift.push({ type: "removed", before: l });
  for (const c of freeCurrent) if (!pairedCurrent.has(c)) drift.push({ type: "added", after: c });

  const counts = { changed: 0, added: 0, removed: 0 };
  const findings: Finding[] = [];
  for (const d of drift) {
    counts[d.type]++;
    findings.push(driftFinding(d, current));
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || (a.jsonPath ?? "").localeCompare(b.jsonPath ?? ""));
  for (const f of findings) redactFindingText(f);
  return { drift, findings, counts, entries: lock.entries.length };
}

function driftFinding(d: Drift, current: Collected[]): Finding {
  const e = (d.after ?? d.before)!;
  const what = e.kind === "mcp-server" ? `MCP server "${e.key.split(".").slice(1).join(".")}"` : `${e.key.split(".")[1] ?? ""} hook`;
  const loc = d.after ? current.find((c) => c.kind === d.after!.kind && c.file === d.after!.file && c.key === d.after!.key) : undefined;
  const range = (loc ? loc.source.locate(loc.path) : undefined) ?? ZERO_RANGE;
  const sameSummary = d.before && d.after && d.before.summary === d.after.summary;
  const evidence = d.type === "changed"
    ? `before: ${d.before!.summary} | after: ${d.after!.summary}${sameSummary ? " (summary identical: env/header values or other fields changed)" : ""}`
    : d.type === "added" ? `after: ${d.after!.summary}` : `before: ${d.before!.summary}`;
  const base = {
    ruleId: M012.id, category: "supply-chain" as const, file: e.file, range, evidence, jsonPath: (d.after ?? d.before)!.key, subject: d.type, references: M012.references,
  };
  if (d.type === "changed") return {
    ...base, severity: "high", confidence: "high", title: `${what} changed since it was locked`,
    whyItMatters: "The definition differs from the one that was reviewed and locked. A changed launch command, package version, URL or hook command is how a previously accepted entry turns malicious (rug-pull class).",
    fix: `Review the change. If it is intended, re-run \`${PRODUCT.id} lock\` to accept it; otherwise revert it.`,
  };
  if (d.type === "added") return {
    ...base, severity: "medium", confidence: "high", title: `${what} was added after the lock`,
    whyItMatters: "This entry did not exist when the lock was written, so nobody has reviewed it against the lock.",
    fix: `Review it. If it is intended, re-run \`${PRODUCT.id} lock\` to accept it.`,
  };
  return {
    ...base, severity: "low", confidence: "high", title: `${what} in the lock no longer exists`,
    whyItMatters: "A locked entry disappeared. That is usually intended cleanup, but it can also mean a configuration was replaced by a differently named one.",
    fix: `If the removal is intended, re-run \`${PRODUCT.id} lock\` to update the lock.`,
  };
}
