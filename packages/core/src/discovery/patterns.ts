import type { FileKind } from "../model/types.js";

/** Single data table: which repo-relative posix paths are agent-config files. First match wins. */
export const FILE_PATTERNS: { re: RegExp; kind: FileKind }[] = [
  { re: /^\.claude\/settings\.local\.json$/, kind: "claude-local-settings" },
  { re: /^\.claude\/settings\.json$/, kind: "claude-settings" },
  { re: /^\.claude\/skills\/.+\/SKILL\.md$/, kind: "skill-md" },
  { re: /^\.claude\/(agents|commands)\/.+\.md$/, kind: "instruction-md" },
  { re: /(^|\/)\.mcp\.json$/, kind: "mcp-json" },
  { re: /^\.cursor\/mcp\.json$/, kind: "cursor-mcp" },
  { re: /^\.github\/mcp\.json$/, kind: "mcp-json" },
  { re: /^\.vscode\/mcp\.json$/, kind: "vscode-mcp" },
  { re: /^\.vscode\/tasks\.json$/, kind: "vscode-tasks" },
  { re: /^\.codex\/config\.toml$/, kind: "codex-config" },
  { re: /^\.gemini\/settings\.json$/, kind: "gemini-settings" },
  { re: /(^|\/)(CLAUDE|CLAUDE\.local|AGENTS|GEMINI)\.md$/, kind: "instruction-md" },
  { re: /^\.cursorrules$/, kind: "cursor-rule" },
  { re: /^\.cursor\/rules\/.+\.mdc?$/, kind: "cursor-rule" },
  { re: /^\.github\/copilot-instructions\.md$/, kind: "copilot-instructions" },
  { re: /^\.github\/instructions\/.+/, kind: "copilot-instructions" },
  { re: /^\.windsurfrules$/, kind: "windsurf-rules" },
  { re: /^\.windsurf\/rules\/.+/, kind: "windsurf-rules" },
  { re: /^\.clinerules$/, kind: "cline-rules" },
  { re: /^\.clinerules\/.+/, kind: "cline-rules" },
  { re: /(?:^|\/)(?:\.npmrc|\.yarnrc\.yml|pip\.conf|uv\.toml)$/, kind: "pkg-registry-config" },
];

export function classifyPath(path: string): FileKind | undefined {
  for (const p of FILE_PATTERNS) if (p.re.test(path)) return p.kind;
  return undefined;
}

export const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".venv", "venv", "target", ".next"]);
