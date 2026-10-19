# AgentOS PRD — Local-First Control Plane for Coding Agents

**Version:** 0.1  
**Date:** 2026-09-09  
**Status:** Ready to build in Claude Code  
**Working title:** AgentOS (see Naming note)  
**Primary builder:** Claude Code (hooks, skills, subagents, CLAUDE.md)

---

## 0. One-liner

A local-first Mission Control that sits **above** replaceable agent runtimes (Claude Code, Codex, Hermes, OpenCode, …), owns durable mission/task/workspace/approval state, and proves **control before autonomy**.

---

## 1. Problem

Developers run fleets of coding agents across terminals, IDEs, and clouds. Today they lack:

1. A single truth for what is running, blocked, costing tokens, or waiting on approval
2. Safe parallel work without worktree/repo collisions
3. Runtime-agnostic orchestration (each vendor harness is a silo)
4. Durable evidence (diffs, tests, artifacts) separate from chat transcripts

Chat UIs and single harnesses do not solve fleet operations.

---

## 2. Insight (from your research — validated)

> Agent OS should be a durable, governed **control plane above replaceable agent runtimes** — not another monolithic agent or chat interface.

Product loop:

**Objective → Tasks → Agents → Workspaces → Evidence → Review → Merge**

This matches 2026 market pattern (OpenHands Canvas / ACP, SapienXai AgentOS-on-OpenClaw, nyk Mission Control, AionUi cowork apps) but your wedge is: **multi-runtime adapters + local SQLite truth + Claude Code as first-class builder/runtime**.

---

## 3. Naming & positioning (recommendation)

**Crowding risk:** SapienXai/AgentOS, docs.agentos.sh, and several “Mission Control” dashboards already exist.

**Recommendation:** ship under a distinct product name; keep “AgentOS” as internal codename if you like it.

Suggested public names (pick one):
- **Forge Control** / **Forgeplane**
- **Runtime Deck**
- **Worktree Mission Control**
- **Nilhem Control** (personal brand)

Positioning line:
> “Mission Control for coding agents — adapters for Claude Code, Codex, Hermes, and OpenCode; your laptop is the source of truth.”

Differentiator vs SapienXai AgentOS: they wrap OpenClaw only. You wrap **multiple** lab + OSS runtimes with capability-aware adapters and workspace leases.

---

## 4. Goals / non-goals

### Goals (MVP)
- Local daemon + SQLite/WAL state store
- Mission Control UI answering: running / owner / blocked / diff / tests / cost / approvals
- Adapters: Claude Code (primary), Codex CLI/App Server (secondary)
- Git worktree lease model (repo ≠ workspace ≠ branch ≠ task)
- Approval inbox (deny > ask > allow) outside the model
- Evidence packs: diff, test log, artifact paths, token/cost
- Claude Code project scaffold (CLAUDE.md, skills, hooks, subagents) so you build AgentOS *with* Claude Code

### Non-goals (v1)
- Becoming another coding agent loop (do not reimplement Claude/Codex)
- Distributed K8s / Temporal / multi-tenant SaaS
- Social posting / Instagram integrations
- Auto-evolving harness code (AHE) before evals exist
- Replacing OpenClaw or Hermes gateways wholesale

---

## 5. Users & jobs

| Persona | Job to be done |
|---|---|
| Solo power user | Run 2–5 agents in parallel without losing track |
| Indie hacker | Dispatch a feature mission, review evidence, merge |
| Small team lead (later) | Shared approval policy + audit (post-MVP) |

---

## 6. Competitive landscape (research snapshot)

| Player | Relation to you |
|---|---|
| Claude Code / Codex / Gemini→Antigravity | **Runtimes you adapt**, not competitors |
| OpenCode (~206k★) | Runtime adapter target; client/server lessons |
| OpenHands (~87k★) | Canvas/ACP host pattern — study, don’t clone |
| SapienXai AgentOS | Closest product analogy (OpenClaw-only) — differentiate multi-runtime |
| nyk Mission Control (~6k★) | Fleet dashboard proof of demand |
| Aider / Cline / Goose / Pi / Hermes | Adapter targets or skill inspiration |
| AHE (arxiv:2604.25850) | Later: evolve tools/middleware from traces |

**Verdict:** Idea is solid. Category is real. Win on **multi-runtime control + local durable truth + worktree safety**, not on “yet another agent.”

---

## 7. Product principles

1. Control plane owns truth; transcripts are evidence
2. Authority is external to the model
3. Adapters preserve native strengths (hooks, sandbox, skills)
4. Parallelism requires workspace ownership leases
5. Verification is a DAG node, not a vibe check
6. MVP proves control, not autonomy
7. Build with Claude Code’s 4 layers: CLAUDE.md → Skills → Hooks → Subagents

---

## 8. System architecture

