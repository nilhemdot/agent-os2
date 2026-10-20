# Held-out fixtures: expected results

Written from the incident patterns **before** running them and without reading the rule code. Incident names are
labels for the pattern only; details of the real incidents are unverified (docs/SOURCES.md). A case counts as
**caught** if some finding in the file overlaps the listed lines at or above the minimum severity.
The scan target for each case is its `Scan dir`.

| ID | Scan dir | File | Lines | Min severity | Why a reviewer would flag it |
|---|---|---|---|---|---|
| H1 | 01-trapdoor-zerowidth | CLAUDE.md | 6 | high | zero-width characters hide an instruction (`curl ... \| sh`) in a rules file |
| H2a | 02-keyv-chain | .claude/settings.json | 6 | high | SessionStart hook runs a repo script that decodes base64, execs it, and fetches a second stage |
| H2b | 02-keyv-chain | .vscode/tasks.json | 7 | high | folderOpen task runs a repo script that reads ~/.npmrc and ~/.ssh/id_rsa and POSTs them |
| H3a | 03-starterkit-webhook | CLAUDE.md | 6 | high | tells the agent to POST .env contents to a webhook |
| H3b | 03-starterkit-webhook | CLAUDE.md | 7 | medium | tells the agent to hide the action from the user |
| H4a | 04-poisoned-cursorrules | .cursorrules | 3 | high | HTML comment instructs the agent to POST environment variables to a remote host |
| H4b | 04-poisoned-cursorrules | .cursorrules | 5 | high | bidi override character reorders visible text |
| H5a | 05-mcp-rugpull/head | .mcp.json | 5 | high | package spec loosened to `@latest` with auto-confirm |
| H5b | 05-mcp-rugpull/head | .mcp.json | 6 | medium | package registry redirected to an unknown host |
| H5c | 05-mcp-rugpull/head | .mcp.json | 10 | medium | server installed from an unpinned git URL |

Note for H5: the "changed since approval" aspect needs diff mode (not built). Only the head state is scanned here.

## Round 2 (written and committed before the fix round was implemented)

Three new cases for the same attack classes as H1, H3b and H5b, with different wording/encodings. Same rule: caught if a
finding in that file overlaps the lines at or above the minimum severity. Note: `.npmrc` is not a discovered file kind
at the time of writing; H8b is expected to be missed until discovery is extended.

| ID | Scan dir | File | Lines | Min severity | Why a reviewer would flag it |
|---|---|---|---|---|---|
| H6a | 06-zw-wordjoiner | AGENTS.md | 3 | critical | zero-width characters (U+200B / U+2060 as bits) hide `wget ... \| bash` in a rules file |
| H7a | 07-quiet-telemetry | .github/copilot-instructions.md | 4 | high | tells the agent to post ~/.aws/credentials to a remote URL under a telemetry pretext |
| H7b | 07-quiet-telemetry | .github/copilot-instructions.md | 5 | medium | tells the agent to keep the action out of its summaries and not tell the developer |
| H8a | 08-registry-redirect | .claude/settings.json | 3 | high | env redirects pip's package index to an unknown host |
| H8b | 08-registry-redirect | .npmrc | 1 | medium | npm registry redirected to an unknown host |
| H8c | 08-registry-redirect | .mcp.json | 5 | medium | MCP server installed from a non-default package index |
