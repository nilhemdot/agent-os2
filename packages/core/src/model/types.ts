export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "high" | "medium" | "low";
export type Category =
  | "execution" | "permissions" | "secrets" | "hidden-text"
  | "exfiltration" | "mcp" | "supply-chain" | "persistence";

/** 0-based lines and UTF-16 columns (matches VS Code). */
export interface Range { startLine: number; startCol: number; endLine: number; endCol: number }

export type FileKind =
  | "claude-settings" | "claude-local-settings" | "mcp-json" | "cursor-mcp" | "vscode-mcp" | "vscode-tasks"
  | "codex-config" | "gemini-settings" | "instruction-md" | "cursor-rule" | "copilot-instructions"
  | "windsurf-rules" | "cline-rules" | "skill-md" | "claude-desktop-config" | "pkg-registry-config" | "unknown";

export interface SourceFile {
  path: string; // repo-relative, posix
  kind: FileKind;
  text: string;
  parsed?: unknown;
  /** Hard failure: nothing usable was parsed, rules are skipped. */
  parseError?: string;
  /** Recoverable syntax problems: rules still run on the partial result. */
  parseWarning?: string;
  /** Map a JSON/TOML path to its source range. */
  locate(jsonPath: (string | number)[]): Range | undefined;
}

export interface TextEdit { range: Range; newText: string }
/**
 * One alternative fix for a finding (a finding's `autofix` array lists alternatives, first = preferred).
 * If `input` is set, the UI must ask the user for a value and substitute it for every `{{input}}` in the edits' newText.
 */
export interface StructuredEdit {
  file: string;
  description: string;
  edits: TextEdit[];
  input?: { id: string; prompt: string; placeholder?: string; pattern?: string; patternHelp?: string };
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  category: Category;
  title: string;
  whyItMatters: string;
  file: string;
  range: Range;
  evidence: string;
  fix: string;
  /** Stable identity component (JSON path or similar) used by the diff engine. */
  jsonPath?: string;
  /** Optional stable discriminator for rules that report several findings on the same path and evidence (e.g. AG-007 "unpinned" vs "auto-confirm"). Part of the finding's identity. */
  subject?: string;
  autofix?: StructuredEdit[];
  references?: string[];
  experimental?: boolean;
  introducedByChange?: boolean;
}

export interface ScannerConfig {
  suppress?: { ruleId: string; file: string; reason: string }[];
  maxFileSizeKb?: number;
  enableExperimentalRules?: boolean;
}

export interface RuleContext {
  files: SourceFile[];
  repoRoot: string;
  config: ScannerConfig;
  /** Repo-relative posix paths tracked by git, if known. */
  trackedFiles?: Set<string>;
  /** Read a repo-relative file as text (never executes it). Used to follow scripts referenced by hooks/tasks/MCP. */
  readFile?: (repoRelPath: string) => string | undefined;
}

export interface Rule {
  id: string;
  title: string;
  category: Category;
  defaultSeverity: Severity;
  appliesTo: FileKind[];
  experimental?: boolean;
  run(file: SourceFile, ctx: RuleContext): Finding[];
}

export const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];
export const sevRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
