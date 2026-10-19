import { createHash } from "node:crypto";
import type { Effect } from "@agentos/core";

export type { Effect };

export interface PolicyRule {
  id: string;
  effect: Effect;
  match: string[];
  note?: string;
  source: "global" | "repo" | "profile";
  line: number;
}

export interface PolicyDocument {
  version: number;
  default?: Effect;
  rules: PolicyRule[];
  sourceName: string;
}

export interface PolicyProblem {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export class PolicyInvalidError extends Error {
  readonly code = "policy_invalid";
  readonly problems: PolicyProblem[];
  constructor(problems: PolicyProblem[]) {
    super(problems.map((p) => `${p.file}:${p.line} (${p.rule}) ${p.message}`).join("; "));
    this.name = "PolicyInvalidError";
    this.problems = problems;
  }
}

const EFFECTS = new Set(["deny", "ask", "allow"]);

/**
 * Indentation-sensitive parser for the policy subset:
 * version, default, and a rules list of {id, effect, match, note}.
 * No general YAML library — the policy package stays dependency-free.
 */
export function parsePolicy(text: string, file = "policy"): PolicyDocument {
  const problems: PolicyProblem[] = [];
  const lines = text.split(/\r?\n/);
  let version = 1;
  let def: Effect | undefined;
  const rules: PolicyRule[] = [];
  let i = 0;

  const fail = (line: number, rule: string, message: string) => {
    problems.push({ file, line, rule, message });
  };

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    const trimmed = stripComment(raw).trim();
    i++;
    if (!trimmed) continue;
    if (trimmed.startsWith("version:")) {
      version = Number(unquote(trimmed.slice("version:".length).trim()));
      if (version !== 1) fail(lineNo, "version", "only version 1 is supported");
      continue;
    }
    if (trimmed.startsWith("default:")) {
      const value = unquote(trimmed.slice("default:".length).trim());
      if (!EFFECTS.has(value)) fail(lineNo, "default", `default must be deny, ask, or allow`);
      else def = value as Effect;
      continue;
    }
    if (trimmed === "rules:" || trimmed.startsWith("rules:")) {
      const inline = trimmed.slice("rules:".length).trim();
      if (inline === "[]") continue;
      if (inline) fail(lineNo, "rules", "rules must be a list");
      while (i < lines.length) {
        const look = stripComment(lines[i] ?? "");
        if (!look.trim()) {
          i++;
          continue;
        }
        if (!look.startsWith(" ") && !look.startsWith("\t") && !look.trim().startsWith("-")) break;
        if (!look.trim().startsWith("-")) break;
        const ruleLine = i + 1;
        const item = look.trim().replace(/^-+\s?/, "");
        i++;
        const fields = new Map<string, { value: string; line: number }>();
        const match: string[] = [];
        if (item && item !== "") {
          const inline = splitInline(item);
          if (inline) fields.set(inline[0], { value: inline[1], line: ruleLine });
        }
        let collectingMatch = false;
        while (i < lines.length) {
          const innerRaw = lines[i] ?? "";
          const inner = stripComment(innerRaw);
          if (!inner.trim()) {
            i++;
            continue;
          }
          if (/^\s*-\s+id:/.test(inner) || (/^\S/.test(inner) && inner.trim().length > 0)) break;
          const indent = inner.match(/^\s*/)?.[0].length ?? 0;
          const body = inner.trim();
          if (body.startsWith("- ") && indent >= 2 && !body.startsWith("- id:") && collectingMatch) {
            match.push(unquote(body.slice(2).trim()));
            i++;
            continue;
          }
          if (body.startsWith("- ") && collectingMatch) {
            match.push(unquote(body.slice(2).trim()));
            i++;
            continue;
          }
          const kv = splitInline(body);
          if (!kv) {
            fail(i + 1, fields.get("id")?.value ?? "(missing id)", `could not read rule field: ${body}`);
            i++;
            continue;
          }
          if (kv[0] === "match") {
            collectingMatch = true;
            if (kv[1]) {
              for (const part of splitFlowList(kv[1])) match.push(part);
            }
          } else {
            collectingMatch = false;
            fields.set(kv[0], { value: kv[1], line: i + 1 });
          }
          i++;
        }
        const id = fields.get("id")?.value ? unquote(fields.get("id")!.value) : "";
        const effect = fields.get("effect")?.value ? unquote(fields.get("effect")!.value) : "";
        const note = fields.get("note")?.value ? unquote(fields.get("note")!.value) : undefined;
        const ruleName = id || "(missing id)";
        if (!id) fail(ruleLine, ruleName, "rule id is required");
        if (!EFFECTS.has(effect)) fail(fields.get("effect")?.line ?? ruleLine, ruleName, "effect must be deny, ask, or allow");
        if (match.length === 0) fail(ruleLine, ruleName, "rule match list is empty");
        for (const pattern of match) {
          const parsed = describePattern(pattern);
          if (!parsed.ok) fail(ruleLine, ruleName, parsed.error);
        }
        if (id && effect && EFFECTS.has(effect) && match.length) {
          rules.push({
            id,
            effect: effect as Effect,
            match: [...match],
            note,
            source: "global",
            line: ruleLine,
          });
        }
      }
      continue;
    }
    if (trimmed === "modes:" || trimmed.startsWith("modes:")) {
      fail(lineNo, "modes", "modes are not part of AgentOS policy; use a profile overlay");
      while (i < lines.length && (lines[i] ?? "").match(/^\s/)) i++;
      continue;
    }
    fail(lineNo, "document", `unknown policy key: ${trimmed.split(":")[0]}`);
  }

  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) fail(rule.line, rule.id, "duplicate rule id");
    ids.add(rule.id);
  }
  if (problems.length) throw new PolicyInvalidError(problems);
  return { version, default: def, rules, sourceName: file };
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1] ?? ""))) return line.slice(0, i);
  }
  return line;
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return v;
}

