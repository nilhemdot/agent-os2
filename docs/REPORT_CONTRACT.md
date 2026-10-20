# `report` command contract (frozen)

Source: section A2 of the plan. After Phase 0 this file changes only additively; every change is logged in the coordination `STATE.md`.
The machine-readable JSON schema is [report.schema.json](report.schema.json). Examples use the CLI name `tripwire`, which comes from the product constant (`product.json`); tests must use the built bundle, `packages/cli/dist/tripwire.mjs`.

## 1. Command

```
tripwire report <path...> [options]
```

`<path...>`: one or more repository folders (at least one). Two or more is team mode. A folder need not be a git repository.

| Option | Default | Meaning |
|---|---|---|
| `--format html\|json\|md` | `html` | Output format. |
| `--out <file>` | `tripwire-report.<ext>` in the current folder (`.html`, `.json`, `.md`) | Output file. `-` writes to stdout (the human summary then goes to stderr). |
| `--force` | off | Allow overwriting an existing output file. Without it an existing file is an error (exit 2). |
| `--months <n>` | `6` | Trend window in calendar months (UTC). Integer 1 to 24, else exit 2. |
| `--max-commits <n>` | `2000` | History cap per repository (first-parent commits examined, counted from HEAD backwards). Integer >= 1. |
| `--include-authors` | off | Add the commit author name (never an email) to `introducedIn` / `resolvedIn`. |
| `--include-subjects` | off | Add the commit subject, escaped by the renderer and truncated to 80 characters. |
| `--repo-name <name>` | folder name | Display name. Only valid with exactly one path (else exit 2). |
| `--min-severity <sev>` | `low` | Findings below this severity are left out of everything (counts, trend, tables). `critical high medium low info`. |
| `--fail-on <sev\|none>` | `none` | Exit 1 when an OPEN finding at or above this severity exists. (Different default from `scan`.) |
| `--no-repo-config` | off | Do not read the repository's own suppression/config file. |
| `--demo-label` | off | Stamp "DEMO DATA (synthetic)" prominently in the output. |
| `--now <ISO-8601 UTC>` | current time | Fixes `generatedAt` and the "today" used by the trend, so two runs can be byte-identical. |

Not offered by `report`: `--sarif`, `--json`, `--baseline`, `--min-confidence`. They are rejected with a usage error (exit 2) when combined with `report`.

### Output path safety
- `--out` is resolved against the current folder. A path that contains `..` segments after normalisation is refused (exit 2) unless it still resolves inside the current folder.
- If the target (or any existing parent directory of it) is a symbolic link / junction whose real path is outside the current folder, it is refused (exit 2). A path given by repository content never reaches `--out`; `--out` always comes from the command line only.
- Parent directories are not created. A missing parent is exit 2.
- Output is written atomically enough that a failed run leaves no partial file (write to a temp name in the same folder, then rename).

### Exit codes
`0` report written; no open finding at/above `--fail-on`. `1` report written; open findings at/above `--fail-on`. `2` tool error (usage error, unreadable path, refusal to overwrite, path escape, etc.); in that case NO report file is written. One line on stderr starting with the product name. The tool does not touch the network.

## 2. Data model (JSON format, `--format json`)

Top level (all keys always present unless marked optional):

```json
{
  "schemaVersion": 1,
  "meta": {
    "tool": { "name": "<product>", "version": "<semver>" },
    "generatedAt": "2026-10-20T00:00:00.000Z",
    "demo": false,
    "options": { "months": 6, "maxCommits": 2000, "includeAuthors": false, "includeSubjects": false, "minSeverity": "low", "failOn": "none", "repoConfig": true },
    "repos": [ { "name": "...", "git": true, "shallow": false, "truncated": false, "commitsExamined": 0, "firstCommit": null, "headCommit": null, "headDate": null, "notes": [] } ]
  },
  "summary": {
    "open": 0, "resolved": 0, "highCritical": 0,
    "bySeverity": { "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0 },
    "perRepo": [ { "repo": "...", "open": 0, "resolved": 0, "bySeverity": { "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0 } } ]
  },
  "trend": {
    "windowMonths": 6,
    "method": "<plain-language description of how the series was computed>",
    "months": [ { "month": "2026-03", "asOfCommit": null, "open": { "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0 }, "highCritical": 0, "introduced": 0, "resolved": 0 } ]
  },
  "findings": [ "<finding>", "..." ]
}
```

