# Track B decisions and verification

## Extension hardening (2026-10-18)

- Real Cursor editor, throwaway profile and `HOME`/`USERPROFILE`: empty workspace had zero findings, green shield, and no auto-opened panel.
- User-level `~/.claude/settings.json` was ignored with `scanUserLevelConfigs=false`, flagged when enabled, and absent again when disabled. The test does not read the real user home.
- A two-folder `.code-workspace` showed findings from the second folder and none from the clean first folder.
- `node scripts/run-tests.mjs first-run multi-root --exe=D:\cursor\cursor\Cursor.exe` passed 3 tests across 2 editor launches.
- Installed VS Code could not launch because its updater mutex was held; Cursor was used for the real-editor checks. Windsurf was unavailable as a headless executable here and is untested.

## Demo polish timing (Cursor, 5,000 source files, 2026-10-18)

- Activation 1,741 ms; ready 1,795 ms; first scan 1,733 ms. The phase 3 first-scan gate of 2,000 ms passed.
- Three repeat command scans took 140, 87, and 83 ms. The scan service switched to a worker after the first scan.
- The pre-flight panel uses 16 px base type and compact cards. Five cards fit within roughly 800 px of panel height; this is a CSS estimate, not a measured projector display.
