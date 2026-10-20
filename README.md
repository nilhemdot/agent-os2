Tripwire flags risky AI-agent hooks, MCP launches, and instructions before an agent uses a repository.

Install (Node.js 20+ and pnpm required), then run the committed CLI bundle:

```powershell
pnpm install --frozen-lockfile
node packages/cli/dist/tripwire.mjs scan fixtures/vulnerable-repo
```

The sample is deliberately unsafe, so the scan prints findings and exits 1. A clean example is `node packages/cli/dist/tripwire.mjs scan fixtures/hardened-repo` (exit 0). To scan your own folder, replace the fixture path with its path. The CLI reads scanned files as text and does not run their hooks or MCP commands. The install uses the package lockfile and builds no dependency install scripts.

[60-second demo recording — link to add](REPLACE_WITH_DEMO_RECORDING_URL)

## What it does

Tripwire checks common agent configuration files used by Claude Code, Cursor, Codex, Gemini CLI and VS Code. The CLI can scan a folder, compare Git revisions, and produce JSON or SARIF. A VS Code extension and GitHub Action use the same scanning core. See `docs/CLI.md` for commands and `demo.md` for a raw terminal recording script.

The [mock team report](docs/mock-report.html) and [print PDF](docs/mock-report.pdf) use synthetic repositories and show `DEMO DATA (synthetic)` on the report itself.

## Known limitations

- Rules cover known patterns, not every risky instruction or secret. The unsupported synthetic `zzq_` secret shape remains visible in scan and diff text/JSON/SARIF and report JSON. Do not use Tripwire as a general secret scanner.
- It does not inspect arbitrary application source for malicious behavior or undo actions that ran before scanning. A finding indicates a matching pattern, not proven intent.
- QA ran on Windows. The extension was tested in VS Code and Cursor; Linux, macOS and Windsurf are unverified. GitHub Security-tab SARIF display is unverified.
- The history report's merge and rename handling has CLI tests, but an independent run-2 QA matrix for those cases was not run. See `docs/QA_REPORT.md` for measured results and scope.

License: MIT