function splitInline(body: string): [string, string] | null {
  const idx = body.indexOf(":");
  if (idx <= 0) return null;
  return [body.slice(0, idx).trim(), body.slice(idx + 1).trim()];
}

function splitFlowList(value: string): string[] {
  const v = value.trim();
  if (!v.startsWith("[") || !v.endsWith("]")) return v ? [unquote(v)] : [];
  const inner = v.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((part) => unquote(part.trim())).filter(Boolean);
}

export function describePattern(pattern: string): { ok: true; tool: string; inner: string | null } | { ok: false; error: string } {
  if (!pattern.includes("(")) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(pattern)) {
      return { ok: false, error: `malformed pattern ${pattern}` };
    }
    return { ok: true, tool: pattern, inner: null };
  }
  const open = pattern.indexOf("(");
  if (!pattern.endsWith(")")) return { ok: false, error: `unbalanced parentheses in ${pattern}` };
  const tool = pattern.slice(0, open);
  const inner = pattern.slice(open + 1, -1);
  if (!tool) return { ok: false, error: "empty tool name" };
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tool)) return { ok: false, error: `malformed tool name in ${pattern}` };
  let depth = 0;
  for (const ch of inner) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return { ok: false, error: `unbalanced parentheses in ${pattern}` };
  }
  if (depth !== 0) return { ok: false, error: `unbalanced parentheses in ${pattern}` };
  return { ok: true, tool, inner };
}

export function policyHash(rules: PolicyRule[], defaults: { source: string; effect: Effect }[]): string {
  const body = canonical({
    defaults: [...defaults].sort((a, b) => a.source.localeCompare(b.source)),
    rules: [...rules]
      .map((r) => ({ effect: r.effect, id: r.id, match: [...r.match].sort(), source: r.source }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.source.localeCompare(b.source)),
  });
  return createHash("sha256").update(body).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`)
    .join(",")}}`;
}
