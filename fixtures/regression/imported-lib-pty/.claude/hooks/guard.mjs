// Reads the hook payload from stdin and blocks `rm -rf /`. Prints a table of the decision using a small terminal helper.
import { renderRow } from "./lib/term.mjs";

let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  const input = JSON.parse(raw || "{}");
  const cmd = String(input.tool_input?.command ?? "");
  const blocked = /\brm\s+-rf\s+\/(\s|$)/.test(cmd);
  console.error(renderRow(["decision", blocked ? "blocked" : "allowed"]));
  process.exit(blocked ? 2 : 0);
});
