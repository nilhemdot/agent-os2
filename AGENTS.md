# AGENTS.md

Cross-runtime instructions for AgentOS. The same five invariants in `CLAUDE.md` apply here.

## Invariants

1. The control plane owns durable truth in SQLite. Transcripts are evidence only.
2. Do not reimplement a full coding agent loop. Use adapters.
3. Policy (deny / ask / allow) is deterministic and outside the model.
4. Parallel work requires worktree leases. A repo is not a workspace, a branch, or a task.
5. Verification is an explicit gate (tests, diff, evidence), not a chat claim.

## Stack

TypeScript monorepo (`apps/daemon`, `apps/web`, `packages/*`), SQLite in WAL mode, Vite and React, vitest.

## Working rules

- Small changes mapped to the spec. Do not skip ahead of the phase named in the prompt.
- Policy lives in `packages/policy` and has no I/O.
- The CLI is an HTTP client. It does not open the database.
- Never commit secrets. Never call a paid model API from tests.
- Live Claude Code and Codex checks stay marked NOT RUN until a human runs them.
