import type { Finding, Rule, Severity, SourceFile } from "../model/types.js";
import { analyzeCommand, clip, defineRule, finding, INSTRUCTION_KINDS, ZERO_RANGE, type RuleMeta } from "./helpers.js";
import { classifyAllow } from "./settings-rules.js";
import { fmValue, parseFrontmatter, toolEntries, unquote, type FmKey } from "./frontmatter.js";

/**
 * AG-025: skills, subagents and custom commands that request unrestricted capability. Frontmatter keys verified against
 * code.claude.com/docs/en/skills and /sub-agents (accessed 2026-10-18):
 *   skills/commands: allowed-tools (pre-approves tools while the skill runs), hooks, shell, plus !`cmd` / ```! blocks that
 *                    run shell commands when the skill is invoked, before the model sees the content;
 *   subagents:       tools, disallowedTools, permissionMode (bypassPermissions skips prompts), mcpServers, hooks.
 * Unrecognised keys are ignored by Claude Code, so they are ignored here too.
 */
const SKILL_DOCS = "https://code.claude.com/docs/en/skills";
const AGENT_DOCS = "https://code.claude.com/docs/en/sub-agents";

export const M025: RuleMeta = { id: "AG-025", title: "Skill or subagent requests unrestricted tools", category: "permissions", defaultSeverity: "high", references: [SKILL_DOCS, AGENT_DOCS] };

const SKILL_PATH = /^\.claude\/(?:skills\/.+\/SKILL|commands\/.+)\.md$/;
const AGENT_PATH = /^\.claude\/agents\/.+\.md$/;

