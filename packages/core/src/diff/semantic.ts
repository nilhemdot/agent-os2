import type { SourceFile } from "../model/types.js";
import { sevRank } from "../model/types.js";
import { classifyAllow, settingsCommands } from "../rules/settings-rules.js";
import { effectiveLaunch, isObj, isStr, mcpServers, strArgs } from "../rules/helpers.js";
import { tasksCommands } from "../rules/tasks-rule.js";
import { SECRET_KEY_NAME, SECRET_PATTERNS } from "../secrets/patterns.js";

/**
 * Structured comparison of agent configuration that a text diff cannot express: "this PR widened a permission",
 * "this hook command changed", "this MCP server's launch changed". Complements the finding-level diff.
 */

export type ChangeKind =
  | "file-added" | "file-removed" | "file-renamed"
  | "permission-added" | "permission-widened" | "permission-removed" | "deny-removed" | "default-mode-changed"
  | "env-added" | "env-changed" | "env-removed"
  | "hook-added" | "hook-changed" | "hook-removed"
  | "mcp-approval-changed"
  | "mcp-server-added" | "mcp-server-changed" | "mcp-server-removed"
  | "task-added" | "task-changed" | "task-removed"
  | "local-settings-tracked" | "local-settings-untracked";

export interface ConfigChange {
  kind: ChangeKind;
  file: string;
  /** What changed: a permission entry, hook event, server name, env key, task label. */
  subject: string;
  detail: string;
  before?: string;
  after?: string;
  /** True when the change expands what the repository can make an agent do (new/changed executables, wider permissions, ...). */
  riskier: boolean;
}

export interface SemanticInput {
  base: { files: SourceFile[]; tracked?: Set<string> };
  head: { files: SourceFile[]; tracked?: Set<string> };
  /** head path -> base path for files detected as renamed/moved */
  renames: Map<string, string>;
}

const SETTINGS = new Set(["claude-settings", "claude-local-settings"]);
const MCP = new Set(["mcp-json", "cursor-mcp", "vscode-mcp", "gemini-settings", "codex-config", "claude-desktop-config"]);
const INSTRUCTION = new Set(["instruction-md", "cursor-rule", "copilot-instructions", "windsurf-rules", "cline-rules", "skill-md"]);

/** Show a value unless it looks secret. */
function shown(key: string, v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (SECRET_KEY_NAME.test(key)) return "‹hidden›";
  for (const p of SECRET_PATTERNS) { p.re.lastIndex = 0; if (p.re.test(s)) return "‹hidden›"; }
  return s.length > 100 ? s.slice(0, 97) + "…" : s;
}

