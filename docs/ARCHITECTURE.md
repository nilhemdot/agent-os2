# Architecture

AgentOS is a local control plane. It does not contain an agent loop. A mission is a DAG of tasks. Each attempt runs in a leased git worktree, and the runtime (Claude Code or Codex) is a separate process. SQLite is the durable record. Transcripts and diffs are evidence, not the source of truth.

## Processes

- `agentos` (the CLI) is an HTTP client. It never opens the database.
- `agentos daemon` is the single writer. It binds `127.0.0.1` only, default port 7787, and serves both the JSON API and the built UI.
- Runtime processes are detached. A daemon stop does not kill them unless `--kill-attempts` is passed. Claude attempts are reattached from the log file on the next start. Codex attempts are marked lost, because the stdio session cannot be resumed.

## Packages

| Path | Role |
| --- | --- |
| `packages/core` | IDs, money, state machines, secret masking |
| `packages/policy` | Deny / ask / allow resolver. No filesystem access. |
| `packages/adapter-api` | Capability contract shared by runtimes |
| `packages/adapter-claude-code` | Flag set, settings file, stream-json parse |
| `packages/adapter-codex` | JSON-RPC parse and approval replies |
| `packages/evidence` | Content-addressed blobs and `evidence.md` |
| `apps/daemon` | SQLite, worktrees, gate, reconciler, HTTP |
| `apps/cli` | CLI over HTTP |
| `apps/web` | Vite + React Mission Control |

## Policy

Rules come from `policy/global.yaml` in the data directory (seeded from the copy in this repo), plus an optional per-repo file and a profile overlay. Deny wins over ask, ask wins over allow. A missing default is ask. Paths are resolved before they are matched. Shell `*` matches any character, including `/`. Commands that cannot be parsed are never allowed. Policy is not a sandbox: it decides tool calls the runtime actually submits to the gate. A runtime that skips the gate is failed closed (`gate_bypass`).

## What is stored

`~/.agentos/` (or `$AGENTOS_HOME`) holds the database, the bearer token, blobs, attempt logs, and worktrees. Blobs are named by SHA-256. The token and database are mode `0600`. The data directory is mode `0700`.
