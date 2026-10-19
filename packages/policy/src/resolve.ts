import type { Effect } from "@agentos/core";
import { isAbsolute, normalize, resolve } from "node:path";
import { matchPathPattern, matchShellWild } from "./match.ts";
import { policyHash, type PolicyRule } from "./parse.ts";
import { analyzeCommand } from "./shell.ts";

export const PATH_TOOLS = new Set(["read", "write", "edit", "glob", "grep", "notebookedit"]);
export const MUTATING_PATH_TOOLS = new Set(["write", "edit", "notebookedit"]);

const RANK: Record<Effect, number> = { allow: 1, ask: 2, deny: 3 };

export function stricter(a: Effect, b: Effect): Effect {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface ResolveContext {
  cwd?: string;
  worktree?: string;
  home: string;
  /** Symlink-aware absolute path. Injected so this package does not touch the filesystem. */
  realpath?: (path: string) => string;
  /** Profile tool allowlist. Case-insensitive. Omit to skip the check. */
  tools?: string[] | null;
}

export interface ToolCall {
  tool: string;
  arg: string;
  input?: unknown;
}

export interface Decision {
  effect: Effect;
  matchedRuleIds: string[];
  policyHash: string;
  sourceLayers: string[];
  reason?: string;
}

export interface LayeredPolicy {
  rules: PolicyRule[];
  defaults: { source: "global" | "repo" | "profile"; effect: Effect }[];
}

export function resolveDecision(policy: LayeredPolicy, call: ToolCall, ctx: ResolveContext): Decision {
  const hash = policyHash(policy.rules, policy.defaults);
  const tool = call.tool.toLowerCase();

  if (ctx.tools) {
    const allowed = new Set(ctx.tools.map((name) => name.toLowerCase()));
    if (!allowed.has(tool)) {
      return {
        effect: "deny",
        matchedRuleIds: [],
        policyHash: hash,
        sourceLayers: ["profile"],
        reason: "tool_not_in_profile",
      };
    }
  }

  const argForMatch = isPathTool(tool, call.arg) ? normalizePathArg(call.arg, ctx) : call.arg;

  if (ctx.worktree && isPathTool(tool, call.arg)) {
    const root = normalizePathArg(ctx.worktree, { ...ctx, cwd: ctx.worktree });
    if (!isInside(root, argForMatch)) {
      const denyRules = matchingRules(policy.rules, tool, argForMatch, ctx).filter((rule) => rule.effect === "deny");
      return {
        effect: "deny",
        matchedRuleIds: denyRules.map((rule) => rule.id),
        policyHash: hash,
        sourceLayers: unique(denyRules.map((rule) => rule.source)),
        reason: "outside_workspace",
      };
    }
  }

  if (tool === "bash" || tool === "shell") {
    return resolveBash(policy, call.arg, hash, ctx);
  }

  const matched = matchingRules(policy.rules, tool, argForMatch, ctx);
  const decision = finish(policy, matched, hash, undefined);
  if (
    MUTATING_PATH_TOOLS.has(tool) &&
    ctx.worktree &&
    decision.effect === "ask" &&
    decision.matchedRuleIds.length === 0 &&
    isInside(normalizePathArg(ctx.worktree, { ...ctx, cwd: ctx.worktree }), argForMatch)
  ) {
    return {
      ...decision,
      effect: "allow",
      sourceLayers: ["global"],
      reason: "inside_workspace_edit",
    };
  }
  return decision;
}

function resolveBash(policy: LayeredPolicy, arg: string, hash: string, ctx: ResolveContext): Decision {
  const analysis = analyzeCommand(arg);
  const matched: PolicyRule[] = [];
  for (const candidate of analysis.candidates) {
    matched.push(...matchingRules(policy.rules, "bash", candidate, ctx));
  }
  const dedup = dedupeRules(matched);
  let decision = finish(policy, dedup, hash, undefined);
  if (analysis.unparseable && decision.effect !== "deny") {
    decision = {
      effect: "ask",
      matchedRuleIds: dedup.filter((rule) => rule.effect === "ask").map((rule) => rule.id),
      policyHash: hash,
      sourceLayers: decision.sourceLayers,
      reason: "unparseable_command",
    };
  }
  if (pipeToShell(arg)) {
    const pipeRules = dedup.filter((rule) => rule.effect === "deny");
    return {
      effect: "deny",
      matchedRuleIds: pipeRules.map((rule) => rule.id),
      policyHash: hash,
      sourceLayers: pipeRules.length ? unique(pipeRules.map((rule) => rule.source)) : ["global"],
      reason: pipeRules[0] ? undefined : "pipe_to_shell",
    };
  }
  return decision;
}

function finish(policy: LayeredPolicy, matched: PolicyRule[], hash: string, forced?: Effect): Decision {
  if (forced) {
    return { effect: forced, matchedRuleIds: [], policyHash: hash, sourceLayers: ["implicit"] };
  }
  if (matched.length === 0) {
    const effect = effectiveDefault(policy);
    const layers = policy.defaults.filter((item) => item.effect === effect).map((item) => item.source);
    return {
      effect,
      matchedRuleIds: [],
      policyHash: hash,
      sourceLayers: layers.length ? unique(layers) : ["implicit"],
    };
  }
  let effect: Effect = "allow";
  for (const rule of matched) effect = stricter(effect, rule.effect);
  const winning = matched.filter((rule) => rule.effect === effect);
  return {
    effect,
    matchedRuleIds: winning.map((rule) => rule.id),
    policyHash: hash,
    sourceLayers: unique(winning.map((rule) => rule.source)),
  };
}

export function effectiveDefault(policy: LayeredPolicy): Effect {
  if (policy.defaults.length === 0) return "ask";
  return policy.defaults.reduce<Effect>((acc, item) => stricter(acc, item.effect), "allow");
}

function matchingRules(rules: PolicyRule[], tool: string, arg: string, ctx: ResolveContext): PolicyRule[] {
  const found: PolicyRule[] = [];
  for (const rule of rules) {
    if (rule.match.some((pattern) => patternMatches(pattern, tool, arg, ctx))) found.push(rule);
  }
  return found;
}

export function patternMatches(pattern: string, tool: string, arg: string, ctx: Pick<ResolveContext, "home">): boolean {
  if (!pattern.includes("(")) return pattern.toLowerCase() === tool.toLowerCase();
  const open = pattern.indexOf("(");
  if (!pattern.endsWith(")")) return false;
  const name = pattern.slice(0, open);
  const inner = pattern.slice(open + 1, -1);
  if (name.toLowerCase() !== tool.toLowerCase()) return false;
  if (PATH_TOOLS.has(tool.toLowerCase())) return matchPathPattern(inner, arg, ctx.home);
  return matchShellWild(inner, arg);
}

export function isPathTool(tool: string, arg: string): boolean {
  if (PATH_TOOLS.has(tool.toLowerCase())) return true;
  return arg.startsWith("/") || arg.startsWith("~/") || arg === "~" || arg.startsWith("./") || arg.startsWith("../");
}

export function normalizePathArg(arg: string, ctx: ResolveContext): string {
  let path = arg;
  if (path === "~") path = ctx.home;
  else if (path.startsWith("~/")) path = `${ctx.home.replace(/\/$/, "")}/${path.slice(2)}`;
  const base = ctx.cwd ?? ctx.worktree ?? ctx.home;
  if (!isAbsolute(path)) path = resolve(base, path);
  path = normalize(path);
  if (ctx.realpath) {
    try {
      return ctx.realpath(path);
    } catch {
      return path;
    }
  }
  return path;
}

function isInside(root: string, target: string): boolean {
  const r = root.replace(/\/$/, "");
  const t = target.replace(/\/$/, "");
  return t === r || t.startsWith(`${r}/`);
}

function dedupeRules(rules: PolicyRule[]): PolicyRule[] {
  const seen = new Set<string>();
  const out: PolicyRule[] = [];
  for (const rule of rules) {
    const key = `${rule.source}:${rule.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

const DOWNLOADERS = ["curl", "wget", "fetch"];
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "sudo"]);

/** A pipeline that sends a download into a shell is always deny, even after `|` is split. */
export function pipeToShell(command: string): boolean {
  const analysis = analyzeCommand(command);
  for (const candidate of analysis.candidates) {
    if (!candidate.includes("|")) continue;
    const stages = candidate.split("|").map((part) => part.trim()).filter(Boolean);
    const names = stages.map((stage) => stage.split(/\s+/)[0]?.split("/").pop() ?? "");
    const hasDownload = names.some((name) => DOWNLOADERS.includes(name));
    const hasShell = names.some((name) => SHELLS.has(name));
    if (hasDownload && hasShell) return true;
  }
  if (!command.includes("|")) return false;
  const names = command.split("|").map((part) => part.trim().split(/\s+/)[0]?.split("/").pop() ?? "");
  return names.some((name) => DOWNLOADERS.includes(name)) && names.some((name) => SHELLS.has(name));
}

export function layerPolicies(
  layers: { source: "global" | "repo" | "profile"; rules: PolicyRule[]; default?: Effect }[],
): LayeredPolicy {
  const rules: PolicyRule[] = [];
  const defaults: LayeredPolicy["defaults"] = [];
  for (const layer of layers) {
    for (const rule of layer.rules) rules.push({ ...rule, source: layer.source });
    if (layer.default) defaults.push({ source: layer.source, effect: layer.default });
  }
  return { rules, defaults };
}
