# Diff mode: what did this change make worse?

A snapshot scan answers "what is risky in this repository?". Diff mode answers the question a reviewer actually has:
**what did this branch / pull request introduce or make worse?** It compares two repository states and reports only the difference.

## Inputs

A *state* is the set of agent-config files (plus a reader for scripts they reference, and the git-tracked path set). States come from:

- a git commit (read directly from the object database, see below),
- the working tree on disk, or
- the editor's current files, including unsaved edits (what *Scan Git Changes* uses).

By default the base is the **merge base** of the chosen revision and `HEAD`, so changes that landed on the base branch after you branched
do not show up as "resolved". Pass `useMergeBase: false` to compare against the revision itself.

## Matching

Both states are scanned with the same rules. Findings are matched by **identity**: `ruleId + file + stable JSON path + subject + normalized evidence`.

- Line numbers are never part of identity, so text moving around does not create noise.
- Array indices in JSON paths are replaced by `[]` (an entry added above does not make the entries below it "new").
- Evidence is whitespace-normalized and chain line numbers (`script.js:12 [signal]`) are neutralized.
- Findings with the same identity are matched as a **multiset** (two identical findings need two matches).
- `subject` is an explicit discriminator for rules that report several findings on one path and evidence (AG-007 "unpinned" vs "auto-confirm").
- Redacted evidence keeps identity stable without storing secrets.

After exact matching, leftovers are paired by *loose identity* (everything except the evidence) **only when exactly one finding on each side shares it**, so a changed
hook command is not mistaken for an unrelated finding. Pairing is deliberately conservative: ambiguous cases become one `introduced` and one `resolved`.

## Result categories

| Category | Meaning |
|---|---|
| `introduced` | In head, not in base. Marked `introducedByChange`. |
| `worsened` | Paired finding that got more severe (or more certain). Head side marked `introducedByChange`. |
| `improved` | Paired finding that got less severe or less certain (also counted in `unchanged`). |
| `resolved` | In base, gone in head. |
| `unchanged` | Present in both (head-side objects), including pre-existing text findings outside the changed lines. |

## Renames and moves

A file that exists only in base and one that exists only in head, **of the same kind**, are treated as a rename when their content is >= 80% similar
(Dice similarity of trimmed non-empty lines; exact copies score 1). The base file's findings are mapped onto the new path, so a moved `.cursorrules`
is not "introduced". Matching is one-to-one and greedy by best similarity.

## Instruction files (Markdown and friends)

For instruction files present in both states, the text heuristics (AG-021, AG-022, AG-023, and secret patterns) only create an *introduced* finding if the finding touches an
**added or changed line, or one of the 3 lines of context around it**. Anything else is classified `unchanged` (it was already there). Hidden-Unicode detection (AG-020)
always runs on the **whole file**. New files count entirely as changed.

## Structured changes (what a text diff cannot say)

Alongside findings, `changes` lists semantic differences in configuration, each flagged `riskier` when it expands what the repository can make an agent do:

| Kind | Example |
|---|---|
| `permission-widened` | `Bash(npm run test)` replaced by `Bash(*)` |
| `permission-added` / `-removed`, `deny-removed` | a deny rule for secrets was deleted |
| `default-mode-changed` | now `bypassPermissions` |
| `env-added` / `-changed` / `-removed` | `ANTHROPIC_BASE_URL` set (secret-looking values are shown as `‹hidden›`) |
| `hook-added` / `-changed` / `-removed` | the SessionStart command changed from `prettier` to `curl ... \| sh` |
| `mcp-approval-changed` | `enableAllProjectMcpServers` turned on, a server pre-approved |
| `mcp-server-added` / `-changed` / `-removed` | launch, env or headers of a server changed (rug-pull style) |
| `task-added` / `-changed` / `-removed` | a task now runs on folder open |
| `local-settings-tracked` | `settings.local.json` became tracked by git |
| `file-added` / `-removed` / `-renamed` | |

Because scripts are followed, a hook whose **config text did not change** but whose script now contains `curl | sh` is reported as `worsened`.

## Reading git without git

The extension must never spawn a process, and running `git` inside an untrusted repository can execute repository-configured programs
(`core.fsmonitor`, textconv, diff drivers). `packages/core/src/git/repo.ts` therefore reads the object database directly:

- loose objects, packfiles (index v2) with OFS_DELTA and REF_DELTA, packed-refs, symbolic refs, worktrees (`.git` file + `commondir`), alternates;
- revisions: `HEAD`, branches, remote branches, tags (annotated tags are peeled), full or abbreviated ids, `~N` and `^N`;
- merge base: most recent common ancestor by commit time (bounded walk);
- hardening: object size cap (64 MB, also against decompression bombs), delta-chain depth cap, ref names with `..`/NUL/control characters rejected, no reads outside the git directory.

It is verified byte-for-byte against `git cat-file` on real repositories (loose, ofs-delta, ref-delta, mixed, shallow, shared, worktree).

Not supported: SHA-256 repositories, reftable, partial-clone (missing blobs are reported, not fetched), and commit-graph/multi-pack-index acceleration (ignored; reads still work).
Object ids are not re-hashed after reading (the repository is trusted to the same degree as its files; this is a scanner, not a fetch client).

## Limits

- The head is the working tree (or another commit); there is no three-way "merge result" preview.
- Merge-base selection is a heuristic for criss-cross histories (it picks the most recent common ancestor it finds first).
- Similarity-based rename detection can miss a file that was both moved and heavily rewritten (it then appears as removed + added, which is the safe direction).
- Only agent-config files and the scripts they reference are compared. Changes to the project's own source are invisible, as everywhere in this tool.
- A pre-existing finding whose *text* is edited counts as introduced when the edit touches it (that is the point), even if the edit made it slightly different rather than worse.
