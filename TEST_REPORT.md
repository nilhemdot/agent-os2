# Test report

Run on Linux, Node v22.14.0. This pass ran `npx vitest run` and a full `npx vitest run --coverage`. Both finished with 71 passed, 0 failed, 0 skipped. The coverage run included the two-worktree test (AC-F3-1.1, AC-F3-1.2, AC-F3-3.1) and did not hit `ECONNRESET`.

## How to run

```bash
npm test                 # vitest, no network, no API keys
npm run test:coverage    # same suite with the v8 coverage table
npm run test:ui          # Playwright smoke; needs a built web app and `npx playwright install chromium`
```

Vitest uses one worker. A daemon is started in-process on an ephemeral port, except AC-F1-1.1 which binds `127.0.0.1:7787` and then stops it. Runtime tests use `fixtures/fake-runtimes`. They do not spawn real Claude Code or Codex and they do not call a paid API.

## Totals

| Suite | Passed | Failed | Skipped | Not run |
| --- | ---: | ---: | ---: | ---: |
| vitest (`npx vitest run`, repeated under `--coverage`) | 71 | 0 | 0 | 0 |
| Playwright (`npm run test:ui`) | — | — | — | 1 (not re-run; UI unchanged) |
| Live Claude Code checks L1–L9 | 0 | 0 | 0 | 9 |
| Live Codex checks C1–C7 | 0 | 0 | 0 | 7 |
| Live eval of `evals/missions` on real Claude Code | 0 | 0 | 0 | 1 |

Automated tests that ran this pass: **71 passed, 0 failed, 0 skipped**.

Spec acceptance ids: **197**. **172 PASS**, **25 GAP** (no automated test cites the id). None of the automated tests failed. GAP is not a claim that the behavior is missing from the code.

## Coverage

Full `npx vitest run --coverage` (v8), exit 0, from `coverage/coverage-summary.json`:

| | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All files | 82.64% | 75.65% | 91.19% | 82.64% |

4120 of 4985 statements. `apps/daemon/src/control.ts` is 94.34% statements. `packages/adapter-codex/src/index.ts` is 94.64% lines.

The CLI (`apps/cli/src/main.ts`) and the daemon entrypoint (`apps/daemon/src/main.ts`) stay at 0% because those processes are spawned outside the vitest collector. AC-F1-1.1, AC-F1-1.2, AC-F1-1.3, AC-F1-2.3, and AC-F4-4.1 still drive the real CLI. The React UI is not in the v8 number.

## Config defaults

`ui.open_browser_on_start` and `notifications.desktop` default to **true**, matching the spec. After `daemon.ready` is written, the daemon spawns `open` on macOS or `xdg-open` elsewhere, detached, and does not wait for it, so `agentos daemon start` can still exit within 3 seconds. Desktop notifications go out once per approval only when the flag is true, and the notification does not include the command text. In-process tests and the smoke daemon overlay both flags to false so the suite does not depend on a desktop session.

## Acceptance tests

