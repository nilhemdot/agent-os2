# Day-1 Claude Code prompt

Copy/paste into Claude Code in a new repo:

---

Read docs/PRD.md and CLAUDE.md.

Implement **Phase 0 only**:
1. Monorepo scaffold (apps/daemon, apps/web stub, packages/core)
2. SQLite schema v1 (missions, tasks, attempts, workspaces, approvals, events, evidence)
3. Daemon `GET /health`
4. CLI: `agentos mission create "smoke"`

Do not build UI or runtime adapters yet.
Add migration tests.
Open a PR summarizing schema decisions.

---
