# Test report

Run on Linux, Node v22.14.0, from a clean `npm test` and `npm run test:ui` after the web app was built.

## How to run

```bash
npm test                 # vitest, no network, no API keys
npm run test:coverage    # same suite with the v8 coverage table
npm run test:ui          # Playwright smoke; needs `npx playwright install chromium`
```

Vitest uses one worker. A daemon is started in-process on an ephemeral port, except AC-F1-1.1 which binds `127.0.0.1:7787` and then stops it. Runtime tests use `fixtures/fake-runtimes`. They do not spawn real Claude Code or Codex and they do not call a paid API.

## Totals

| Suite | Passed | Failed | Skipped | Not run |
| --- | ---: | ---: | ---: | ---: |
| vitest (`npm test`) | 54 | 0 | 0 | 0 |
| Playwright (`npm run test:ui`) | 1 | 0 | 0 | 0 |
| Live Claude Code checks L1–L9 | 0 | 0 | 0 | 9 |
| Live Codex checks C1–C7 | 0 | 0 | 0 | 7 |
| Live eval of `evals/missions` on real Claude Code | 0 | 0 | 0 | 1 |

Automated tests that ran: **55 passed, 0 failed, 0 skipped**.

Spec acceptance ids: **197**. **80 PASS**, **117 GAP** (no automated test). None of the automated tests failed. GAP is not a claim that the behavior is implemented.

## Coverage

One full `npm run test:coverage` run completed with v8 totals of statements **70.69%**, branches **66%**, functions **81.81%**, lines **70.69%**.

Two later full coverage runs failed AC-F3-1.1 with `fetch` `ECONNRESET` while the collector was attached. That test passes in `npm test` and when run alone with coverage. `coverage/coverage-summary.json` was overwritten by a single-test coverage run after that, so the file on disk is not the full-suite figure above.

The CLI (`apps/cli/src/main.ts`) and the daemon entrypoint (`apps/daemon/src/main.ts`) show 0% in those reports because those processes are spawned outside the vitest collector. AC-F1-1.1, AC-F1-1.2, AC-F1-1.3, AC-F1-2.3, and AC-F4-4.1 still drive the real CLI. The React UI is not in the v8 number; AC-F13-5.1 covers one browser path.

## Acceptance tests