| ID | Status | Test |
| --- | --- | --- |
| AC-F1-1.1 | PASS | tests/acceptance.test.ts |
| AC-F1-1.2 | PASS | tests/acceptance.test.ts |
| AC-F1-1.3 | PASS | tests/acceptance.test.ts |
| AC-F1-1.4 | PASS | tests/gaps.test.ts |
| AC-F1-1.5 | PASS | tests/gaps.test.ts |
| AC-F1-2.1 | PASS | tests/acceptance.test.ts |
| AC-F1-2.2 | PASS | tests/acceptance.test.ts |
| AC-F1-2.3 | PASS | tests/acceptance.test.ts |
| AC-F1-3.1 | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.2 | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.3 | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.4 | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-3.5 | PASS | apps/daemon/src/migrate.test.ts |
| AC-F1-4.1 | PASS | tests/gaps.test.ts |
| AC-F1-4.2 | PASS | tests/acceptance.test.ts |
| AC-F2-1.1 | PASS | tests/acceptance.test.ts |
| AC-F2-1.2 | PASS | tests/acceptance.test.ts |
| AC-F2-1.3 | PASS | tests/acceptance.test.ts |
| AC-F2-1.4 | PASS | tests/acceptance.test.ts |
| AC-F2-2.1 | PASS | tests/acceptance.test.ts |
| AC-F2-2.2 | PASS | tests/acceptance.test.ts |
| AC-F2-2.3 | PASS | tests/gaps.test.ts |
| AC-F2-2.4 | PASS | tests/acceptance.test.ts |
| AC-F2-3.1 | PASS | tests/acceptance.test.ts |
| AC-F2-3.2 | PASS | tests/acceptance.test.ts |
| AC-F2-3.3 | PASS | tests/acceptance.test.ts |
| AC-F2-3.4 | PASS | tests/acceptance.test.ts |
| AC-F2-3.5 | PASS | tests/acceptance.test.ts |
| AC-F2-4.1 | PASS | tests/acceptance.test.ts |
| AC-F2-4.2 | PASS | tests/acceptance.test.ts |
| AC-F2-4.3 | PASS | tests/acceptance.test.ts |
| AC-F2-5.1 | PASS | tests/acceptance.test.ts |
| AC-F2-5.2 | PASS | tests/acceptance.test.ts |
| AC-F2-5.3 | PASS | tests/gaps.test.ts |
| AC-F2-5.4 | PASS | tests/gaps.test.ts |
| AC-F3-1.1 | PASS | tests/acceptance.test.ts |
| AC-F3-1.2 | PASS | tests/acceptance.test.ts |
| AC-F3-1.3 | GAP | no automated test |
| AC-F3-1.4 | PASS | tests/gaps.test.ts |
| AC-F3-1.5 | PASS | tests/gaps.test.ts |
| AC-F3-2.1 | PASS | tests/gaps.test.ts |
| AC-F3-2.2 | PASS | tests/gaps.test.ts |
| AC-F3-2.3 | PASS | tests/gaps.test.ts |
| AC-F3-2.4 | GAP | no automated test |
| AC-F3-3.1 | PASS | tests/acceptance.test.ts |
| AC-F3-3.2 | PASS | tests/gaps.test.ts |
| AC-F3-3.3 | PASS | tests/gaps.test.ts |
| AC-F3-3.4 | PASS | tests/gaps.test.ts |
| AC-F3-3.5 | PASS | tests/gaps.test.ts |
| AC-F3-4.1 | PASS | tests/gaps.test.ts |
| AC-F3-4.2 | PASS | tests/acceptance.test.ts |
| AC-F4-1.1 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-1.2 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-1.3 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.1 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.2 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.3 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.4 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.5 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.6 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-2.7 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.1 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.2 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.3 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.4 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-3.5 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-4.1 | PASS | tests/acceptance.test.ts |
| AC-F4-4.2 | PASS | packages/policy/src/policy.test.ts |
| AC-F4-4.3 | PASS | tests/acceptance.test.ts |
| AC-F4-4.4 | PASS | packages/policy/src/policy.test.ts |
| AC-F5-1.1 | PASS | tests/acceptance.test.ts |
| AC-F5-1.2 | PASS | tests/gaps.test.ts |
| AC-F5-1.3 | PASS | tests/acceptance.test.ts |
| AC-F5-1.4 | GAP | no automated test |
| AC-F5-2.1 | PASS | tests/acceptance.test.ts |
| AC-F5-2.2 | PASS | tests/gaps.test.ts |
| AC-F5-2.3 | PASS | tests/gaps.test.ts |
| AC-F5-2.4 | PASS | tests/gaps.test.ts |
| AC-F5-3.1 | PASS | tests/gaps.test.ts |
| AC-F5-3.2 | PASS | tests/gaps.test.ts |
| AC-F5-3.3 | GAP | no automated test |
| AC-F5-4.1 | PASS | tests/gaps.test.ts |
| AC-F5-4.2 | PASS | tests/gaps.test.ts |
| AC-F5-5.1 | PASS | tests/gaps.test.ts |
| AC-F5-5.2 | PASS | tests/gaps.test.ts |
| AC-F6-1.1 | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F6-1.2 | GAP | no automated test |
| AC-F6-1.3 | PASS | tests/gaps.test.ts |
| AC-F6-1.4 | PASS | tests/gaps.test.ts |
| AC-F6-2.1 | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F6-2.2 | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F6-2.3 | PASS | tests/gaps.test.ts |
| AC-F6-2.4 | GAP | no automated test |
| AC-F6-3.1 | PASS | tests/gaps.test.ts |
| AC-F6-3.2 | PASS | tests/acceptance.test.ts |
| AC-F6-3.3 | PASS | tests/gaps.test.ts |
| AC-F7-1.1 | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F7-1.2 | PASS | tests/gaps.test.ts |
| AC-F7-1.3 | PASS | tests/acceptance.test.ts |
| AC-F7-1.4 | PASS | tests/gaps.test.ts |
| AC-F7-1.5 | PASS | tests/gaps.test.ts |
| AC-F7-2.1 | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F7-2.2 | PASS | tests/gaps.test.ts |
| AC-F7-2.3 | GAP | no automated test |
| AC-F7-2.4 | PASS | tests/gaps.test.ts |
| AC-F7-2.5 | PASS | tests/gaps.test.ts |
| AC-F7-2.6 | PASS | tests/acceptance.test.ts |
| AC-F7-2.7 | GAP | no automated test |
| AC-F7-3.1 | PASS | tests/gaps.test.ts |
| AC-F7-3.2 | GAP | no automated test |
| AC-F7-3.3 | PASS | tests/acceptance.test.ts |
| AC-F7-4.1 | PASS | tests/gaps.test.ts |
| AC-F7-4.2 | PASS | tests/gaps.test.ts |
| AC-F8-1.1 | PASS | tests/gaps.test.ts |
| AC-F8-1.2 | PASS | tests/gaps.test.ts |
| AC-F8-1.3 | PASS | tests/gaps.test.ts |
| AC-F8-2.1 | PASS | tests/gaps.test.ts |
| AC-F8-2.2 | PASS | packages/adapter-api/contract/contract.test.ts |
| AC-F8-2.3 | PASS | tests/gaps.test.ts |
| AC-F8-2.4 | PASS | tests/gaps.test.ts |
| AC-F8-3.1 | PASS | tests/gaps.test.ts |
| AC-F8-3.2 | PASS | tests/gaps.test.ts |
| AC-F9-1.1 | PASS | tests/gaps.test.ts |
| AC-F9-1.2 | PASS | tests/gaps.test.ts |
| AC-F9-1.3 | PASS | tests/gaps.test.ts |
| AC-F9-2.1 | PASS | tests/gaps.test.ts |
| AC-F9-2.2 | PASS | tests/gaps.test.ts |
| AC-F9-2.3 | PASS | tests/gaps.test.ts |
| AC-F9-2.4 | PASS | tests/gaps.test.ts |
| AC-F9-3.1 | PASS | tests/gaps.test.ts |
| AC-F9-3.2 | PASS | tests/gaps.test.ts |
| AC-F10-1.1 | PASS | tests/acceptance.test.ts |
| AC-F10-1.2 | PASS | tests/gaps.test.ts |
| AC-F10-1.3 | PASS | tests/gaps.test.ts |
| AC-F10-1.4 | PASS | tests/gaps.test.ts |
| AC-F10-2.1 | PASS | tests/gaps.test.ts |
| AC-F10-2.2 | PASS | tests/gaps.test.ts |
| AC-F10-2.3 | PASS | tests/gaps.test.ts |
| AC-F10-2.4 | PASS | tests/gaps.test.ts |
| AC-F10-2.5 | PASS | tests/gaps.test.ts |
| AC-F10-2.6 | PASS | tests/acceptance.test.ts |
| AC-F10-3.1 | PASS | tests/gaps.test.ts |
| AC-F10-3.2 | PASS | tests/gaps.test.ts |
| AC-F10-3.3 | PASS | tests/gaps.test.ts |
| AC-F10-4.1 | PASS | tests/gaps.test.ts |
| AC-F11-1.1 | PASS | tests/gaps.test.ts |
| AC-F11-1.2 | PASS | tests/gaps.test.ts |
| AC-F11-1.3 | GAP | no automated test |
| AC-F11-1.4 | PASS | tests/gaps.test.ts |
| AC-F11-1.5 | PASS | tests/gaps.test.ts — The bundled table ships no models (`version: unpriced`), so every shipped entry has `source_url` and `retrieved_on`. The test also loads an override entry and checks those two fields. |
| AC-F11-2.1 | PASS | tests/gaps.test.ts |
| AC-F11-2.2 | GAP | no automated test |
| AC-F11-3.1 | PASS | tests/acceptance.test.ts |
| AC-F11-3.2 | PASS | tests/acceptance.test.ts, tests/gaps.test.ts |
| AC-F11-3.3 | PASS | tests/gaps.test.ts |
| AC-F11-3.4 | PASS | tests/gaps.test.ts |
| AC-F12-1.1 | PASS | tests/gaps.test.ts |
| AC-F12-1.2 | PASS | tests/acceptance.test.ts, tests/gaps.test.ts |
| AC-F12-1.3 | PASS | tests/acceptance.test.ts, tests/gaps.test.ts |
| AC-F12-1.4 | PASS | tests/gaps.test.ts |
| AC-F12-2.1 | PASS | tests/gaps.test.ts |
| AC-F12-2.2 | PASS | tests/gaps.test.ts |
| AC-F12-2.3 | PASS | tests/gaps.test.ts |
| AC-F12-3.1 | GAP | no automated test |
| AC-F13-1.1 | GAP | no automated test |
| AC-F13-1.2 | GAP | no automated test |
| AC-F13-1.3 | GAP | no automated test |
| AC-F13-2.1 | GAP | no automated test |
| AC-F13-2.2 | GAP | no automated test |
| AC-F13-2.3 | GAP | no automated test |
| AC-F13-3.1 | GAP | no automated test |
| AC-F13-3.2 | GAP | no automated test |
| AC-F13-4.1 | GAP | no automated test |
| AC-F13-5.1 | PASS | tests/ui/smoke.spec.ts — Playwright smoke against fake-claude. Not part of the v8 number. Not re-run this pass; the UI was not changed. |
| AC-F13-6.1 | GAP | no automated test |
| AC-F14-1.1 | PASS | tests/gaps.test.ts |
| AC-F14-1.2 | PASS | tests/gaps.test.ts |
| AC-F14-1.3 | PASS | tests/gaps.test.ts |
| AC-F14-1.4 | PASS | tests/gaps.test.ts |
| AC-F14-2.1 | PASS | tests/gaps.test.ts |
| AC-F14-2.2 | PASS | tests/gaps.test.ts |
| AC-F14-2.3 | PASS | tests/gaps.test.ts |
| AC-F14-2.4 | PASS | tests/gaps.test.ts |
| AC-F14-3.1 | PASS | tests/acceptance.test.ts |
| AC-F14-3.2 | PASS | tests/gaps.test.ts |
| AC-F14-3.3 | PASS | tests/gaps.test.ts |
| AC-F14-4.1 | PASS | tests/gaps.test.ts |
| AC-F15-1.1 | PASS | tests/acceptance.test.ts |
| AC-F15-1.2 | PASS | tests/acceptance.test.ts |
| AC-F15-1.3 | PASS | tests/acceptance.test.ts |
| AC-F15-1.4 | PASS | tests/acceptance.test.ts |
| AC-F15-1.5 | PASS | tests/acceptance.test.ts — Document check only. The test asserts CLAUDE.md states phase discipline and the five invariants. It is not a fresh Phase 0 run. |
| AC-F15-1.6 | GAP | no automated test |
| AC-F15-2.1 | PASS | tests/acceptance.test.ts |
| AC-F15-2.2 | PASS | tests/acceptance.test.ts |
| AC-F15-2.3 | GAP | no automated test |
| AC-F15-3.1 | GAP | no automated test |

