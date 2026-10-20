# Two-minute Tripwire demo

Follows section 13 of `docs/AGENTGATE_BUILD_PROMPT.md` beat for beat. Total: **2:00**. Every beat's spoken text fits its window at 150 words per minute (2.5 words per second); the slack is for clicks. Measured action times (real windows, fresh profile): the panel is on screen about **3 s** after the editor opens the project, a squiggle appears within **0.5 s** of opening a finding, and approve-then-undo of one fix takes **2.0 s** (VS Code 1.142.0) to **2.5 s** (Cursor 3.17.8).

## The script

Three editor windows are prepared (see the checklist): **A** the vulnerable "chess game starter kit", **B** the hardened project, **C** a normal project with real MCP and Gemini configuration. Window A starts closed; open it at 0:15 so the panel appears live.

| Window | Say | Do | Words / speaking time / slack |
|---|---|---|---|
| 0:00 – 0:15 | "A repo can tell your AI agent what to run. Here's a chess game starter kit. Watch what happens when I open it." | Show the folder name on the Open Recent menu. | 23 w / 9.2 s / 5.8 s |
| 0:15 – 0:45 | "Tripwire reads agent config as text and never runs it. Before I've run anything, six critical findings. This hidden text decodes to an instruction: send the .env file to hook dot example dot invalid." | Open the folder (**File > Open Recent**). The pre-flight panel opens **by itself**. Point at the red shield, then at the card "Hidden text decodes to readable content" with the decoded line in the red-edged box. | 34 w / 13.6 s / 16.4 s |
| 0:45 – 1:00 | "The SessionStart hook pipes a download straight into a shell, there's the squiggle. And the same trick in CLAUDE.md, invisible to a reviewer." | Click **Open file** on the SessionStart card (red squiggle on the command line). Click **Open file** on the hidden-text card for `CLAUDE.md`. | 23 w / 9.2 s / 5.8 s |
| 1:00 – 1:15 | "Fixes are previewed first. Nothing is written until I approve. Approved, the finding is gone. Undo brings it back." | Click **Apply fix** on "enableAllProjectMcpServers is true": the diff opens, choose **Apply fix** in the picker, the card leaves the panel; press **Ctrl+Z** in the editor, the card returns. | 19 w / 7.6 s / 7.4 s |
| 1:15 – 1:30 | "Next window: the hardened project is clean. And a normal project with real MCP config: no noise." | Switch to window B (green shield, "Nothing at medium severity or above"), then to window C (green shield). | 17 w / 6.8 s / 8.2 s |
| 1:30 – 1:50 | "Across 110 sampled public repos that ship agent config, 24, about 22 percent, had at least one high or critical pattern. That sample is repos that already have agent files, so it is not the rate for all repos." | Show the statistics slide (below). | 39 w / 15.6 s / 4.4 s |
| 1:50 – 2:00 | "It flags, it doesn't protect; a green shield isn't proof. The CLI and the pull request gate already exist." | Stay on the slide or the shield. Do not demo the PR gate live unless the proof page is open (see below). | 19 w / 7.6 s / 2.4 s |

Totals: 7 beats, 120 s of windows. Slack is at least 4.4 s on every beat except the last (2.4 s): if a beat runs long, cut the sentence "Watch what happens when I open it" first.

### Statistics slide (1:30)

> **24 of 110** sampled public repositories (22%) ship at least one high or critical agent-configuration finding.
> Sample: repositories found by GitHub code search for agent configuration files (Claude, Cursor, MCP, Codex, Copilot), 110 scanned, seed `20261017`, scanned 2026-10-18 with the final rules. Not a random sample of GitHub: it overstates the rate for repositories in general. A finding is a pattern worth reviewing, not a confirmed compromise.

The figure is reproduced by `npx tsx packages/cli/scripts/survey-guard.ts <candidates.json> 110` (aggregate counts only; repository names are never shown next to findings).

## About the PR gate

