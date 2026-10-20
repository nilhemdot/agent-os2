import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT } from "@tripwire/core";

/**
 * Recommended settings for Claude Code. Every key below was checked against the current official documentation on 2026-10-18:
 *   - permissions.deny with Read(...) rules, evaluation order deny > ask > allow       https://code.claude.com/docs/en/permissions
 *   - permissions.disableBypassPermissionsMode: "disable" (works from any scope)         https://code.claude.com/docs/en/permissions
 *   - permissions.defaultMode values auto / bypassPermissions are ignored in project/local settings  https://code.claude.com/docs/en/settings
 *   - enableAllProjectMcpServers, disableSkillShellExecution (any scope)                 https://code.claude.com/docs/en/settings-reference
 *   - allowManagedMcpServersOnly, allowManagedHooksOnly, allowManagedPermissionRulesOnly, allowedMcpServers (managed policy)
 *                                                                                        https://code.claude.com/docs/en/managed-settings
 *   - managed-settings.json locations                                                    https://code.claude.com/docs/en/managed-settings
 * NOT verified: the entry schema of allowedMcpServers and what an empty list means; the template leaves it empty and says so.
 */
export const VERIFIED_KEYS = [
  "permissions", "permissions.deny", "permissions.disableBypassPermissionsMode", "enableAllProjectMcpServers", "disableSkillShellExecution",
  "allowManagedMcpServersOnly", "allowManagedHooksOnly", "allowManagedPermissionRulesOnly", "allowedMcpServers",
] as const;

export const SECRET_DENY_RULES = [
  "Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)", "Read(~/.ssh/**)", "Read(~/.aws/**)", "Read(~/.config/gcloud/**)",
];

export function projectTemplate(): Record<string, unknown> {
  return {
    permissions: { deny: [...SECRET_DENY_RULES], disableBypassPermissionsMode: "disable" },
    enableAllProjectMcpServers: false,
    disableSkillShellExecution: true,
  };
}

export function managedTemplate(): Record<string, unknown> {
  return {
    permissions: { deny: [...SECRET_DENY_RULES], disableBypassPermissionsMode: "disable" },
    enableAllProjectMcpServers: false,
    disableSkillShellExecution: true,
    allowManagedHooksOnly: true,
    allowManagedPermissionRulesOnly: true,
    allowManagedMcpServersOnly: true,
    allowedMcpServers: [],
  };
}

export const MANAGED_PATHS = {
  macOS: "/Library/Application Support/ClaudeCode/managed-settings.json",
  "Linux and WSL": "/etc/claude-code/managed-settings.json",
  Windows: "C:\\Program Files\\ClaudeCode\\managed-settings.json",
};

export const PROJECT_FILE = ".claude/settings.json";

const j = (v: unknown): string => JSON.stringify(v, null, 2);

export function hardenText(): string {
  return [
    "# Recommended settings (flags nothing by itself; nothing was written)",
    "",
    `## 1. Settings file (${PROJECT_FILE}, or ~/.claude/settings.json for all your projects)`,
    j(projectTemplate()),
    "",
    "- permissions.deny blocks the agent's file tools from reading secret paths. Deny rules are checked before ask and allow rules.",
    "- permissions.disableBypassPermissionsMode: \"disable\" stops bypassPermissions from being used (documented to work from any settings file).",
    "- enableAllProjectMcpServers: false keeps every project MCP server behind its own approval.",
    "- disableSkillShellExecution: true stops skills from running their !`command` blocks when invoked.",
    "- Do not set permissions.defaultMode to bypassPermissions or auto: Claude Code ignores those values in project and local settings, and they weaken your own sessions.",
    "- A file inside a repository is written by whoever controls the repository. These settings protect you best in your user settings or in managed settings (section 2).",
    "",
    "## 2. Managed settings snippet (organization-wide; users and projects cannot override it)",
    j(managedTemplate()),
    "",
    ...Object.entries(MANAGED_PATHS).map(([os, p]) => `- ${os}: ${p}`),
    "- allowManagedHooksOnly: only hooks from managed settings run. allowManagedPermissionRulesOnly: only managed allow/ask/deny rules apply. allowManagedMcpServersOnly: only the managed allowedMcpServers list decides which MCP servers load.",
    "- allowedMcpServers is left empty on purpose. Its entry format and the meaning of an empty list were NOT verified by this tool: read https://code.claude.com/docs/en/settings-reference before relying on it.",
    "",
    "## 3. Hooks guidance",
    "- Review every hook command in shared settings the way you review code: it runs with your privileges, without a prompt, from a file the repository controls.",
    "- Prefer allowManagedHooksOnly in managed settings. For a single project, remove hooks you did not write; disableAllHooks turns hooks off for your own sessions.",
    `- Pin MCP servers to exact versions, and run \`${PRODUCT.id} lock\` / \`${PRODUCT.id} verify\` to notice when a server or hook definition changes.`,
    "",
    `To create ${PROJECT_FILE} from section 1: ${PRODUCT.id} harden <path> --write  (asks for confirmation; never overwrites an existing file).`,
  ].join("\n");
}

export type WriteOutcome = { ok: true; file: string } | { ok: false; reason: string };

/** Creates <root>/.claude/settings.json with the project template. Refuses to overwrite, follow symlinks or write outside root. */
export function writeProjectTemplate(root: string): WriteOutcome {
  const dir = join(root, ".claude");
  const file = join(root, PROJECT_FILE);
  try {
    let st = undefined as ReturnType<typeof lstatSync> | undefined;
    try { st = lstatSync(dir); } catch { /* absent */ }
    if (st) {
      if (st.isSymbolicLink()) return { ok: false, reason: ".claude is a symbolic link; refusing to write through it" };
      if (!st.isDirectory()) return { ok: false, reason: ".claude exists and is not a directory" };
    }
    let fst = undefined as ReturnType<typeof lstatSync> | undefined;
    try { fst = lstatSync(file); } catch { /* absent */ }
    if (fst) return { ok: false, reason: `${PROJECT_FILE} already exists; nothing was written. Merge section 1 into it by hand.` };
    if (!st) mkdirSync(dir);
    writeFileSync(file, j(projectTemplate()) + "\n", { flag: "wx" });
    return { ok: true, file: PROJECT_FILE };
  } catch (e) {
    return { ok: false, reason: `cannot write ${PROJECT_FILE}: ${(e as Error).message}` };
  }
}
