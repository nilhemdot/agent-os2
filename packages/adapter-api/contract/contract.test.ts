import { describe, expect, it } from "vitest";
import { CLAUDE_CAPABILITIES, CODEX_CAPABILITIES, notSupported } from "@agentos/adapter-api";
import { claudeCapabilities, claudeSettings, claudeSpawnArgs } from "@agentos/adapter-claude-code";
import { codexCapabilities, codexDecision, parseCodexLine } from "@agentos/adapter-codex";

describe("adapter contract", () => {
  it("AC-F6-1.1 not_supported is a typed error, never a silent success", () => {
    expect(notSupported("reattach")).toEqual({ code: "not_supported", message: expect.stringContaining("reattach") });
  });

  it("AC-F6-2.1 and AC-F6-2.2 capability matrix pins Claude to all and Codex to escalated", () => {
    expect(claudeCapabilities()).toMatchObject({ policy_coverage: "all", cost: "reported", reattach_after_daemon_restart: true, min_version: "2.1.295" });
    expect(codexCapabilities()).toMatchObject({ policy_coverage: "escalated", cost: "estimated", reattach_after_daemon_restart: false });
    expect(CLAUDE_CAPABILITIES.policy_coverage).toBe("all");
    expect(CODEX_CAPABILITIES.policy_coverage).toBe("escalated");
  });

  it("AC-F7-1.1 spawn flags match the documented non-interactive set", () => {
    const args = claudeSpawnArgs({ command: ["claude"], sessionId: "sid", settingsPath: "/tmp/settings.json", model: "fake", maxBudgetUsd: "1.5" });
    expect(args).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--verbose", "--session-id", "sid", "--settings", "--permission-prompts", "none", "--max-budget-usd", "1.5"]));
  });

  it("AC-F7-2.1 settings register a PreToolUse HTTP hook that fails closed", () => {
    const settings = claudeSettings("http://127.0.0.1:7787/gate/claude/abc", 1860) as any;
    const hook = settings.hooks.PreToolUse[0];
    expect(hook.matcher).toBe("*");
    expect(hook.hooks[0]).toMatchObject({ type: "http", timeout: 1860, onFailure: "block" });
    expect(settings.disableAllHooks).toBe(false);
    expect(JSON.stringify(settings)).not.toContain("sk-");
    expect(hook.hooks[0].headers.Authorization).toContain("${AGENTOS_GATE_TOKEN}");
  });

  it("AC-F8-2.2 decisions never use acceptForSession", () => {
    const line = codexDecision(7, "accept");
    expect(line).toContain('"decision":"accept"');
    expect(line).not.toContain("acceptForSession");
    const parsed = parseCodexLine(JSON.stringify({ jsonrpc: "2.0", method: "item/completed", params: { command: "ls", gated: false } }));
    expect(parsed?.event?.payload.gated).toBe(false);
  });
});
