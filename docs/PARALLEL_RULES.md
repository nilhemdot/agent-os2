# Parallel work rules (two tracks, one repository)

Two tracks work at the same time in separate git worktrees (`../tripwire-cli` on `feat/cli`, `../tripwire-action` on `feat/action`).
These rules exist so the branches merge without conflicts. The CLI interface both tracks rely on is frozen in `docs/CLI_CONTRACT.md`.

## Ownership map

| Area | Owner |
|---|---|
| `packages/cli/**`, `packages/core/**`, **new** fixture directories, `docs/RULES.md`, `docs/LIMITS.md`, `docs/CLI.md`, `docs/ARCHITECTURE.md`, `DECISIONS.md` | **Track A** (CLI + core) |
| `packages/extension/**`, `.github/**`, `scripts/e2e/**`, `scripts/demo/**`, `README.md`, `docs/DEMO.md`, `docs/DECISIONS-B.md` | **Track B** (extension, GitHub Action, demo) |
| Root configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `product.json`, `.gitignore`, `LICENSE`), `pnpm-lock.yaml`, **existing** `fixtures/**` | **Nobody** (change only by the maintainer, in a separate commit on `master`) |
| `docs/CLI_CONTRACT.md`, `docs/PARALLEL_RULES.md`, `docs/DIFF.md`, `docs/SOURCES.md`, `docs/AUTOFIX_REPORT.md` | Frozen / maintainer. A track that needs a change writes a proposal file (`packages/cli/CONTRACT_CHANGES.md` for Track A, `docs/DECISIONS-B.md` for Track B) and continues with the original |

A file not listed is owned by nobody: do not edit it; ask. A track never edits another track's files, never reformats them, never renames them.

## Dependencies and lockfile

- `pnpm-lock.yaml` and root configs are not touched by either track. A new dependency is added **only to the owning package's `package.json`** and reported to the maintainer, who updates the lockfile once at merge time.
- Prefer no new dependencies. The CLI is bundled into one file, so runtime dependencies are bundled in and must not be required at runtime.
- Nothing in either track may add a publish step (Marketplace, Open VSX, npm) or a network call at scan time.

## Core public API: additive only

Track B consumes `packages/core` through its public exports (`packages/core/src/index.ts`). Track A may **add** exports, optional fields and optional parameters.
Track A must not remove, rename, or change the meaning or type of an existing export, a `Finding`/`ScannerConfig` field, a rule ID, or the default behavior of an existing function.
If Track B needs something from core that does not exist, it writes `NEEDS_CORE: <what and why>` in `docs/DECISIONS-B.md` and works around it; Track A (or the maintainer) adds it later, additively.
Track B never edits `packages/core/**`.

## New rules must not move existing results

A new core rule must produce **zero new findings on every existing fixture** (`fixtures/vulnerable-repo`, `hardened-repo`, `benign-repos/*`, `heldout/*`, `regression/*`) and keep the golden
tests, held-out/regression cases and the survey's high/critical counts unchanged. If it cannot, it ships `experimental: true` (only active with `enableExperimentalRules`) and the
reason is written in `DECISIONS.md`. Existing fixtures are never edited to make a rule pass; new fixtures go in **new directories** (e.g. `fixtures/cli/<name>`, `fixtures/rules/<rule-id>`).

## Test hygiene

- Each track runs only its own suites: Track A runs core + cli; Track B runs extension + action suites. The extension suites launch real editors and must never run in the CLI worktree.
- Temp directories are unique per run (`mkdtemp` under the OS temp dir, never a shared fixed path), so concurrent runs cannot collide.
- Tests never write inside `fixtures/`; they copy to a temp dir first.

## Commits and merging

- Each track commits on its own branch only; commit after each logical task; no force-push, no rebase of shared branches.
- Nothing is merged by a track. The maintainer merges `feat/cli` and `feat/action` into `master`, resolves the lockfile, and re-runs all suites.
- The contract, the stub `packages/cli/dist/tripwire.mjs` and these rules are on `master` **before** the worktrees are created, so both branches start from them.
- The Action (Track B) calls `node packages/cli/dist/tripwire.mjs` exactly as in the contract; against the stub it must already work (valid empty JSON/SARIF, exit 0).
