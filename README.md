# AgentOS

AgentOS is a local-first control plane for coding-agent runtimes. You write a mission, AgentOS leases a git worktree, and Claude Code or Codex does the editing. The daemon gates every tool call, stores the diff, and runs the repository's own test command. It does not ship an agent loop of its own.

Policy decides allow, ask, or deny. It is not a sandbox. A runtime that never calls the gate is failed closed, and a command AgentOS cannot parse is never allowed.

This tree is an unpublished local build. Do not publish it, cut a release, or push a package until the owner says so.

## Requirements

- Node.js 22 or newer (`node:sqlite` and type stripping)
- git 2.40 or newer
- A checkout you are willing to give an agent. Attempts never run in the main checkout.

## Setup

```bash
npm install
npm run build:web
```

`scripts/bootstrap.sh` does the same checks.

The daemon listens on `127.0.0.1:7787` only. Data lives in `~/.agentos/` unless you set `AGENTOS_HOME`. The first start writes `daemon.token` (mode 0600) and copies the default policy to `$AGENTOS_HOME/policy/global.yaml`.

## Run

```bash
npm run agentos -- daemon start
```

The command prints a one-time URL of the form `http://127.0.0.1:7787/auth?code=...`. Open that URL in a browser on this machine. It sets an HttpOnly cookie, works once, and expires after 60 seconds. A second start prints `already running` and the existing pid. `agentos daemon url` prints a fresh URL while the daemon is up.

```bash
npm run agentos -- health
npm run agentos -- mission create "Add CSV export" --repo "$PWD" --budget 5.00 --criteria "npm test passes"
npm run agentos -- mission start <id>
npm run agentos -- doctor
npm run agentos -- daemon stop
```

`daemon stop` leaves runtime processes running. `daemon stop --kill-attempts` cancels them first.

Live Claude Code and Codex binaries are refused unless you export `AGENTOS_ALLOW_LIVE_RUNTIMES=1`. Tests and the held-out evals use the fakes in `fixtures/fake-runtimes/`. No API key is required for `npm test`.

## Tests

```bash
npm test
npm run test:coverage
npm run test:ui
```

`npm test` is vitest. `npm run test:ui` is the Playwright smoke (AC-F13-5.1) and needs Chromium (`npx playwright install chromium`). See `TEST_REPORT.md` for counts, the acceptance-test map, and the live checks that have not been run.

## Layout

`apps/daemon` is the only database writer. `apps/cli` talks HTTP. `apps/web` is the Mission Control UI. `packages/policy` is the permission resolver. `docs/ARCHITECTURE.md` and `docs/ADAPTERS.md` describe the rest. `CLAUDE.md` is the builder contract: five invariants, and no agent loop in this repo.