## Live checks still outstanding

Recorded in `docs/ADAPTERS.md`. All of these are **NOT RUN**:

- Claude Code L1, L2, L3, L4, L5, L6, L7, L8, L9
- Codex C1, C2, C3, C4, C5, C6, C7
- One real-Claude run of the fixture mission and of `evals/missions`

Do not read a fake-runtime pass as a live pass. The fakes implement the shapes the spec assumes.

## Bugs fixed while adding tests

- A clean `git merge-tree --write-tree` prints a tree id. That id was treated as a conflict, so every merge with a file change returned `merge_conflict`. A zero exit is now a clean merge.
- Revealing an approval re-masked the preview, because the list view was passed back through the masker. Reveal now reads the stored preview. Two in-flight gate calls for the same hash share one approval and both receive the decision.
- A zombie (`Z`/`X` in `/proc`) counted as alive, so resume left a finished Claude attempt `running` instead of ingesting its result line.
- The Codex JSONL fallback exited immediately when the scenario said the app server was down, before it could emit a result.
- Evidence export threw when a check label contained a slash (`src/out.txt`). Export names are flattened and de-duplicated.
- Opening a corrupt database threw the raw SQLite error from a later pragma. That path is now `db_corrupt` and names the backup in the data directory.
- A late Codex stdout chunk after the data directory was removed threw `ENOENT` on the test process. Log appends ignore a missing file.
- The two-worktree coverage reset is covered by swallowing child pipe errors, signalling a process group only when the child is its own group leader, closing HTTP connections instead of pooling them, and retrying a reset fetch. The full coverage run completed.