- `meta.repos[].firstCommit`/`headCommit`: short (8 hex) shas of the first examined and the HEAD commit, `null` when there is no git history. `headDate` is the HEAD commit date in UTC ISO, or `null`. `notes` are human sentences (for example "no .git directory: commit attribution unavailable", "shallow history: findings are dated 'on or before' the oldest available commit", "history truncated at --max-commits").
- `trend.months`: ascending by month, only months from the first commit of ANY repo in the report onward and inside the window. `open`/`highCritical` are counts at the end of that month (last commit on or before the month end, UTC; for the current, unfinished month: HEAD). `introduced`/`resolved` are the number of findings whose introduction/resolution commit date falls inside that month. In team mode all numbers are sums over repos (a repo with no commit yet by that month contributes 0). For a plain folder without git, `months` is empty and a note explains why.
- `summary.open` counts findings with `status: "open"`; `summary.resolved` counts `status: "resolved"` (findings that existed at some point inside the history examined and are gone at HEAD).

### Finding

```json
{
  "repo": "name", "ruleId": "AG-004", "title": "...", "severity": "high", "confidence": "high",
  "file": "relative/posix/path", "range": { "startLine": 1, "startCol": 1, "endLine": 1, "endCol": 10 },
  "evidence": "redacted text, NOT html-escaped", "fix": "one-line fix",
  "status": "open",
  "introducedIn": { "commit": "abc12345", "date": "2026-03-04T10:00:00.000Z", "exact": true, "subject": "optional", "author": "optional" },
  "resolvedIn": { "commit": "def67890", "date": "...", "subject": "optional", "author": "optional" }
}
```

- `range` is exactly the existing scan finding `Range` (`startLine`, `startCol`, `endLine`, `endCol`).
- `introducedIn`: omitted when there is no git history. `exact: false` means the finding was already present at the oldest commit examined (shallow clone or `--max-commits` reached); the commit is then "on or before" that commit and renderers must say so. `subject` only with `--include-subjects`, `author` only with `--include-authors`; absent otherwise (keys not present, not null).
- `resolvedIn`: only for `status: "resolved"`; the first commit at which the identity is no longer present.
- Sort order of `findings` in all formats: open before resolved; then severity (critical first); then confidence (high first); then `introducedIn.date` newest first (missing date last); then repo, file, line, ruleId (stable tiebreak).
- `evidence` carries secrets only as the existing redaction (prefix and length). It never contains emails of authors. Paths are repository-relative, posix separators, never absolute.
- Identity of a finding (the tuple used to track it across commits) is the baseline identity: `ruleId + file + normalised evidence + structured path (+ subject)`. A rename of the file is a new identity.

## 3. Attribution and trend (summary; the algorithm lives in `docs/ARCHITECTURE.md`)
- First-parent history only, oldest to newest, only commits that touch agent-config paths. No checkout, no hooks, no git config programs: the built-in git reader.
- Introduced-in = the commit where the identity first appears and stays present continuously up to HEAD. Disappears and reappears: the later appearance counts and the earlier span is recorded as a resolved finding.
- Shallow clone or `--max-commits` reached: affected findings get `exact: false`.

## 4. HTML structure (`--format html`)

