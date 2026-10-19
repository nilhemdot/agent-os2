import { CLAUDE_CAPABILITIES, type NormalizedRuntimeEvent, type RuntimeCapabilities } from "@agentos/adapter-api";
import { compareVersions } from "@agentos/core";
import { spawnSync } from "node:child_process";

export function claudeCapabilities(): RuntimeCapabilities {
  return { ...CLAUDE_CAPABILITIES };
}

export function claudeCommand(configCommand: string[] | undefined): string[] {
  return configCommand?.length ? configCommand : ["claude"];
}

export function checkClaude(command: string[]): { installed: boolean; version: string | null; meetsMin: boolean } {
  const result = spawnSync(command[0] ?? "claude", [...command.slice(1), "--version"], { encoding: "utf8" });
  if (result.status !== 0 && !result.stdout) {
    return { installed: false, version: null, meetsMin: false };
  }
  const version = (result.stdout || result.stderr || "").trim().split("\n")[0] ?? "";
  return {
    installed: true,
    version,
    meetsMin: compareVersions(version, CLAUDE_CAPABILITIES.min_version) >= 0,
  };
}

/** Per-attempt settings. The gate token is NOT written here; the hook header references AGENTOS_GATE_TOKEN. */
export function claudeSettings(gateUrl: string, timeoutSec: number): unknown {
  return {
    disableAllHooks: false,
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "http",
              url: gateUrl,
              headers: { Authorization: "Bearer ${AGENTOS_GATE_TOKEN}" },
              allowedEnvVars: ["AGENTOS_GATE_TOKEN"],
              timeout: timeoutSec,
              onFailure: "block",
            },
          ],
        },
      ],
    },
  };
}

export function claudeSpawnArgs(input: {
  command: string[];
  sessionId: string;
  settingsPath: string;
  model?: string | null;
  maxBudgetUsd?: string | null;
}): string[] {
  const args = [
    ...input.command.slice(1),
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--session-id",
    input.sessionId,
    "--settings",
    input.settingsPath,
    "--permission-prompts",
    "none",
  ];
  if (input.model) args.push("--model", input.model);
  if (input.maxBudgetUsd) args.push("--max-budget-usd", input.maxBudgetUsd);
  return args;
}

export function parseClaudeLine(line: string, byteOffset: number): NormalizedRuntimeEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    return [{ type: "adapter.raw_text", payload: { text: trimmed.slice(0, 2000) }, raw: trimmed, byteOffset }];
  }
  const record = body as {
    type?: string;
    subtype?: string;
    session_id?: string;
    model?: string;
    message?: { content?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }[]; usage?: Usage };
    total_cost_usd?: number;
    usage?: Usage;
    duration_ms?: number;
    num_turns?: number;
    tool_use_id?: string;
    is_error?: boolean;
    content?: string;
  };
  if (record.type === "system" && record.subtype === "init") {
    return [
      {
        type: "attempt.started",
        payload: { session_id: record.session_id ?? null, model: record.model ?? null },
        raw: body,
        byteOffset,
      },
    ];
  }
  if (record.type === "assistant") {
    const events: NormalizedRuntimeEvent[] = [];
    const usage = record.message?.usage;
    if (usage) {
      events.push({ type: "usage.recorded", payload: { usage, incremental: true }, raw: body, byteOffset });
    }
    for (const block of record.message?.content ?? []) {
      if (block.type === "text" && block.text) {
        events.push({ type: "agent.message", payload: { text: block.text }, raw: body, byteOffset });
      } else if (block.type === "tool_use") {
        events.push({
          type: "tool.requested",
          payload: { tool_use_id: block.id, name: block.name, input: block.input },
          raw: body,
          byteOffset,
        });
      }
    }
    return events.length ? events : [{ type: "adapter.unknown", payload: { type: record.type }, raw: body, byteOffset }];
  }
  if (record.type === "user") {
    const blocks = record.message?.content ?? [];
    return blocks
      .filter((block) => block.type === "tool_result" || block.type === undefined)
      .map((block) => ({
        type: "tool.completed",
        payload: {
          tool_use_id: (block as { tool_use_id?: string }).tool_use_id ?? record.tool_use_id,
          is_error: Boolean((block as { is_error?: boolean }).is_error),
          preview: String((block as { content?: string }).content ?? "").slice(0, 500),
        },
        raw: body,
        byteOffset,
      }));
  }
  if (record.type === "result") {
    return [
      {
        type: "attempt.result",
        payload: {
          subtype: record.subtype ?? "unknown",
          duration_ms: record.duration_ms ?? null,
          num_turns: record.num_turns ?? null,
          total_cost_usd: record.total_cost_usd ?? null,
          usage: record.usage ?? null,
        },
        raw: body,
        byteOffset,
      },
    ];
  }
  return [{ type: "adapter.unknown", payload: { type: record.type ?? "unknown" }, raw: body, byteOffset }];
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function isBudgetStop(subtype: string | null | undefined): boolean {
  return subtype === "error_max_budget" || subtype === "error_max_budget_usd" || subtype === "budget_exceeded";
}
