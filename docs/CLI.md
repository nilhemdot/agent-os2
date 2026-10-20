# Command-line reference

`tripwire` is a read-only, offline scanner for risky AI-agent / MCP configuration. It **flags**; it does not protect or block anything.
It never executes, imports or installs anything from the repository it scans, never makes a network request, and never runs `git`
(history is read by a built-in object reader, so no git hooks, fsmonitor or textconv programs run). The exact interface is frozen in
[CLI_CONTRACT.md](CLI_CONTRACT.md); this page is the user-facing reference.

## Install / run

The CLI is one self-contained file (Node 20+, no `node_modules`):

```
node packages/cli/dist/tripwire.mjs <command> ...        # or copy tripwire.mjs anywhere and run it
pnpm --filter @tripwire/cli build                         # rebuild it from source
```

Examples below write `tripwire` for `node tripwire.mjs`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Clean: nothing at or above `--fail-on`, no drift. Also `--help`, `--version`, and successful `lock`, `baseline create`, `harden`, `hook` |
| 1 | A reported finding is at or above `--fail-on` (default `high`), or any drift (`verify`) |
| 2 | Tool error: bad arguments, unreadable path/lock/baseline, bad revision, refused or failed write |

## Flags

| Flag | Meaning |
|---|---|
| `--sarif <file>` | also write SARIF 2.1.0 (`-` = stdout; the text report then goes to stderr) |
| `--json <file>` | also write the JSON report (`-` = stdout) |
| `--fail-on <sev>` | `critical`, `high` (default), `medium`, `low`, `info`, `none` |
| `--min-confidence <c>` | `low` (default), `medium`, `high`: drop less certain findings first |
| `--baseline <file>` | hide findings accepted in a baseline |
| `--include-user-configs` | also scan `~/.claude/settings.json`, `~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, Claude Desktop config |
| `--no-color` | no colour (also off when not a terminal or `NO_COLOR` is set) |
| `--repo <path>` | repository root (default: the path argument, or `.` for `diff`) |
| `--no-merge-base` | `diff`: compare against `<base>` itself instead of the merge base |
| `--no-repo-config` | ignore repository configuration (`.tripwire.json`, and baselines inside the repository). In `diff` the base revision's config is ignored too |
| `--write`, `--yes` | `harden --write` / `hook install`: write after confirmation; `--yes` confirms non-interactively |

Order of processing: scan → `.tripwire.json` suppressions → `--min-confidence` → `--baseline` → threshold.

## scan

```
tripwire scan .
tripwire scan ../some-repo --fail-on medium --sarif results.sarif
tripwire scan . --json report.json --no-color
tripwire scan . --include-user-configs
```

Prints findings (severity, rule, file:line, evidence) and one summary line, e.g. `3 findings (1 high, 2 medium); 4 suppressed by baseline`.

## diff

What did a branch or pull request introduce or make worse?

```
tripwire diff main HEAD                       # merge base of main and HEAD  →  HEAD
tripwire diff origin/main feature --repo ../repo --sarif diff.sarif
tripwire diff 1a2b3c4d WORKTREE               # a commit against the working tree (uncommitted edits included)
tripwire diff HEAD~1 HEAD --no-merge-base
```

In `diff`, configuration (`.tripwire.json` suppressions and the like) and an in-repository `--baseline` file are read from the **base** revision, never from the head, so a pull request cannot suppress, baseline or disable its own finding. Use `--no-repo-config` to ignore repository configuration entirely.

`<base>`/`<head>` are branches, tags, full or abbreviated SHAs, `HEAD~N`, or `WORKTREE`. Only introduced and worsened findings are reported (all marked
`introducedByChange`); resolved and unchanged counts are in the JSON `diff` block. An unknown revision or a shallow clone missing the commit is exit 2.

## baseline create / --baseline

Accept today's findings, fail only on new ones.

```
tripwire baseline create .                    # writes .tripwire-baseline.json
tripwire scan . --baseline .tripwire-baseline.json      # exit 0 until something NEW appears
```

Findings are matched by stable identity (rule, file, JSON path, normalized evidence); line numbers are ignored, so moving text does not resurrect a finding.
Identical findings are counted: accepting two does not hide a third. A finding whose evidence changed is new. Commit the baseline file so CI uses it.

## lock / verify (drift, AG-012)

```
tripwire lock .                               # writes .tripwire.lock: hashes of MCP server definitions and settings hook commands
tripwire verify .                             # exit 1 if any of them changed, appeared or disappeared since
tripwire verify . --sarif drift.sarif
tripwire verify . --lock-from origin/main     # take the lock from that revision, not from the working tree (use this in pull request checks)
```

`--lock-from <rev>` reads `.tripwire.lock` from `<rev>` (or from the merge base of `<rev>` and HEAD, unless `--no-merge-base`) through the built-in git reader, so a change
that edits a server definition and regenerates the lock in the same pull request still reports drift. If `<rev>` has no lock the command exits 2: a lock that exists only in the change is never trusted.

| Drift | Severity |
|---|---|
| definition changed since locked (rug-pull class) | high |
| added after the lock | medium |
| in the lock but gone | low |

Evidence shows redacted `before:` / `after:` summaries; secret values (env, headers, token arguments) are hashed but never printed or stored.
Re-run `lock` to accept intended changes. Re-ordered identical hooks are not drift.

## harden

```
tripwire harden .                             # prints a recommended settings template and a managed-settings snippet; writes nothing
tripwire harden . --write                     # asks first, then creates .claude/settings.json if (and only if) it does not exist
tripwire harden . --write --yes               # non-interactive confirmation
```

Every key in the template was checked against the current Claude Code documentation (`permissions.deny`, `permissions.disableBypassPermissionsMode`,
`enableAllProjectMcpServers`, `disableSkillShellExecution`, and the managed-only `allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`,
`allowManagedMcpServersOnly`). The `allowedMcpServers` entry format could not be verified and is left empty with a note. Protections written into a repository
are controlled by whoever controls the repository; user or managed settings are stronger places for them.

## hook install | uninstall

```
tripwire hook install .                       # asks first; or add --yes
tripwire hook uninstall .
```

Installs `post-checkout` and `post-merge` git hooks that run `scan` on the repository and print a warning. They never block git (always exit 0) and are never
installed automatically. `install` refuses (exit 2) if a hook of that name exists and was not created by Tripwire, if git configuration sets `core.hooksPath`
(repository config, includes, user or system config), or if the hooks directory or a hook file is a symlink. `uninstall` removes only hooks carrying the Tripwire marker and is safe to run twice.

## JSON output

`--json` writes the shape defined in CLI_CONTRACT.md (`schemaVersion: 1`): `tool`, `command`, `root`, `summary` (`total`, `bySeverity`, `suppressedByBaseline`,
`suppressedByConfig`, `failOn`, `minConfidence`, `failed`), `findings[]` (full core `Finding` objects; `introducedByChange` for `diff`), plus a `diff` block for `diff`
and a `lock` block for `verify` / `lock`. No timestamps and no absolute paths, so output is reproducible.

## Using it in CI (sketch)

```
node tripwire.mjs diff origin/main HEAD --sarif tripwire.sarif --fail-on high      # fail the check when a PR introduces a high finding
node tripwire.mjs verify . --json drift.json                                       # fail when locked MCP servers or hooks changed
```

`diff` takes configuration from the base revision, so a pull request cannot excuse itself. `scan` reads the working tree: for untrusted checkouts add `--no-repo-config`.

## report (findings tied to the commit that added them, with a monthly trend)

```
tripwire report ./repo                                     # tripwire-report.html in the current folder
tripwire report ./api ./web ./infra --format md --out report.md --months 12
tripwire report ./repo --format json --out - --now 2026-10-20T00:00:00Z
```

Offline, read-only: history is read with the built-in git reader (first-parent only; no checkout, no git program, no hooks). One self-contained HTML file with no script and no external resource, or Markdown, or JSON (`docs/report.schema.json`).
Authors and commit subjects are left out unless `--include-authors` / `--include-subjects` are given; secrets, e-mail addresses and absolute paths never appear. An existing output file is not overwritten without `--force`; `--out` must stay inside the current folder.
Exit codes: 0 written, 1 open findings at or above `--fail-on` (default `none` for this command), 2 error. Full flag list and data model: `docs/REPORT_CONTRACT.md`; how attribution and the trend are computed: `docs/ARCHITECTURE.md`; what it does not cover: `docs/LIMITS.md`.