ONE file, no JavaScript, no external resources, charts are inline SVG. In `<head>`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
```

Landmarks (stable ids tests may rely on), in this order inside `<body>`:

1. `<div id="demo-banner">` containing the text `DEMO DATA (synthetic)`: present only with `--demo-label`, at the very top.
2. `<header id="title">`: `<h1>` with the product name and "report", and the scan date.
3. `<section id="summary">`: one paragraph: "N open findings across M repositories; X high/critical; trend over the last N months".
4. `<section id="trend">`: inline `<svg>` chart(s): high+critical per month, then per severity; plus a plain `<table>` with the same numbers (no information only in the chart), and the `method` text.
5. `<section id="severity-counts">`: table of counts by severity, and per-repo table when more than one repository.
6. `<section id="findings">`: one `<h3 data-severity="critical|high|medium|low|info">` group heading per severity that has open findings, each followed by a `<table>`; each row `<tr class="finding" data-severity="...">` with cells repo, rule, file:line, short sha, date, fix. Severity is always written as a text label.
7. `<section id="resolved">` "Resolved this period".
8. `<section id="coverage">` "What this report does and does not cover": wording identical to the corresponding paragraph in `docs/LIMITS.md`.
9. `<footer id="footer">`: tool version, `generatedAt`, commit range per repo, and the demo banner text again when `--demo-label`.

Escaping: every dynamic string passes through ONE shared escape function. Zero-width, bidi and other invisible/control characters in dynamic strings are shown visibly as `<U+XXXX>` (itself escaped as text), NUL as `<U+0000>`. Print: A4 and Letter, page break between sections, dark text on light background.

## 5. Markdown structure (`--format md`)

`# <product> report`, optional `> DEMO DATA (synthetic)` blockquote first, `## Summary`, `## Trend` (table: month, critical, high, medium, low, info, high+critical, introduced, resolved), `## Counts by severity`, `## Findings` with `### Critical` etc. (table columns: Repo, Rule, File:line, Commit, Date, Fix), `## Resolved this period`, `## What this report does and does not cover`, `## Run details`. Pipes and newlines in cells are escaped; all dynamic text goes through the same invisible-character rule as HTML.

## 6. Determinism
With `--now` fixed and unchanged inputs, two runs produce byte-identical output in all three formats. The report contains no absolute paths and no machine- or user-specific data.

## 7. Stub status
Until the real implementation lands, `report` returns valid output with zero findings, an empty trend and a note in `meta.repos[].notes`. The data shapes above do not change when the real implementation lands.

## 8. Clarifications added after the freeze (additive; none changes a shape above)
1. **Resolved findings listed**: a finding is `resolved` and listed when its resolving commit date is on or after the start (UTC 00:00 on the 1st) of the first month of the trend window. Findings resolved earlier are not listed. A key that disappears and reappears yields one resolved and one open entry.
2. **`introduced` in the trend** counts only spans whose start is exact (`exact: true`). Findings already present at the oldest commit of a shallow or truncated history are not counted as introduced in any month.
3. **Text safety in HTML and Markdown** (JSON keeps the raw, redacted strings): URL schemes in dynamic text are defanged (`https://x` is shown as `https[:]//x`, same for http, ftp, ws, file, javascript, vbscript, data, blob, mailto, tel, about); line breaks and tabs become one space; dynamic fields are clipped to 400 characters with a "[n more characters]" note; invisible and control characters are shown as `<U+XXXX>`.
4. **Redaction applies to every string taken from the repository** (title, evidence, fix, subject, author, notes), in all formats: known secret shapes keep only a prefix and the length, authorization header values and `key=value` credentials are masked as `[redacted]`, e-mail addresses become `<email removed>`, and the absolute repository path is removed. Subjects are cut to 80 characters and author names to 100 before output.
5. **Findings table cells**: the "Rule" cell reads `<ruleId>: <title>`; for an inexact origin the Commit cell reads `on or before <sha>` and the Date cell `<date> or earlier`.
6. **Plain folders** (no `.git`, or history unreadable): findings are all `open`, `introducedIn` is absent, `trend.months` is empty, and `meta.repos[].notes` says why. An empty git repository (no commits) gives no findings and a note.
7. **Display names** in team mode: the folder name; a repeated name gets ` (2)`, ` (3)`.
8. **Relevant commits**: a commit is scanned only if it changes an agent-config file or a script that the previous scan read while following hooks, tasks or MCP commands (plus the oldest commit of the walk, always).