## Known gaps

25 acceptance ids have no automated test. They are the ones marked GAP above. The ones left out on purpose:

- AC-F3-1.3 and AC-F3-2.4. A workspace path that equals the main checkout is already rejected as `path_overlap`, and branch allocation skips names that exist, so `main_checkout_forbidden` and `branch_in_use` are not reached by the current checks.
- AC-F6-2.4. Codex is `escalated`, not `policy_coverage: none`. The ungated fallback test does not start an adapter whose coverage is none.
- AC-F7-2.7 and the live checks. Subagent hooks and real Claude Code / Codex behavior are not faked.
- AC-F11-1.3. A model with tokens and no price row is not what the "no usage" test covers. That test checks a finished attempt with no usage rows, which labels cost `unknown`.
- AC-F13 except AC-F13-5.1. The Mission Control screens beyond the one smoke path have no browser test. Playwright was not re-run this pass.
- AC-F15-1.5 is document-only. AC-F15-1.6, AC-F15-2.3, and AC-F15-3.1 need a PR description, a held-out-eval audit, or a timed fresh-clone run.

The shipped price table is empty (`version: unpriced`). Missing models are cost `unknown`, not `$0.00`. No prices were invented.

Policy is not a sandbox. In-worktree `Write` / `Edit` with no stricter rule is allow (`inside_workspace_edit`).

P2 work is not implemented, other than columns the schema already has room for.