const INTERPRETERS = new Set(["python", "python3", "node", "bun", "deno", "bash", "sh", "zsh", "ruby", "perl", "php", "tsx"]);
const ANCHORED = /^(?:\$\{?(?:CLAUDE_PROJECT_DIR|CLAUDE_SKILL_DIR)\}?\/|\.\/|\.?[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)/;

/**
 * Bash(<interpreter> <repo-relative path>...): the pre-approval is tied to a script inside the project (python3 .claude/scripts/publish.py*,
 * node .claude/scripts/* *). It still runs repository code without a prompt, so it is reported, but it is narrower than a bare interpreter
 * wildcard (python3 *) or bare Bash, which stay high. Rejects flags (-c, -e), absolute and ~ paths, "..", and wildcard-first paths.
 */
export function pathAnchoredInterpreter(entry: string): boolean {
  const m = /^Bash\(\s*([^)]*?)\s*\)$/.exec(entry);
  if (!m) return false;
  const [interp, target] = m[1]!.split(/\s+/);
  if (!interp || !target || !INTERPRETERS.has(interp.replace(/[\d.]+$/, "")) && !INTERPRETERS.has(interp)) return false;
  const t = target.replace(/(?::\*|\*+)$/, "");
  if (t.startsWith("-") || t.includes("..") || !ANCHORED.test(t)) return false;
  return !/[*?[\]{}]/.test(t.replace(/^\$\{?[A-Z_]+\}?\//, "").split("/")[0]!);
}

const lineRange = (file: SourceFile, line: number) => {
  const text = file.text.split(/\r?\n/)[line] ?? "";
  return { startLine: line, startCol: 0, endLine: line, endCol: text.length };
};

function hookCommands(k: FmKey): { command: string; line: number }[] {
  const out: { command: string; line: number }[] = [];
  k.block.forEach((raw, i) => {
    const m = /^\s*(?:-\s*)?command\s*:\s*(.+?)\s*$/.exec(raw);
    if (m) out.push({ command: m[1]!.replace(/^["']|["']$/g, ""), line: (k.blockLine >= 0 ? k.blockLine : k.line) + i });
  });
  return out;
}

/** Shell commands embedded in a skill body: !`cmd` (at line start or after whitespace) and ```! fenced blocks. */
export function skillShellBlocks(text: string, fromLine: number): { command: string; line: number }[] {
  const out: { command: string; line: number }[] = [];
  const lines = text.split(/\r?\n/);
  let fence: { start: number; buf: string[] } | undefined;
  for (let i = fromLine; i < lines.length; i++) {
    const l = lines[i]!;
    if (fence) {
      if (/^\s*```\s*$/.test(l)) { out.push({ command: fence.buf.join("\n"), line: fence.start }); fence = undefined; } else fence.buf.push(l);
      continue;
    }
    if (/^\s*```!\s*$/.test(l)) { fence = { start: i, buf: [] }; continue; }
    const re = /(?:^|\s)!`([^`\n]{1,1000})`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(l))) out.push({ command: m[1]!, line: i });
  }
  return out;
}

const sevOfAnalysis = (s: Severity): Severity => s;

export const ag025 = defineRule(M025, INSTRUCTION_KINDS, (file) => {
  const isSkill = SKILL_PATH.test(file.path);
  const isAgent = AGENT_PATH.test(file.path);
  if (!isSkill && !isAgent) return [];
  const fm = parseFrontmatter(file.text);
  const out: Finding[] = [];
  const what = isAgent ? "subagent" : "skill";

  if (fm && isSkill) {
    const at = fmValue(fm, "allowed-tools");
    if (at) for (const { entry, line } of toolEntries(at)) {
      const c = entry === "*" ? { sev: "high" as Severity, why: "allows every tool without a prompt", fix: "" } : classifyAllow(entry);
      if (!c || c.sev === "low" || c.sev === "info") continue;
      const anchored = c.sev === "high" && pathAnchoredInterpreter(entry);
      out.push(finding(M025, file, undefined, {
        severity: anchored ? "medium" : c.sev, confidence: "high", range: lineRange(file, line), jsonPath: ["frontmatter", "allowed-tools"], subject: entry,
        title: `${what} pre-approves ${entry}`,
        whyItMatters: `allowed-tools lets the ${what} use these tools without asking while it runs; ${c.why}. Anyone who can edit this file widens what an injected instruction can do.${anchored ? " The pre-approval is limited to a script inside the project, which is narrower than an open interpreter wildcard, but that script (and anything it runs) is repository code that executes without a prompt." : ""}`,
        evidence: `allowed-tools: ${entry}`, fix: "List only the specific commands the skill needs, e.g. Bash(git status *).",
      }));
    }
  }

  if (fm && isAgent) {
    const pm = fmValue(fm, "permissionMode");
    if (pm && unquote(pm.scalar) === "bypassPermissions") {
      out.push(finding(M025, file, undefined, {
        severity: "high", confidence: "medium", range: lineRange(file, pm.line), jsonPath: ["frontmatter", "permissionMode"],
        title: "Subagent sets permissionMode: bypassPermissions",
        whyItMatters: "A subagent in bypassPermissions mode skips permission prompts. Claude Code documents that a subagent inherits a bypass/acceptEdits/auto parent mode instead, and ignores this for plugin agents, so the effect depends on how it is launched, but the file requests no prompts at all.",
        evidence: "permissionMode: bypassPermissions", fix: "Remove permissionMode or use default / plan.",
      }));
    }
    const tools = fmValue(fm, "tools");
    if (tools) for (const { entry, line } of toolEntries(tools)) {
      // plain tool names grant availability (prompts still apply); only wildcard grants are unrestricted
      if (entry !== "*" && !/\(\s*(?:\*{1,2}|:\*)\s*\)$/.test(entry)) continue;
      const c = classifyAllow(entry.replace(/\(\s*/, "(").replace(/\s*\)$/, ")"));
      if (!c || c.sev === "low" || c.sev === "info") continue;
      out.push(finding(M025, file, undefined, {
        severity: c.sev, confidence: "medium", range: lineRange(file, line), jsonPath: ["frontmatter", "tools"], subject: entry,
        title: `Subagent requests ${entry}`, whyItMatters: `The tools list grants ${c.why.replace(/^allows /, "")}.`,
        evidence: `tools: ${entry}`, fix: "List specific tools, and restrict Bash to specific commands.",
      }));
    }
  }

  if (fm) {
    const hooks = fmValue(fm, "hooks");
    if (hooks) for (const h of hookCommands(hooks)) {
      const a = analyzeCommand(h.command);
      if (a.severity === "info" || a.severity === "low") continue;
      out.push(finding(M025, file, undefined, {
        severity: sevOfAnalysis(a.severity), confidence: "medium", range: lineRange(file, h.line), jsonPath: ["frontmatter", "hooks"], subject: clip(h.command, 80),
        title: `${what} registers a risky hook (${a.signals.join(", ")})`,
        whyItMatters: `Hooks declared in a ${what} file run automatically when it is used, with your privileges, from a file the repository controls.`,
        evidence: h.command, fix: "Remove the hook or replace it with a reviewed command that has no network or credential access.",
      }));
    }
  }

  if (isSkill) {
    for (const b of skillShellBlocks(file.text, fm ? fm.endLine + 1 : 0)) {
      const a = analyzeCommand(b.command);
      if (a.severity === "info" || a.severity === "low") continue;
      out.push(finding(M025, file, undefined, {
        severity: sevOfAnalysis(a.severity), confidence: "high", range: lineRange(file, b.line), jsonPath: ["body", "shell-injection"], subject: clip(b.command, 80),
        title: `Skill runs a risky command when invoked (${a.signals.join(", ")})`,
        whyItMatters: "Commands written as !`...` or in a ```! block run when the skill is invoked, before the model (and usually before you) sees the content. This one has risky behaviour.",
        evidence: b.command, fix: "Remove the command or replace it with a reviewed, read-only one. Managed settings can disable these with disableSkillShellExecution.",
      }));
    }
  }
  return out;
});

export const agentRules: Rule[] = [ag025];
void ZERO_RANGE;