```
┌─────────────────────────────────────────────────────────┐
│ Mission Control UI (web local)                          │
│ topology · inbox · diffs · costs · command palette      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/SSE
┌───────────────────────▼─────────────────────────────────┐
│ Control Plane Daemon                                    │
│ missions · tasks · attempts · workspaces · approvals    │
│ events · budgets · evidence index                       │
│ SQLite/WAL                                              │
└───────┬─────────────┬─────────────┬─────────────────────┘
        │             │             │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │ Adapter │   │ Adapter │   │ Adapter │
   │ Claude  │   │ Codex   │   │ Hermes  │  (+ OpenCode later)
   │ Code    │   │ AppSrv  │   │ / CLI   │
   └────┬────┘   └────┬────┘   └────┬────┘
        │             │             │
   worktrees / sandboxes / native permissions
```

### Core entities
- **Mission** — objective + success criteria + budget
- **Task** — unit of work in a mission DAG
- **Attempt** — one runtime execution of a task
- **Workspace** — leased git worktree (+ path, branch)
- **AgentProfile** — runtime + model + tool allowlist + policy
- **Approval** — pending/denied/allowed exact tool call
- **Evidence** — immutable artifact refs (diff, junit, logs)
- **Event** — normalized timeline (plus raw native envelope)

---

## 9. MVP feature set (must ship)

1. **Daemon** start/stop; health; SQLite migrate
2. **Mission CRUD** + task list
3. **Claude Code adapter** — spawn session in worktree, stream events, capture exit
4. **Codex adapter** — best-effort CLI/App Server spawn (read-only status OK if incomplete)
5. **Worktree manager** — create/lease/release; conflict detection
6. **Approval inbox** — pause attempt on ask/deny policy match
7. **Evidence viewer** — diff + test output attachment
8. **Cost meter** — tokens/USD per attempt (estimate OK)
9. **Mission Control UI** — table + detail panes (canvas can wait)
10. **Claude Code builder harness** in-repo (so future work is self-hosting)

### Explicitly defer
- Topology canvas polish
- Slack/Telegram gateways
- Multi-user RBAC
- AHE self-evolution
- Full Hermes gateway parity

---

## 10. Repo scaffolding (create day 1)

```
agentos/
  CLAUDE.md                 # builder rules for Claude Code
  AGENTS.md                 # cross-harness instructions
  README.md
  docs/
    PRD.md                  # this document
    ARCHITECTURE.md
    ADAPTERS.md
  .claude/
    settings.json           # permissions / hooks wiring
    skills/
      mission-create/SKILL.md
      adapter-scaffold/SKILL.md
      pr-review/SKILL.md
      evidence-pack/SKILL.md
    agents/
      planner.md            # subagent: plan only
      implementer.md        # subagent: code
      verifier.md           # subagent: tests only
    hooks/
      pre-tool-guard.sh     # block secrets / protected paths
      post-edit-format.sh
  apps/
    daemon/                 # control plane API (TS or Python)
    web/                    # Mission Control UI
  packages/
    core/                   # entities, state machine, sqlite
    adapter-api/            # Adapter interface
    adapter-claude-code/
    adapter-codex/
    policy/                 # deny/ask/allow resolver
    evidence/
  fixtures/
    sample-repo/            # tiny repo for e2e
  evals/
    missions/               # held-out mission scripts
  scripts/
    bootstrap.sh
    e2e-smoke.sh
```

### Stack recommendation (Claude Code friendly)
- **TypeScript + Node** for daemon/web (matches Claude Code, OpenCode, Cline ecosystems)
- **SQLite** via `better-sqlite3` or `drizzle` + WAL
- **UI:** Next.js or Vite+React local-only
- **Events:** SSE from daemon to UI
- **Tests:** vitest + one Playwright smoke for UI

Alternative: Python daemon if you prefer Hermes-shaped tooling — but TS is smoother for Claude Code + web.

---

## 11. Claude Code builder workflow

Use Claude Code as the factory that builds AgentOS:

1. Root `CLAUDE.md` encodes architecture invariants (adapters, leases, policy outside model)
2. Skills for repeatable PRD→code steps (`/mission-create`, `/adapter-scaffold`)
3. Hooks fail-closed on secret paths and `rm -rf`
4. Subagents: planner (read-only) → implementer → verifier (tests only)
5. Optional Agent Teams later for parallel package work
6. Every PR must attach evidence pack (tests + diff summary)

---

## 12. Phased roadmap & task list

### Phase 0 — Foundations (days 1–2)
- [ ] Choose public product name
- [ ] `git init`; add CLAUDE.md, AGENTS.md, README
- [ ] Scaffold monorepo (apps/daemon, apps/web, packages/core)
- [ ] SQLite schema v1: missions, tasks, attempts, workspaces, approvals, events, evidence
- [ ] Daemon health endpoint `GET /health`
- [ ] Smoke: insert mission via CLI `agentos mission create`

### Phase 1 — Workspaces & policy (days 3–5)
- [ ] Worktree create/lease/release API
- [ ] Detect lease conflicts (same repo path)
- [ ] Port deny>ask>allow resolver (from starter kit)
- [ ] Approval inbox API + simple UI list
- [ ] Fixture sample-repo with failing/passing tests