| ID | User story | Status | Test |
| --- | --- | --- | --- |
| AC-F1-1.1 |  | PASS | tests/acceptance.test.ts |
| AC-F1-1.2 |  | PASS | tests/acceptance.test.ts |
| AC-F1-1.3 |  | PASS | tests/acceptance.test.ts |
| AC-F1-1.4 |  | GAP | no automated test |
| AC-F1-1.5 |  | GAP | no automated test |
| AC-F1-2.1 |  | PASS | tests/acceptance.test.ts |
| AC-F1-2.2 |  | PASS | tests/acceptance.test.ts |
| AC-F1-2.3 |  | PASS | tests/acceptance.test.ts |
| AC-F1-3.1 |  | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.2 |  | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.3 |  | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.4 |  | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.5 |  | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-4.1 |  | GAP | no automated test |
| AC-F1-4.2 |  | PASS | tests/acceptance.test.ts |
| AC-F2-1.1 |  | PASS | tests/acceptance.test.ts |
| AC-F2-1.2 |  | PASS | tests/acceptance.test.ts |
| AC-F2-1.3 |  | PASS | tests/acceptance.test.ts |
| AC-F2-1.4 |  | PASS | tests/acceptance.test.ts |
| AC-F2-2.1 |  | PASS | tests/acceptance.test.ts |
| AC-F2-2.2 |  | PASS | tests/acceptance.test.ts |
| AC-F2-2.3 |  | GAP | no automated test |
| AC-F2-2.4 |  | PASS | tests/acceptance.test.ts |
| AC-F2-3.1 |  | PASS | tests/acceptance.test.ts |
| AC-F2-3.2 |  | PASS | tests/acceptance.test.ts |
| AC-F2-3.3 |  | PASS | tests/acceptance.test.ts |
| AC-F2-3.4 |  | PASS | tests/acceptance.test.ts |
| AC-F2-3.5 |  | PASS | tests/acceptance.test.ts |
| AC-F2-4.1 |  | PASS | tests/acceptance.test.ts |
| AC-F2-4.2 |  | PASS | tests/acceptance.test.ts |
| AC-F2-4.3 |  | PASS | tests/acceptance.test.ts |
| AC-F2-5.1 |  | PASS | tests/acceptance.test.ts |
| AC-F2-5.2 |  | PASS | tests/acceptance.test.ts |
| AC-F2-5.3 |  | GAP | no automated test |
| AC-F2-5.4 |  | GAP | no automated test |
| AC-F3-1.1 |  | PASS | tests/acceptance.test.ts |
| AC-F3-1.2 |  | PASS | tests/acceptance.test.ts |
| AC-F3-1.3 |  | GAP | no automated test |
| AC-F3-1.4 |  | GAP | no automated test |
| AC-F3-1.5 |  | GAP | no automated test |
| AC-F3-2.1 |  | GAP | no automated test |
| AC-F3-2.2 |  | GAP | no automated test |
| AC-F3-2.3 |  | GAP | no automated test |
| AC-F3-2.4 |  | GAP | no automated test |
| AC-F3-3.1 |  | PASS | tests/acceptance.test.ts |
| AC-F3-3.2 |  | GAP | no automated test |
| AC-F3-3.3 |  | GAP | no automated test |
| AC-F3-3.4 |  | GAP | no automated test |
| AC-F3-3.5 |  | GAP | no automated test |
| AC-F3-4.1 |  | GAP | no automated test |
| AC-F3-4.2 |  | PASS | tests/acceptance.test.ts |
| AC-F4-1.1 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-1.2 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-1.3 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.1 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.2 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.3 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.4 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.5 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.6 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.7 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.1 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.2 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.3 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.4 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.5 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-4.1 |  | PASS | tests/acceptance.test.ts |
| AC-F4-4.2 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F4-4.3 |  | PASS | tests/acceptance.test.ts |
| AC-F4-4.4 |  | PASS | packages/policy/src/policy.test.ts |
| AC-F5-1.1 |  | PASS | tests/acceptance.test.ts |
| AC-F5-1.2 |  | GAP | no automated test |
| AC-F5-1.3 |  | PASS | tests/acceptance.test.ts |
| AC-F5-1.4 |  | GAP | no automated test |
| AC-F5-2.1 |  | PASS | tests/acceptance.test.ts |
| AC-F5-2.2 |  | GAP | no automated test |
| AC-F5-2.3 |  | GAP | no automated test |
| AC-F5-2.4 |  | GAP | no automated test |
| AC-F5-3.1 |  | GAP | no automated test |
| AC-F5-3.2 |  | GAP | no automated test |
| AC-F5-3.3 |  | GAP | no automated test |
| AC-F5-4.1 |  | GAP | no automated test |
| AC-F5-4.2 |  | GAP | no automated test |
| AC-F5-5.1 |  | GAP | no automated test |
| AC-F5-5.2 |  | GAP | no automated test |
| AC-F6-1.1 |  | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F6-1.2 |  | GAP | no automated test |
| AC-F6-1.3 |  | GAP | no automated test |
| AC-F6-1.4 |  | GAP | no automated test |
| AC-F6-2.1 |  | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F6-2.2 |  | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F6-2.3 |  | GAP | no automated test |
| AC-F6-2.4 |  | GAP | no automated test |
| AC-F6-3.1 |  | GAP | no automated test |
| AC-F6-3.2 |  | PASS | tests/acceptance.test.ts |
| AC-F6-3.3 |  | GAP | no automated test |
| AC-F7-1.1 |  | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F7-1.2 |  | GAP | no automated test |
| AC-F7-1.3 |  | PASS | tests/acceptance.test.ts |
| AC-F7-1.4 |  | GAP | no automated test |
| AC-F7-1.5 |  | GAP | no automated test |
| AC-F7-2.1 |  | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F7-2.2 |  | GAP | no automated test |
| AC-F7-2.3 |  | GAP | no automated test |
| AC-F7-2.4 |  | GAP | no automated test |
| AC-F7-2.5 |  | GAP | no automated test |
| AC-F7-2.6 |  | PASS | tests/acceptance.test.ts |
| AC-F7-2.7 |  | GAP | no automated test |
| AC-F7-3.1 |  | GAP | no automated test |
| AC-F7-3.2 |  | GAP | no automated test |
| AC-F7-3.3 |  | PASS | tests/acceptance.test.ts |
| AC-F7-4.1 |  | GAP | no automated test |
| AC-F7-4.2 |  | GAP | no automated test |
| AC-F8-1.1 |  | GAP | no automated test |
| AC-F8-1.2 |  | GAP | no automated test |
| AC-F8-1.3 |  | GAP | no automated test |
| AC-F8-2.1 |  | GAP | no automated test |
| AC-F8-2.2 |  | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F8-2.3 |  | GAP | no automated test |
| AC-F8-2.4 |  | GAP | no automated test |
| AC-F8-3.1 |  | GAP | no automated test |
| AC-F8-3.2 |  | GAP | no automated test |
| AC-F9-1.1 |  | GAP | no automated test |
| AC-F9-1.2 |  | GAP | no automated test |
| AC-F9-1.3 |  | GAP | no automated test |
| AC-F9-2.1 |  | GAP | no automated test |
| AC-F9-2.2 |  | GAP | no automated test |
| AC-F9-2.3 |  | GAP | no automated test |
| AC-F9-2.4 |  | GAP | no automated test |
| AC-F9-3.1 |  | GAP | no automated test |
| AC-F9-3.2 |  | GAP | no automated test |
| AC-F10-1.1 |  | PASS | tests/acceptance.test.ts |
| AC-F10-1.2 |  | GAP | no automated test |
| AC-F10-1.3 |  | GAP | no automated test |
| AC-F10-1.4 |  | GAP | no automated test |
| AC-F10-2.1 |  | GAP | no automated test |
| AC-F10-2.2 |  | GAP | no automated test |
| AC-F10-2.3 |  | GAP | no automated test |
| AC-F10-2.4 |  | GAP | no automated test |
| AC-F10-2.5 |  | GAP | no automated test |
| AC-F10-2.6 |  | PASS | tests/acceptance.test.ts |
| AC-F10-3.1 |  | GAP | no automated test |
| AC-F10-3.2 |  | GAP | no automated test |
| AC-F10-3.3 |  | GAP | no automated test |
| AC-F10-4.1 |  | GAP | no automated test |
| AC-F11-1.1 |  | GAP | no automated test |
| AC-F11-1.2 |  | GAP | no automated test |
| AC-F11-1.3 |  | GAP | no automated test |
| AC-F11-1.4 |  | GAP | no automated test |
| AC-F11-1.5 |  | GAP | no automated test |
| AC-F11-2.1 |  | GAP | no automated test |
| AC-F11-2.2 |  | GAP | no automated test |
| AC-F11-3.1 |  | PASS | tests/acceptance.test.ts |
| AC-F11-3.2 |  | PASS | tests/acceptance.test.ts |
| AC-F11-3.3 |  | GAP | no automated test |
| AC-F11-3.4 |  | GAP | no automated test |
| AC-F12-1.1 |  | GAP | no automated test |
| AC-F12-1.2 |  | PASS | tests/acceptance.test.ts |
| AC-F12-1.3 |  | PASS | tests/acceptance.test.ts — Reject is asserted loosely: accepted, rejected, already_decided, or invalid_transition all satisfy the test. |
| AC-F12-1.4 |  | GAP | no automated test |
| AC-F12-2.1 |  | GAP | no automated test |
| AC-F12-2.2 |  | GAP | no automated test |
| AC-F12-2.3 |  | GAP | no automated test |
| AC-F12-3.1 |  | GAP | no automated test |
| AC-F13-1.1 |  | GAP | no automated test |
| AC-F13-1.2 |  | GAP | no automated test |
| AC-F13-1.3 |  | GAP | no automated test |
| AC-F13-2.1 |  | GAP | no automated test |
| AC-F13-2.2 |  | GAP | no automated test |
| AC-F13-2.3 |  | GAP | no automated test |
| AC-F13-3.1 |  | GAP | no automated test |
| AC-F13-3.2 |  | GAP | no automated test |
| AC-F13-4.1 |  | GAP | no automated test |
| AC-F13-5.1 |  | PASS | tests/ui/smoke.spec.ts — Playwright smoke against fake-claude. Passed in this run. Not part of the v8 coverage number. |
| AC-F13-6.1 |  | GAP | no automated test |
| AC-F14-1.1 |  | GAP | no automated test |
| AC-F14-1.2 |  | GAP | no automated test |
| AC-F14-1.3 |  | GAP | no automated test |
| AC-F14-1.4 |  | GAP | no automated test |
| AC-F14-2.1 |  | GAP | no automated test |
| AC-F14-2.2 |  | GAP | no automated test |
| AC-F14-2.3 |  | GAP | no automated test |
| AC-F14-2.4 |  | GAP | no automated test |
| AC-F14-3.1 |  | PASS | tests/acceptance.test.ts |
| AC-F14-3.2 |  | GAP | no automated test |
| AC-F14-3.3 |  | GAP | no automated test |
| AC-F14-4.1 |  | GAP | no automated test |
| AC-F15-1.1 |  | PASS | tests/acceptance.test.ts |
| AC-F15-1.2 |  | PASS | tests/acceptance.test.ts |
| AC-F15-1.3 |  | PASS | tests/acceptance.test.ts |
| AC-F15-1.4 |  | PASS | tests/acceptance.test.ts |
| AC-F15-1.5 |  | PASS | tests/acceptance.test.ts — Document check only. The test asserts CLAUDE.md states phase discipline and the five invariants. It is not a fresh Phase 0 run. |
| AC-F15-1.6 |  | GAP | no automated test |
| AC-F15-2.1 |  | PASS | tests/acceptance.test.ts |
| AC-F15-2.2 |  | PASS | tests/acceptance.test.ts |
| AC-F15-2.3 |  | GAP | no automated test |
| AC-F15-3.1 |  | GAP | no automated test |

