# AgentOS conversation context
Saved: 2026-09-21
Source: Researcher chat (harness research → PRD)

## Who / prefs
- User GitHub: nilhemdot
- User Reddit: u/nilhemm
- Prefers short, sharp answers
- Builds with Claude Code
- Research sources: X, Reddit, GitHub, Medium, Substack, Scribe, whitepapers (Composio for Reddit/GitHub; native X; web fetch otherwise)
- Instagram Composio still pending as of early setup

## Project one-liner
Local-first Mission Control / control plane **above** replaceable coding-agent runtimes
(Claude Code, Codex, Hermes, OpenCode, …). Owns durable mission/task/workspace/approval
state. Prove **control before autonomy**.

Product loop: Objective → Tasks → Agents → Workspaces → Evidence → Review → Merge

## Naming
- Internal codename: AgentOS
- Public name: pick distinct slug — SapienXai AgentOS and other Mission Controls already exist
- Wedge: multi-runtime adapters + local SQLite truth + worktree leases + Claude Code builder

## Validated research conclusions
1. Harness = model + runtime loop (tools, context, permissions, sessions, sandbox)
2. Peer runtimes: OpenCode (~206k★), Gemini CLI, OpenHands, Cline, Goose, Aider, Pi, Amp, Hermes
3. Meta-layer demand proven (OpenHands Canvas/ACP, SapienXai AgentOS-on-OpenClaw, nyk Mission Control)
4. Papers: arxiv 2609.00006 (11-harness autopsy), 2604.25850 (AHE self-evolving harness)
5. Do not rebuild Claude/Codex; adapt them

## PRD phases (build order)
0. Foundations — monorepo, SQLite schema, daemon /health, mission create CLI
1. Worktrees + deny/ask/allow policy + approval inbox
2. Claude Code adapter (primary) + evidence pack
3. Mission Control UI (list/detail/approvals/costs) — canvas later
4. Codex adapter
5. Hardening — heartbeats, budgets, evals, crash recovery
6. Later — OpenCode/Hermes, ACP host, AHE behind eval gates

## Stack defaults
- TypeScript monorepo: apps/daemon, apps/web, packages/*
- SQLite/WAL
- Vite+React local UI
- vitest (+ Playwright smoke later)
- Claude Code layers: CLAUDE.md → skills → hooks → subagents

## Artifacts already produced
- /workspace/agentos-prd/PRD.md
- /workspace/agentos-prd/CLAUDE.md
- /workspace/agentos-prd/DAY1-PROMPT.md
- /workspace/agentos-prd.tgz
- /workspace/agent-harness-starter.tgz (earlier tool/permission stubs)
- User attach: agentos-project-export-2026-08-19 (research synthesis)

## Day-1 Claude Code paste
Read docs/PRD.md and CLAUDE.md.
Implement Phase 0 only: monorepo scaffold, SQLite schema v1, daemon GET /health,
CLI agentos mission create. No UI/adapters yet. PR with migration tests.

## Open decisions
1. Public product name
2. TS vs Python daemon (default TS)
3. MVP runtimes: Claude-only vs Claude+Codex
4. Next vs Vite (default Vite)
5. License MIT vs Apache-2.0

## Non-goals v1
Another coding agent loop; K8s/Temporal SaaS; social posting; AHE before evals
