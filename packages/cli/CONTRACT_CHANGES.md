# Contract changes

## Applied 2026-10-18: repository configuration cannot excuse the change under review

Proposed in the first CLI round (a pull request could add `.tripwire.json` suppressing its own finding) and applied after review, extended as requested:

- `diff` reads `.tripwire.json` (legacy `.agentgate.json`) and every key in it from the **base revision**, and reads an in-repository `--baseline` file from the base revision too (absent there = no baseline applied, with a note). Thresholds exist only as flags.
- `--no-repo-config` (all commands) ignores repository configuration and in-repository baselines; in `diff` it also ignores the base configuration.
- `scan` still reads the working tree.
- Documented in `docs/CLI_CONTRACT.md` (section *diff*, flag table, order of processing), `docs/CLI.md`, `docs/LIMITS.md` and `DECISIONS.md` (73).

Known gap, documented rather than fixed: `verify` trusts the lock in the working tree.

## Open

- `docs/PARALLEL_RULES.md` said `main`; corrected to `master` (the repository's integration branch).