### Phase 2 — Claude Code adapter (days 6–10)
- [ ] Adapter interface: `startAttempt`, `cancel`, `streamEvents`, `collectEvidence`
- [ ] Spawn Claude Code in leased worktree with mission prompt file
- [ ] Parse/normalize tool and session events into Event table
- [ ] On ask-policy: pause attempt, create Approval row, resume/deny
- [ ] Capture diff + test command output into Evidence
- [ ] E2E: mission “fix failing test in fixtures/sample-repo” succeeds with approval

### Phase 3 — Mission Control UI (days 8–12, parallel)
- [ ] Missions list + detail
- [ ] Attempt timeline (events)
- [ ] Approval actions
- [ ] Evidence tabs (diff, logs)
- [ ] Cost/token summary
- [ ] Command palette: create mission, approve, cancel

### Phase 4 — Codex adapter (days 13–16)
- [ ] Codex CLI/App Server adapter (status + start + evidence)
- [ ] Capability matrix UI (what each runtime supports)
- [ ] Side-by-side attempt compare (same mission, two runtimes) — stretch

### Phase 5 — Hardening (days 17–21)
- [ ] Stale worker reconciliation (heartbeat)
- [ ] Budget ceiling stops attempts
- [ ] Idempotent task transitions
- [ ] Crash recovery: daemon restart resumes watchers
- [ ] evals/ first 5 held-out missions
- [ ] Docs: ARCHITECTURE.md + ADAPTERS.md
- [ ] Public README + demo GIF/video

### Phase 6 — Later (post-MVP)
- [ ] OpenCode adapter
- [ ] Hermes adapter / cron bridge
- [ ] Topology canvas
- [ ] ACP compatibility (host other agents)
- [ ] AHE-style harness evolution behind eval gates
- [ ] Multi-machine via Tailscale (optional)

---

## 13. Success metrics

| Metric | MVP target |
|---|---|
| Time to first useful mission | < 30 min after clone |
| Parallel attempts without collision | ≥ 2 worktrees same repo |
| Approval precision | 0 silent destructive allows in smoke suite |
| E2E fixture mission pass rate | ≥ 4/5 evals |
| Builder loop | Claude Code can implement a new adapter via skill without breaking schema |

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Name collision / SEO confusion | Distinct public name |
| Adapter churn (vendor CLIs change) | Thin adapters; contract tests; PTY fallback last |
| Scope creep into “build another Claude” | Non-goals; adapter-only rule in CLAUDE.md |
| Token cost while building | Budget ceilings; verifier subagent read-only |
| False sense of security | OS sandbox still required for untrusted tasks |

---

## 15. Recommendations (actionable)

1. **Do not name the GitHub repo `AgentOS` without checking trademark/confusion** — use a unique slug.
2. **Ship Claude Code adapter first** — you are building in it; dogfood the control plane on itself.
3. **Copy OpenHands/ACP ideas for hosting**, but keep SQLite truth yours (your synthesis is right).
4. **Steal OpenCode client/server split** for daemon ↔ UI.
5. **Steal Aider’s git discipline** as a verifier skill (commit hygiene), not as the whole product.
6. **Ignore star races** — OpenCode already won distribution; you win operator control.
7. **Write evals before canvas UI** — ugly UI + solid state machine beats pretty empty dashboard.
8. **Keep Instagram/social out of v1** — research connectors stay in Researcher; AgentOS is coding ops.
9. **Optional:** study SapienXai AgentOS UX for Mission Control patterns; do not fork OpenClaw-only design.
10. **Build order for Claude Code sessions:** schema → worktrees → Claude adapter → inbox → UI → Codex.

---

## 16. Day-1 Claude Code prompt (paste this)

```
Read docs/PRD.md and CLAUDE.md.
Implement Phase 0 only: monorepo scaffold, SQLite schema v1, daemon /health,
and `agentos mission create` CLI.
Do not build UI or adapters yet.
Open a PR with tests for schema migrations.
```

---

## 17. Open questions (decide once, then lock)

1. Public product name?
2. TS vs Python daemon? (default: **TS**)
3. MVP runtimes: Claude-only or Claude+Codex?
4. Local UI framework: Next vs Vite? (default: **Vite+React** for lighter local)
5. License: MIT vs Apache-2.0?

---

## 18. Source appendix (supporting research)

- Your export: `agentos-project-export-2026-08-19` RESEARCH-SYNTHESIS.md
- arxiv:2609.00006 harness autopsy; arxiv:2604.25850 AHE
- anomalyco/opencode, OpenHands/OpenHands, cline/cline, Aider-AI/aider, aaif-goose/goose, google-gemini/gemini-cli
- SapienXai AgentOS / Mission Control; nyk Mission Control (X)
- Substack/Medium field guides; Claude Code 4-layer harness guides
- Prior harness checklist + starter kit in this chat

---

*End of PRD v0.1*
