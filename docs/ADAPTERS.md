# Adapters

The Claude Code and Codex adapters are written from the spec's interoperability assumptions. Those assumptions are not confirmed against installed products. Milestones 2 and 4 require live checks before the flag names, hook fields, and JSON-RPC methods can be treated as fact.

No live check below was executed. This environment did not call Claude Code, Codex, or any paid API. Adapter tests use `fixtures/fake-runtimes/fake-claude.mjs` and `fixtures/fake-runtimes/fake-codex.mjs`. The daemon refuses to spawn a command whose basename is `claude` or `codex` unless `AGENTOS_ALLOW_LIVE_RUNTIMES=1`.

## Claude Code — L1 to L9

| Check | What the spec asks to confirm on a real install | Status |
| --- | --- | --- |
| L1 | Non-interactive flags: print mode, stream-json with verbose, session id, per-session settings, permission prompts denied, model | NOT RUN |
| L2 | PreToolUse HTTP hook with `onFailure: block` blocks on a stopped daemon, HTTP 500, and timeout | NOT RUN |
| L3 | A hook response held open for 10+ minutes is still honored | NOT RUN |
| L4 | `tool_use_id` in the hook matches the stream-json tool-use id | NOT RUN |
| L5 | Result fields for total cost and token usage, and whether per-message usage is incremental | NOT RUN |
| L6 | Maximum-budget flag stops print mode and how that stop appears in the result | NOT RUN |
| L7 | Per-session `disableAllHooks: false` overrides a repo setting of true | NOT RUN |
| L8 | PreToolUse allow versus Claude Code's own permission rules | NOT RUN |
| L9 | Subagent tool calls hit the same hook and carry `agent_id` / `agent_type` | NOT RUN |

Minimum version assumed by the code: 2.1.295. Fake runs report that version unless `AGENTOS_FAKE_VERSION` is set.

## Codex — C1 to C7

| Check | What the spec asks to confirm on a real install | Status |
| --- | --- | --- |
| C1 | App Server start-up and initialize handshake | NOT RUN |
| C2 | Thread and turn start with a working directory | NOT RUN |
| C3 | Approval request shapes for commands and file changes, and accepted decision values | NOT RUN |
| C4 | Approval-policy setting that prompts the most (assumed name: `untrusted`) | NOT RUN |
| C5 | Interrupt or cancel of a running turn | NOT RUN |
| C6 | Token usage notifications | NOT RUN |
| C7 | Sandbox mode, and whether any non-stdio transport allows reattach | NOT RUN |

Until C1–C7 are run, Codex `policy_coverage` stays `escalated`, cost is estimated or unknown (never shown as `$0.00` when the price is missing), and `reattach_after_daemon_restart` is false. If the app server is unavailable, the daemon falls back to a JSONL mode only when the profile sets `allow_ungated`.

## Live eval

`npm test` runs the five held-out missions under `evals/missions` with fake-claude. A live Claude Code eval of those missions is NOT RUN.
