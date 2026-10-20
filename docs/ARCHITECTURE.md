# Architecture

```
product.json            single source of product identity (name, id, settings prefix, config file, publisher, license holder)
packages/core           pure TypeScript, no editor dependency, no processes
  discovery/            which files are agent config; safe readers (no symlinks, size caps, repo-contained)
  parsers/              JSONC / TOML / text -> SourceFile with source ranges
  rules/                one file per rule family; pure functions (SourceFile, context) -> Finding[]
  engine/               runs rules, dedupes, applies suppressions (reason required), sorts
  unicode/              hidden-character detection and decoding
  diff/                 identity, line similarity, structured config changes, diffStates()
  git/                  process-free object reader, snapshots, git-aware diff (diffAgainst)
  report/               SARIF 2.1.0, JSON, text, diff report (markdown/text)
  baseline.ts           accept-today baselines keyed by diff identity (multiset)
  lock/                 AG-012: hashes of MCP server definitions and hook commands, drift detection
  intel/                reviewed offline data (hosts, mcp-packages.json for AG-011)
packages/extension      VS Code extension (bundled with esbuild; the core is bundled in)
packages/cli            command-line scanner: src/ (args, report, main, harden, hook), bundled by scripts/build.mjs into ONE file dist/tripwire.mjs
                        (esbuild, Node built-ins only, no node_modules at runtime). Contract: docs/CLI_CONTRACT.md. Reference: docs/CLI.md
scripts/                fixtures, survey, rename/sync tooling, dev helpers
fixtures/               vulnerable / hardened / benign / held-out / regression repositories
```

## Data flow

```
workspace folder ──discover()──▶ SourceFile[] ──scanFiles()──▶ Finding[] ──▶ diagnostics, panel, status bar, quick fixes
                                   ▲  readFile (script following, text only)        │
git objects ──snapshotCommit()─────┘                                                 ├──▶ toSarif()  (Export SARIF)
                                                                                     └──▶ diffStates() ──▶ marks, report, SARIF baselineState
```

- **Rules never execute, import or install anything from the scanned repository.** Scripts referenced by hooks/tasks/MCP launches are read as text through a reader that refuses symlinks, non-regular files, paths outside the repo and files over 256 KB.
- **The extension spawns no process**, including for git: history is read by the TypeScript object reader. Full scans run inline until one takes longer than 100 ms, then in a `worker_threads` worker (a thread, not a process).
- **Hostile-input posture:** per-file size caps, parse depth caps, linear-time regexes (fuzz/pathological-input tests), decompression and delta limits in the git reader.

## Extension structure

| Module | Role |
|---|---|
| `scanService` | file cache, full + incremental scans (300 ms debounce, dependents re-scanned), repo-provided suppressions (ignored while untrusted), comparison session |
| `diagnostics`, `codeActions` | Problems panel entries with doc links; one quick fix per autofix alternative, Suppress and Explain |
| `fixes` | diff preview against a virtual document; nothing is written until the user confirms; applied as an undoable `WorkspaceEdit` |
| `panel`, `panelHtml`, `media/panel.js` | the "Review before running your agent" webview: strict CSP, no inline code, messages validated against the finding store |
| `statusBar` | shield (red/amber/green) with counts, last scan, suppressed count, comparison summary |
| `gitDiff` | Scan Git Changes (revision picker -> diff -> marks + markdown report) and Export SARIF (scope picker -> save dialog -> file) |
| `ui` | every prompt goes through one object so tests can answer deterministically |

## History report (`report`)

Code: `packages/core/src/histreport/` (types, shared escape function, renderers, history analysis), `packages/cli/src/reportCmd.ts` (flags, output-path safety). Contract: `docs/REPORT_CONTRACT.md`; JSON schema: `docs/report.schema.json`.

**Attribution** (per repository, read-only, through the built-in git reader: no checkout, no processes, no hooks, no git config programs):
1. Walk the first-parent chain from HEAD backwards for at most `--max-commits` commits, then order it oldest to newest. A missing parent object (shallow clone) or the cap ends the walk and marks the history shallow / truncated.
2. Between consecutive chain commits compare the trees (identical subtrees are skipped). A commit is scanned only when the difference touches an agent-config path (`classifyPath`) or a script that the previous scan actually read while following hooks, tasks or MCP commands (those paths are recorded through the `readFile` callback). The oldest commit in the chain is always scanned.
3. A scan of a commit is the normal scanner (`snapshotCommit` + `scanFiles`) with the repository's current configuration. Each finding gets a key `identityKey + "#" + k` (the k-th duplicate of the same identity), where `identityKey` is the baseline identity: rule id, file, stable JSON path, subject and normalised evidence.
4. A key that appears in a scan opens a span at that chain index; a key that is no longer present closes it. The span that is still open at HEAD is the "open" finding and its start is `introducedIn`. A closed span is a "resolved" finding with `resolvedIn`. A key that disappears and reappears therefore yields one resolved and one open finding; the later appearance is the introduction.
5. Spans that start at the oldest chain commit while the history is shallow or truncated are `exact: false` ("on or before"). Spans that start at the root commit of a complete history are exact.

Limits that follow from this and are stated in the report: first-parent only (a merged branch's commits are attributed to the merge); a renamed file is a new identity; severity is taken from the latest scan of the identity; commit dates are committer dates.

**Trend**: for each of the last N calendar months (UTC, ending with the month of "now") take, per repository, the last chain commit with a committer time before the start of the next month, and count the spans open at that chain index by severity. `introduced` / `resolved` count exact span starts / span ends whose commit date falls inside the month. Months that end before the first commit of every repository are left out. Team mode sums over repositories.

**Folders without git** (or whose history cannot be read) are scanned as they are: findings are all open and have no `introducedIn`; the trend is empty and `meta.repos[].notes` says why.

**Output safety**: every dynamic string passes through `escape.ts` (`visible` replaces control, bidi, zero-width, tag and variation-selector characters and lone surrogates with `<U+XXXX>`; `escapeHtml` / `mdCell` escape on top). E-mail addresses and absolute repository paths are removed from text taken from the repository. Author names and commit subjects are included only with `--include-authors` / `--include-subjects`. The HTML has no script, no external resource and a restrictive CSP meta tag. The report path imports no network or process APIs.

## Product identity

Code reads the name through `PRODUCT` (`cmd()`, `setting()`, `scheme()`); `packages/extension/package.json` and `LICENSE` are generated from `product.json` + `package.template.json`
(`node scripts/sync-product.mjs`, checked by a test). `node scripts/rename-product.mjs --name "X" --apply` switches the product everywhere. Rule IDs (`AG-001`) are stable identifiers and are not renamed.

## Tests

| Layer | What | Where |
|---|---|---|
| Unit / property | rules (positive, negative, evasion), parsers, Unicode, fuzz and slow-input guards | `packages/core/test` |
| Golden | vulnerable fixture matches `EXPECTED.md` exactly; hardened = 0 findings; 9 benign repos = no high/critical | `golden.test.ts` |
| Held-out | incident-pattern repos with expectations committed before rules were run | `fixtures/heldout`, `scripts/heldout.ts` |
| Autofix | every fix on every fixture applies cleanly and resolves its finding | `autofix-fixtures.test.ts` |
| SARIF | every fixture's output validates against the official OASIS schema | `sarif.test.ts` |
| Git | byte-for-byte parity with `git cat-file` on real repositories | `git.test.ts` |
| Extension | real editors via `@vscode/test-electron` (4+2 workspaces), plus real mouse clicks over the DevTools protocol | `packages/extension/test`, `scripts/e2e-ui.mjs` |
