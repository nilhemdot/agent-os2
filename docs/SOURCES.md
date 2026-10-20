# Sources

Status: **verified** = page fetched and read for the exact claim on the access date. **unverified** = taken from the
build specification or author knowledge, not re-checked. Unverified items must not be shown as fact in UI or README.

## Verified (accessed 2026-10-17)

| Claim used in rules | Source |
|---|---|
| Hook structure: `hooks.<Event>[].hooks[]` with `type` (`command`, `http`, `mcp_tool`, `prompt`, `agent`), `command`, optional `args`; 33 event names listed | https://code.claude.com/docs/en/hooks |
| Command-running settings keys: `apiKeyHelper`, `statusLine`, `awsAuthRefresh`, `awsCredentialExport`, `gcpAuthRefresh`, `otelHeadersHelper`, `fileSuggestion`, `subagentStatusLine`, `hooks` (settings index) | https://code.claude.com/docs/en/settings-reference |
| `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`; `permissions.defaultMode`; `skipDangerousModePermissionPrompt` / `skipAutoPermissionPrompt` are user/local/managed only | https://code.claude.com/docs/en/settings-reference |
| `defaultMode` values `auto` and `bypassPermissions` do not take effect from project or local settings (since v2.1.257) | https://code.claude.com/docs/en/settings |
| Settings precedence and file locations (`.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`) | https://code.claude.com/docs/en/settings |
| `.mcp.json` format (`mcpServers`; `command`/`args`/`env`; `type`, `url`, `headers`, `headersHelper`, `oauth`); `${VAR}` expansion; project servers need approval; committed approvals ignored in untrusted folders | https://code.claude.com/docs/en/mcp |

## Unverified (from the build specification; do not present as fact until checked)

- CVE-2025-59536, CVE-2026-21852, CVE-2026-33068 (Claude Code, Check Point)
- CVE-2026-48124 (Cursor hooks)
- TrustFall (Adversa, May 2026); Datadog Security Labs research (Aug 2026)
- Rules File Backdoor (Pillar, 2025); TrapDoor (May 2026, OSV MAL-2026-4277 / MAL-2026-4282); Mitiga in-the-wild repos
- Keyv-linked npm worm (Aug 2026) using a SessionStart hook and `runOn: folderOpen`
- CVE-2025-6514 (mcp-remote), postmark-mcp incident
- VS Code `runOptions.runOn: "folderOpen"` semantics and the automatic-tasks prompt
- Cursor, Codex, Gemini CLI, Windsurf, Cline file locations and key names (discovery patterns for these are from author knowledge)

Rule `references` fields that point at unverified material (the Pillar blog URL in AG-020/AG-021) are links
to be checked before release.

## Intel data files

`packages/core/src/intel/hosts.ts`: every entry carries `verified`. Webhook/tunnel/paste host classes and the
"well-known MCP package" list are author knowledge (`verified: false`) and only influence severity/confidence, never
create a finding on their own. AG-011 (known-bad packages) is **not implemented**: no entries have been verified.
