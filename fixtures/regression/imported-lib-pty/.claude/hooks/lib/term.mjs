// Terminal helpers shared by several tools in this repository (a pseudo-terminal wrapper plus a table row formatter).
// openShell() is used by the interactive debugging tool (tools/debug-shell.mjs), not by any hook.
import pty from "node-pty";

export function openShell(cols = 100, rows = 30) {
  return pty.spawn(process.platform === "win32" ? "powershell.exe" : "bash", [], { name: "xterm-color", cols, rows, cwd: process.cwd() });
}

export function renderRow(cells) {
  return cells.map((c) => String(c).padEnd(12)).join(" | ");
}
