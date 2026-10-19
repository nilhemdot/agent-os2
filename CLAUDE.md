# CLAUDE.md — AgentOS builder rules

## What we are building
Local-first control plane above replaceable coding-agent runtimes.
Read docs/PRD.md before large changes.

## Invariants (do not violate)
1. Control plane owns durable truth (SQLite). Transcripts are evidence only.
2. Do not reimplement a full coding agent loop — use adapters.
3. Policy (deny/ask/allow) is deterministic and outside the model.
4. Parallel work requires worktree leases (repo != workspace != branch != task).
5. Verification is an explicit gate (tests/diff/evidence), not a chat claim.

## Stack defaults
- TypeScript monorepo: apps/daemon, apps/web, packages/*
- SQLite/WAL for state
- Vite+React for local UI
- vitest for unit tests

## Working style
- Small PRs mapped to PRD phases
- Prefer extending packages/core before adding features
- When adding an adapter, implement the Adapter interface + contract tests
- Never commit secrets

## Phase discipline
Only implement the phase named in the user prompt. Do not skip ahead to UI canvas or multi-runtime polish during Phase 0-2.