## Live checks still outstanding

Recorded in `docs/ADAPTERS.md`. All of these are **NOT RUN**:

- Claude Code L1, L2, L3, L4, L5, L6, L7, L8, L9
- Codex C1, C2, C3, C4, C5, C6, C7
- One real-Claude run of the fixture mission and of `evals/missions`

Do not read a fake-runtime pass as a live pass. The fakes implement the shapes the spec assumes.

## Known gaps

- 117 acceptance ids have no automated test. The largest untested P0 areas are the Codex end-to-end path (F8), the SSE resume and resync rules (F9), evidence export and `evidence.md` contents (F10-3, F10-4), cost display edge cases (F11-1, F11-2), local merge (F12-2, P1), daemon stop / reattach (F1-1.4, F1-1.5, F14-2), and the running-attempt queue (F14-4). Several of those paths exist in `apps/daemon/src/control.ts` and are only lightly exercised.
- Codex adapter line coverage is 47%. Contract tests check capability flags and that decisions are never `acceptForSession`. A fake JSON-RPC session is not driven through a full mission in the suite.
- The shipped price table is empty (`version: unpriced`). Missing models are cost `unknown`, not `$0.00`. No prices were invented.
- `ui.open_browser_on_start` and `notifications.desktop` default to **false** in code. The spec's proposed defaults are true. Nothing in the daemon launches a browser. Desktop notifications are sent only when the flag is true and an approval is created.
- AC-F15-1.5 does not re-execute Phase 0. It checks that `CLAUDE.md` still states the rule.
- Policy is not a sandbox. In-worktree `Write` / `Edit` with no stricter rule is allow (`inside_workspace_edit`), which is the approval-fatigue behavior called out as R-9.
- P2 work is not implemented, other than columns the schema already has room for (notes, review fields, capability flags).
