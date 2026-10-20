# CLI contract (v1) — FROZEN

**Status: frozen.** Track A implements this; Track B (GitHub Action, extension, demo) depends on it. Do not change it in a feature branch.
If the contract is wrong, write the proposed change to `packages/cli/CONTRACT_CHANGES.md` and keep implementing the original; the maintainer decides.
Only additive changes (new optional flags, new JSON fields) are allowed after freeze, and only through the maintainer.

The CLI is a thin shell over `packages/core`. It is **read-only and offline**: it never executes, imports or installs anything from the scanned
repository, never makes a network request, and never runs `git` (history is read by core's own object reader, so no git hooks, fsmonitor or textconv run).
Detection is rule code, not an LLM. Wording everywhere: findings are *flagged*; the tool does not protect or block anything.

## Artifact

One self-contained file: `packages/cli/dist/tripwire.mjs` (esbuild bundle, Node >= 20, **no node_modules at runtime**, no network, no postinstall).
It must run as `node packages/cli/dist/tripwire.mjs <command> ...` from any directory. The file has a `#!/usr/bin/env node` first line.
Until the real CLI lands, the same path holds a stub that follows this contract and always reports zero findings with exit 0.

## Commands

```
tripwire scan <path>                  scan a directory
tripwire diff <base> <head>           what did <head> introduce or make worse relative to <base>
tripwire lock <path>                  write .tripwire.lock (hashes of MCP server definitions and hook commands)
tripwire verify <path>                report drift against the lock
tripwire baseline create <path>       accept current findings; write .tripwire-baseline.json
tripwire harden <path>                print a recommended safe settings template (writes only with --write and confirmation)
tripwire hook install|uninstall       user-run git post-checkout/post-merge hook that runs `scan` (never installed automatically)
tripwire --version | --help
```

`<path>` is a directory (default `.` when omitted). The repository root for config, git, lock and baseline lookup is `<path>`, or `--repo <path>` when given.
A file path is an error (exit 2).

### scan

Discovers agent-config files under `<path>` (same discovery as the extension), follows referenced scripts as text, applies rules and `.tripwire.json`
suppressions (reason required; legacy `.agentgate.json` is read with a deprecation note on stderr when the new file is absent), then filters and reports.

### diff

`<base>` and `<head>` are git revisions (branch, tag, full or abbreviated SHA, `HEAD~N`, `rev^N`), resolved by core's reader inside the repository at `--repo` (default `.`).
`<head>` may also be the literal `WORKTREE` (the working tree on disk, the default meaning of "the current state"). By default `<base>` is replaced by
`merge-base(<base>, <head>)`; `--no-merge-base` compares against `<base>` itself. Reports only what the change **introduced or worsened**
(`findings` = introduced + worsened, each with `introducedByChange: true`); resolved/unchanged are counted in `summary.diff`. `--include-user-configs` is ignored for `diff`.
Unknown revision, missing object (shallow/partial clone) or not-a-repository is exit **2** with a one-line message on stderr.

**Trust rule (amended 2026-10-18).** In `diff`, nothing that can weaken the check is read from the head tree. The configuration file (`.tripwire.json`,
or the legacy `.agentgate.json` when the current name is absent) is read from the **base revision** (the merge base unless `--no-merge-base`), with every
key in it (suppressions, size cap, `enableExperimentalRules`, and any key added later). A `--baseline <file>` that lies inside the repository is read from
the same base revision (if it does not exist there, no baseline is applied and a note says so); a baseline outside the repository is the operator's own
file and is read from disk. The threshold (`--fail-on`) and `--min-confidence` exist only as flags: no repository file can set them. A pull request therefore
cannot suppress, baseline, disable or relax the finding it introduces. `--no-repo-config` additionally ignores the base configuration and in-repository
baselines. `scan` is unchanged: it reads the working tree, because the person running it owns that checkout (use `--no-repo-config` for untrusted trees).
`verify` reads the lock from the working tree (a change that edits the lock and the definition together passes `verify`; protect the lock with review or CODEOWNERS).

### lock / verify

`lock` writes `<repo>/.tripwire.lock` (see *Lock file*). It overwrites an existing lock (the command is the explicit request) and prints what changed.
`verify` re-reads the repository and reports **drift** as findings with rule `AG-012`:

| Drift | Severity | Confidence |
|---|---|---|
| a locked MCP server or hook command whose definition hash changed (rug-pull class) | high | high |
| an MCP server or hook command not in the lock (added) | medium | high |
| a locked entry that no longer exists (removed) | low | high |

Evidence is `before: <redacted summary> | after: <redacted summary>`; secret-looking values are never printed. Any drift => exit 1 regardless of `--fail-on`.
A missing or unreadable lock is exit 2.

### baseline create

Scans, then writes `<repo>/.tripwire-baseline.json` accepting every current finding (after `--min-confidence`). Overwrites an existing baseline (explicit command).
Later runs with `--baseline <file>` suppress findings whose **stable identity** is in the file and fail only on new ones. Identity is core's `identityKey`
(`ruleId + file + stable JSON path (array indices dropped) + subject + whitespace-normalized evidence`); line numbers are never part of it. Identical findings are
counted (multiset): a baseline that accepted two does not hide a third.

### harden

Prints a recommended settings/permissions template to stdout (deny rules for secret paths, no bypass default mode, an MCP allow-list skeleton, hook guidance) and a
managed-settings snippet, every key verified against current Claude Code documentation. It writes **nothing** unless `--write` is passed, and then only after an explicit
confirmation (interactive `y/N` on a TTY; non-interactive callers must also pass `--yes`). `--write` creates `<repo>/.claude/settings.json` only if it does not exist;
if it exists, nothing is written and the merge instructions are printed. Exit 0 on success, 2 if the write was refused or failed.

### hook install | uninstall

`install` writes `post-checkout` and `post-merge` hooks into the repository's hooks directory. The hook runs `scan` on the repository and prints a warning when findings
meet the threshold; it never blocks (post-* hooks cannot) and never exits non-zero. It is **never installed automatically**.
Safety rules: confirmation before writing (same `--yes` rule as `harden`); an existing hook without the Tripwire marker is never overwritten (exit 2);
refuses (exit 2) if the repository config redirects hooks (`core.hooksPath`), since that could point at a shared or attacker-chosen directory — config is parsed as text, git is not run;
refuses if the hooks directory or hook file is a symlink. `uninstall` removes only files carrying the Tripwire marker and restores nothing else; running it twice is a no-op (exit 0).

## Flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--sarif <file>` | scan, diff, verify | also write SARIF 2.1.0 to `<file>` (`-` = stdout; then the text report goes to stderr) |
| `--json <file>` | scan, diff, verify, baseline create, lock | also write the JSON report to `<file>` (`-` = stdout, same rule) |
| `--fail-on <severity>` | scan, diff, verify | `critical`, `high` (**default**), `medium`, `low`, `info` or `none`. Exit 1 if a reported finding is at or above it |
| `--min-confidence <level>` | scan, diff, verify, baseline create | `low` (**default**), `medium`, `high`. Findings below it are dropped before everything else and not counted |
| `--baseline <file>` | scan, diff, verify | suppress findings in the baseline file (see above) |
| `--include-user-configs` | scan, verify, lock | also scan user-level config in the home directory (`~/.claude/settings.json`, `~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, Claude Desktop config). Off by default |
| `--no-color` | all | no ANSI colour. Colour is also off when stdout is not a TTY or `NO_COLOR` is set |
| `--repo <path>` | all | repository root (default: `<path>`, or `.` for `diff`) |
| `--no-repo-config` | all | ignore repository configuration entirely: `.tripwire.json` (and its legacy name) and any `--baseline` file inside the repository. In `diff` this also ignores the base revision's configuration. The lock (`verify`) is input, not configuration, and is still read |
| `--no-merge-base` | diff | compare against `<base>` itself |
| `--write` | harden | write the template (confirmation required) |
| `--yes` | harden, hook | confirm non-interactively (required for `--write` / `install` without a TTY) |
| `--version`, `--help` | — | print and exit 0 |

Unknown commands or flags, a missing flag value, or an invalid value are exit 2 with usage on stderr. Flags may appear before or after positional arguments.

Order of processing: discover/scan -> `.tripwire.json` suppressions (working tree for `scan`; BASE revision for `diff`) -> `--min-confidence` -> `--baseline` -> threshold check.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Clean: no reported finding at or above `--fail-on`, no drift (verify). Also: `--fail-on none`, `--help`, `--version`, successful `lock`/`baseline create`/`harden`/`hook` |
| 1 | At least one reported finding at or above `--fail-on`, or any drift |
| 2 | Tool error: bad arguments, unreadable path or lock/baseline file, bad revision, unsupported repository, refused or failed write |

Findings that parse or read problems cause (e.g. an oversized file, `AG-000`) are findings, not tool errors. A tool error never prints a report and never writes the `--sarif`/`--json` files.

## Output

- **stdout**: human-readable text report (core `toTextReport`), unless a `-` target redirects it to stderr. **stderr**: errors, notes and deprecation messages.
- The text report ends with one summary line, e.g. `3 findings (1 high, 2 medium); 4 suppressed by baseline`.
- Output is deterministic: sorted as core sorts findings, no timestamps, no absolute paths in JSON/SARIF (paths are repo-relative posix; SARIF uses `%SRCROOT%` / `%USERPROFILE%`).

### JSON shape (`--json`), `schemaVersion: 1`

```jsonc
{
  "schemaVersion": 1,
  "tool": { "name": "Tripwire", "version": "0.1.0" },
  "command": "scan",                       // "scan" | "diff" | "verify" | "baseline" | "lock"
  "root": ".",                             // as given by the user, never resolved to an absolute path
  "summary": {
    "total": 3,                            // length of findings[]
    "bySeverity": { "critical": 0, "high": 1, "medium": 2, "low": 0, "info": 0 },
    "suppressedByBaseline": 4,             // findings hidden by --baseline (0 when no baseline)
    "suppressedByConfig": 0,               // findings hidden by .tripwire.json suppressions
    "failOn": "high",                      // effective threshold ("none" allowed)
    "minConfidence": "low",
    "failed": true                         // true iff exit code would be 1
  },
  "findings": [ /* core Finding objects, see below */ ],
  "diff":  { "base": "main (merge base) @ 1a2b3c4d", "head": "feature @ 5e6f7a8b",
             "introduced": 2, "worsened": 1, "resolved": 0, "unchanged": 5 },   // present only for command "diff"
  "lock":  { "file": ".tripwire.lock", "entries": 12, "drift": { "changed": 1, "added": 0, "removed": 0 } }  // only for "verify" and "lock"
}
```

`findings[]` are core `Finding` objects exactly as defined in `packages/core/src/model/types.ts`:
`ruleId, severity, confidence, category, title, whyItMatters, file, range {startLine,startCol,endLine,endCol (0-based, UTF-16)}, evidence (secrets redacted), fix,
jsonPath?, subject?, autofix?, references?, experimental?, introducedByChange?`. `introducedByChange` is `true` for every finding of `diff`, absent otherwise.
Field order is not significant; unknown fields must be ignored by consumers (additive evolution). No empty/undefined placeholders: absent means absent.

For `diff`, `findings` = introduced + worsened (head-side objects). For `verify`, `findings` are the AG-012 drift findings only. For `baseline` and `lock`,
`findings` is empty and `summary` counts what was accepted/recorded in `summary.total` = 0 and the extra block describes the file written (`baseline: { file, accepted }`).

### SARIF (`--sarif`)

SARIF 2.1.0 from core `toSarif` (validated in tests against the official OASIS schema): one run, `tool.driver.name` = product name, rules with help text, results with
`partialFingerprints["<id>Identity/v1"]`, `fixes` for input-free autofixes. `diff` sets `baselineState` (`new` for introduced and worsened). Baseline-suppressed findings are
**omitted** and counted in `run.properties.suppressedByBaseline`. With zero findings the file is still a valid SARIF log with one run and an empty `results` array.

## File formats

**`.tripwire.lock`** (JSON, deterministic, safe to commit):
```json
{ "version": 1, "tool": "Tripwire",
  "entries": [ { "kind": "mcp-server" | "hook", "file": ".mcp.json", "key": "mcpServers.fs", "sha256": "<64 hex>", "summary": "npx -y @scope/pkg@1.2.3" } ] }
```
`sha256` is over the canonical (sorted-key) JSON of the definition (MCP: command, args, env *names and values*, url, headers; hook: matcher + command). `summary` is a
redacted human-readable form (no env values, no header values, truncated to 200 chars) used only for before/after evidence. Entries are sorted by `file`, `key`.

**`.tripwire-baseline.json`** (JSON, deterministic, safe to commit):
```json
{ "version": 1, "tool": "Tripwire",
  "findings": [ { "id": "<identityHash>", "count": 1, "ruleId": "AG-002", "file": ".claude/settings.json", "title": "..." } ] }
```
`id` is core `identityHash` (sha256 of `identityKey`, first 32 hex). `ruleId`, `file`, `title` are informational. No line numbers, no timestamps, no evidence text.

## Stability promise

Command names, flag names and meanings, exit codes, the JSON shape above, and both file formats are stable within `version: 1` / `schemaVersion: 1`.
Rule IDs (`AG-NNN`) are stable. Rule *set* and severities may change between releases (see `docs/RULES.md`); pin a baseline to absorb that.
