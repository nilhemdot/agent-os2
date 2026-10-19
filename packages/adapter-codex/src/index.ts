import { CODEX_CAPABILITIES, notSupported, type NormalizedRuntimeEvent, type RuntimeCapabilities } from "@agentos/adapter-api";
import { spawnSync } from "node:child_process";

export function codexCapabilities(): RuntimeCapabilities {
  return { ...CODEX_CAPABILITIES };
}

export function codexCommand(configCommand: string[] | undefined): string[] {
  return configCommand?.length ? configCommand : ["codex"];
}

export function checkCodex(command: string[]): { installed: boolean; version: string | null; meetsMin: boolean } {
  const result = spawnSync(command[0] ?? "codex", [...command.slice(1), "--version"], { encoding: "utf8" });
  if (result.error || (result.status !== 0 && !result.stdout)) {
    return { installed: false, version: null, meetsMin: false };
  }
  const version = (result.stdout || "").trim().split("\n")[0] ?? "";
  return { installed: Boolean(version), version: version || null, meetsMin: true };
}

export function codexNotSupported(operation: string) {
  return notSupported(operation);
}

/** Lines the fake/app-server speaks. Method names are an interoperability assumption until M4 live checks. */
export interface CodexApprovalRequest {
  id: number;
  kind: "command" | "file";
  command?: string;
  paths?: string[];
  threadId?: string;
  turnId?: string;
  itemId?: string;
}

export function parseCodexLine(line: string): { approval?: CodexApprovalRequest; event?: NormalizedRuntimeEvent; result?: unknown } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let body: {
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: { message?: string };
  };
  try {
    body = JSON.parse(trimmed);
  } catch {
    return { event: { type: "adapter.raw_text", payload: { text: trimmed.slice(0, 2000) }, raw: trimmed, byteOffset: 0 } };
  }
  if (body.method === "item/commandExecution/requestApproval") {
    return {
      approval: {
        id: Number(body.id),
        kind: "command",
        command: String(body.params?.command ?? ""),
        threadId: String(body.params?.threadId ?? ""),
        turnId: String(body.params?.turnId ?? ""),
        itemId: String(body.params?.itemId ?? ""),
      },
    };
  }
  if (body.method === "item/fileChange/requestApproval") {
    return {
      approval: {
        id: Number(body.id),
        kind: "file",
        paths: (body.params?.paths as string[]) ?? [],
        threadId: String(body.params?.threadId ?? ""),
        turnId: String(body.params?.turnId ?? ""),
        itemId: String(body.params?.itemId ?? ""),
      },
    };
  }
  if (body.method === "item/completed") {
    return {
      event: {
        type: "tool.completed",
        payload: {
          gated: body.params?.gated === false ? false : true,
          command: body.params?.command ?? null,
          paths: body.params?.paths ?? null,
        },
        raw: body,
        byteOffset: 0,
      },
    };
  }
  if (body.method === "turn/completed") {
    return {
      event: {
        type: "attempt.result",
        payload: { subtype: "success", usage: body.params?.usage ?? null, estimated: true },
        raw: body,
        byteOffset: 0,
      },
    };
  }
  if (body.method === "turn/usage") {
    return {
      event: {
        type: "usage.recorded",
        payload: { usage: body.params?.usage ?? null, incremental: true, estimated: true },
        raw: body,
        byteOffset: 0,
      },
    };
  }
  return { event: { type: "adapter.unknown", payload: { method: body.method ?? "message" }, raw: body, byteOffset: 0 } };
}

export function codexDecision(id: number, decision: "accept" | "decline" | "cancel"): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result: { decision } }) + "\n";
}