/** Does allow rule `wide` cover everything `narrow` allows (and is it a different, broader rule)? */
export function coversEntry(wide: string, narrow: string): boolean {
  if (wide === narrow) return false;
  const parse = (e: string) => /^\s*([A-Za-z_][\w:.-]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(e);
  const w = parse(wide), n = parse(narrow);
  if (!w || !n || w[1] !== n[1]) return false;
  const ws = (w[2] ?? "*").trim(), ns = (n[2] ?? "*").trim();
  if (ws === "" || ws === "*" || ws === "**" || ws === ":*") return ns !== ws;
  const m = /^(.*?)(?::\*|\s*\*+)$/.exec(ws);
  return !!m && ns.startsWith(m[1]!.trimEnd()) && ns !== ws;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);

function settingsChanges(b: SourceFile | undefined, h: SourceFile, out: ConfigChange[]): void {
  const bp = isObj(b?.parsed) ? b!.parsed : {};
  const hp = isObj(h.parsed) ? h.parsed : {};
  const bPerm = isObj(bp.permissions) ? bp.permissions : {};
  const hPerm = isObj(hp.permissions) ? hp.permissions : {};

  // allow list
  const bAllow = new Set(arr(bPerm.allow)), hAllow = arr(hPerm.allow);
  const removedAllow = [...bAllow].filter((e) => !hAllow.includes(e));
  const addedAllow = hAllow.filter((e) => !bAllow.has(e));
  for (const e of addedAllow) {
    const covers = removedAllow.find((r) => coversEntry(e, r));
    const cls = classifyAllow(e);
    if (covers) out.push({ kind: "permission-widened", file: h.path, subject: e, detail: `permission widened: ${covers} → ${e}`, before: covers, after: e, riskier: true });
    else out.push({ kind: "permission-added", file: h.path, subject: e, detail: `permission added: ${e}`, after: e, riskier: !!cls && sevRank(cls.sev) >= sevRank("medium") });
  }
  for (const e of removedAllow) if (!addedAllow.some((a) => coversEntry(a, e))) out.push({ kind: "permission-removed", file: h.path, subject: e, detail: `permission removed: ${e}`, before: e, riskier: false });

  // deny list (removing protections)
  const hDeny = new Set(arr(hPerm.deny));
  for (const d of arr(bPerm.deny)) if (!hDeny.has(d)) out.push({ kind: "deny-removed", file: h.path, subject: d, detail: `deny rule removed: ${d}`, before: d, riskier: true });

  if (bPerm.defaultMode !== hPerm.defaultMode && hPerm.defaultMode !== undefined) {
    const risky = ["bypassPermissions", "auto", "dontAsk"].includes(String(hPerm.defaultMode));
    out.push({ kind: "default-mode-changed", file: h.path, subject: "permissions.defaultMode", detail: `defaultMode ${bPerm.defaultMode === undefined ? "(unset)" : String(bPerm.defaultMode)} → ${String(hPerm.defaultMode)}`, before: String(bPerm.defaultMode ?? ""), after: String(hPerm.defaultMode), riskier: risky });
  }

  // env
  const bEnv = isObj(bp.env) ? bp.env : {}, hEnv = isObj(hp.env) ? hp.env : {};
  for (const [k, v] of Object.entries(hEnv)) {
    if (!(k in bEnv)) out.push({ kind: "env-added", file: h.path, subject: k, detail: `env ${k} added: ${shown(k, v)}`, after: shown(k, v), riskier: true });
    else if (bEnv[k] !== v) out.push({ kind: "env-changed", file: h.path, subject: k, detail: `env ${k} changed: ${shown(k, bEnv[k])} → ${shown(k, v)}`, before: shown(k, bEnv[k]), after: shown(k, v), riskier: true });
  }
  for (const k of Object.keys(bEnv)) if (!(k in hEnv)) out.push({ kind: "env-removed", file: h.path, subject: k, detail: `env ${k} removed`, riskier: false });

  // hooks and command-running helper keys
  const bCmds = settingsCommands(bp), hCmds = settingsCommands(hp);
  const key = (c: { origin: string; command: string }) => `${c.origin}␟${c.command}`;
  const bKeys = new Map<string, number>(), hKeys = new Map<string, number>();
  for (const c of bCmds) bKeys.set(key(c), (bKeys.get(key(c)) ?? 0) + 1);
  for (const c of hCmds) hKeys.set(key(c), (hKeys.get(key(c)) ?? 0) + 1);
  const addedC = hCmds.filter((c) => { const n = bKeys.get(key(c)) ?? 0; if (n > 0) { bKeys.set(key(c), n - 1); return false; } return true; });
  const removedC = bCmds.filter((c) => { const n = hKeys.get(key(c)) ?? 0; if (n > 0) { hKeys.set(key(c), n - 1); return false; } return true; });
  const usedRemoved = new Set<number>();
  for (const a of addedC) {
    const ri = removedC.findIndex((r, i) => !usedRemoved.has(i) && r.origin === a.origin);
    if (ri >= 0) { usedRemoved.add(ri); out.push({ kind: "hook-changed", file: h.path, subject: a.origin, detail: `${a.origin} command changed`, before: removedC[ri]!.command, after: a.command, riskier: true }); }
    else out.push({ kind: "hook-added", file: h.path, subject: a.origin, detail: `${a.origin} added`, after: a.command, riskier: true });
  }
  removedC.forEach((r, i) => { if (!usedRemoved.has(i)) out.push({ kind: "hook-removed", file: h.path, subject: r.origin, detail: `${r.origin} removed`, before: r.command, riskier: false }); });

  // project MCP approvals
  if (hp.enableAllProjectMcpServers === true && bp.enableAllProjectMcpServers !== true)
    out.push({ kind: "mcp-approval-changed", file: h.path, subject: "enableAllProjectMcpServers", detail: "enableAllProjectMcpServers turned on: the repository now approves every server it ships", before: String(bp.enableAllProjectMcpServers ?? ""), after: "true", riskier: true });
  const bEn = new Set(arr(bp.enabledMcpjsonServers));
  for (const n of arr(hp.enabledMcpjsonServers)) if (!bEn.has(n)) out.push({ kind: "mcp-approval-changed", file: h.path, subject: n, detail: `MCP server "${n}" pre-approved`, after: n, riskier: true });
}

function launchLine(def: Record<string, unknown>): string {
  const l = effectiveLaunch(def);
  return l ? [l.cmd, ...l.args].join(" ") : isStr(def.url) ? def.url : "";
}

function mcpChanges(b: SourceFile | undefined, h: SourceFile, out: ConfigChange[]): void {
  const bs = new Map(b ? mcpServers(b).map((s) => [s.name, s.def] as const) : []);
  const hs = new Map(mcpServers(h).map((s) => [s.name, s.def] as const));
  for (const [name, def] of hs) {
    const old = bs.get(name);
    if (!old) { out.push({ kind: "mcp-server-added", file: h.path, subject: name, detail: `MCP server "${name}" added: ${launchLine(def)}`, after: launchLine(def), riskier: true }); continue; }
    const diffs: string[] = [];
    if (launchLine(old) !== launchLine(def)) diffs.push(`launch ${launchLine(old) || "(none)"} → ${launchLine(def) || "(none)"}`);
    const oe = isObj(old.env) ? old.env : {}, ne = isObj(def.env) ? def.env : {};
    for (const k of new Set([...Object.keys(oe), ...Object.keys(ne)])) if (JSON.stringify(oe[k]) !== JSON.stringify(ne[k])) diffs.push(`env ${k}: ${k in oe ? shown(k, oe[k]) : "(unset)"} → ${k in ne ? shown(k, ne[k]) : "(unset)"}`);
    const oh = isObj(old.headers) ? old.headers : {}, nh = isObj(def.headers) ? def.headers : {};
    for (const k of new Set([...Object.keys(oh), ...Object.keys(nh)])) if (JSON.stringify(oh[k]) !== JSON.stringify(nh[k])) diffs.push(`header ${k} changed`);
    if (strArgs(old).join("\u0000") !== strArgs(def).join("\u0000") && !diffs.some((d) => d.startsWith("launch"))) diffs.push("args changed");
    if (diffs.length) out.push({ kind: "mcp-server-changed", file: h.path, subject: name, detail: `MCP server "${name}" changed: ${diffs.join("; ")}`, before: launchLine(old), after: launchLine(def), riskier: true });
  }
  for (const name of bs.keys()) if (!hs.has(name)) out.push({ kind: "mcp-server-removed", file: h.path, subject: name, detail: `MCP server "${name}" removed`, riskier: false });
}

function taskChanges(b: SourceFile | undefined, h: SourceFile, out: ConfigChange[]): void {
  const bt = new Map((b ? tasksCommands(b.parsed) : []).map((t) => [t.label, t] as const));
  const ht = tasksCommands(h.parsed);
  const seen = new Set<string>();
  for (const t of ht) {
    if (seen.has(t.label)) continue;
    seen.add(t.label);
    const old = bt.get(t.label);
    if (!old) out.push({ kind: "task-added", file: h.path, subject: t.label, detail: `task "${t.label}" added${t.runOnOpen ? " (runs on folder open)" : ""}: ${t.command}`, after: t.command, riskier: t.runOnOpen });
    else if (old.command !== t.command || old.runOnOpen !== t.runOnOpen)
      out.push({ kind: "task-changed", file: h.path, subject: t.label, detail: `task "${t.label}" changed${t.runOnOpen && !old.runOnOpen ? " (now runs on folder open)" : ""}`, before: old.command, after: t.command, riskier: t.runOnOpen });
  }
  for (const label of bt.keys()) if (!seen.has(label)) out.push({ kind: "task-removed", file: h.path, subject: label, detail: `task "${label}" removed`, riskier: false });
}

export function semanticChanges(input: SemanticInput): ConfigChange[] {
  const out: ConfigChange[] = [];
  const baseByPath = new Map(input.base.files.map((f) => [f.path, f] as const));
  const headPaths = new Set(input.head.files.map((f) => f.path));
  const renamedFrom = new Set(input.renames.values());

  for (const h of input.head.files) {
    const from = input.renames.get(h.path);
    const b = baseByPath.get(from ?? h.path);
    if (!b) {
      out.push({ kind: "file-added", file: h.path, subject: h.path, detail: `${h.kind} file added`, riskier: SETTINGS.has(h.kind) || MCP.has(h.kind) || h.kind === "vscode-tasks" || INSTRUCTION.has(h.kind) });
    } else if (from && from !== h.path) {
      out.push({ kind: "file-renamed", file: h.path, subject: from, detail: `renamed from ${from}`, before: from, after: h.path, riskier: false });
    }
    if (SETTINGS.has(h.kind)) settingsChanges(b, h, out);
    else if (MCP.has(h.kind)) mcpChanges(b, h, out);
    else if (h.kind === "vscode-tasks") taskChanges(b, h, out);
    // local settings that became tracked by git
    if (h.kind === "claude-local-settings" && input.head.tracked?.has(h.path) && input.base.tracked && !input.base.tracked.has(from ?? h.path))
      out.push({ kind: "local-settings-tracked", file: h.path, subject: h.path, detail: `${h.path} is now committed to git`, riskier: true });
  }
  for (const b of input.base.files) if (!headPaths.has(b.path) && !renamedFrom.has(b.path)) out.push({ kind: "file-removed", file: b.path, subject: b.path, detail: `${b.kind} file removed`, riskier: false });
  return out;
}