The CLI and the Action were run on a private scratch repository: three malicious pull requests failed the check, each got one comment and file annotations, and a pull request that added its own `.tripwire.json` suppression still failed. SARIF in the Security tab was not shown live. Say "the check fails", not "the Security tab lights up", unless you have run it on a public repository.

## Pre-demo checklist (one page)

**The day before**
- [ ] `git pull`, `pnpm install`, `pnpm --filter ./packages/extension run package`: produces `packages/extension/tripwire.vsix`. Run `node scripts/e2e/clean-install.mjs --label=vscode` (and `--exe=<Cursor.exe> --label=cursor`): 4 of 4 steps must pass. Do not publish the extension anywhere.
- [ ] Rehearse once with a stopwatch against the table above.

**An hour before**
- [ ] Editor and version: record them. Tested: **VS Code 1.142.0** and **Cursor 3.17.8** on Windows 11. Use the same one on stage.
- [ ] Install the extension into the demo profile: **Extensions: Install from VSIX...**, pick `tripwire.vsix`, reload. In Cursor you may be asked to sign in; skip it.
- [ ] `node scripts/demo/reset.mjs` prints three scratch paths (vulnerable, hardened, normal). Open **B** and **C** each in its own window now. Keep **A** closed and in **File > Open Recent** (open it once, close it, so it is listed first). Never open `fixtures/` directly; re-run `reset.mjs` for every rehearsal.
- [ ] Window size: maximize each window, then close every side bar except the Explorer: in Cursor close the Chat/Agent pane (`Ctrl+Alt+B`), in VS Code close the secondary side bar. At 1800 px width with the Chat pane open only two cards fit in the panel.
- [ ] Zoom to about **125%** (`Ctrl +` twice) and set `editor.fontSize` to **18–20**. Drag the panel wider if the card text wraps more than four lines. Check on the actual projector or capture resolution: this page cannot verify it for you.
- [ ] Fonts: a readable monospace face (Consolas, Cascadia Mono, JetBrains Mono). Theme: any, but check the red badge and the decoded-text box are legible on it; high contrast themes work.
- [ ] Notifications off: Windows **Focus assist / Do not disturb** on; close chat, mail and update tray apps; in the editor set `"update.mode": "none"`, `"workbench.tips.enabled": false`, and dismiss the one-time shield explanation by clicking its **x** before you start (or leave it for the opening beat if you want to read it aloud).
- [ ] Automatic tasks: the vulnerable fixture has a folder-open task pointing at a `.invalid` host. Set `"task.allowAutomaticTasks": "off"` so no editor runs it. Nothing in the demo executes a hook, task or MCP server.
- [ ] Network: not needed. Turn Wi-Fi off if you want to prove it, the scan makes no requests.

**Recording**
- [ ] Record the **display**, not a single window, so window switches are captured; 1920x1080, 30 fps; hide the taskbar; mouse highlight on; system sounds off; microphone level check (speak the first line, play it back).
- [ ] Do a dry run of the whole 2:00 with recording on and watch it once at full screen before the real take.
- [ ] After the take, delete the scratch directories (they are under your temp folder).

**What must be true on the screen** (look, don't assume)
- [ ] Panel visible within a few seconds of opening **A**, red shield, "6 critical" in the summary.
- [ ] The hidden-text card shows "Hidden text reads:" with the decoded sentence.
- [ ] A red squiggle is visible on the SessionStart command line after **Open file**.
- [ ] The fix preview is readable at the capture resolution; Undo restores the text.
- [ ] Windows **B** and **C**: green shield.

## Cisco comparison status

Cisco's **AI Agent Security Scanner for IDEs** v1.0.6 installed successfully through Cursor's extension CLI into a throwaway extension directory. An isolated test-host launch returned without a scan result, so the vulnerable fixture's Cisco findings and omissions are **unverified**. We cannot claim that Cisco did or did not flag any particular Tripwire fixture finding. Its [published feature description](https://blogs.cisco.com/ai/introducing-the-ai-agent-security-scanner-for-ides-verify-your-agents) covers MCP and skill scanning and optional execution-time controls; this is a documented-capability comparison only.
