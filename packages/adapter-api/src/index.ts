export type PolicyCoverage = "all" | "escalated" | "none";

export interface RuntimeCapabilities {
  start: boolean;
  cancel: "clean" | "kill-only" | "no";
  stream_events: boolean;
  policy_coverage: PolicyCoverage;
  approval_pause: boolean;
  cost: "reported" | "estimated" | "none";
  reattach_after_daemon_restart: boolean;
  evidence: boolean;
  min_version: string;
}

export interface AdapterError {
  code: "not_supported";
  message: string;
}

export function notSupported(operation: string): AdapterError {
  return { code: "not_supported", message: `${operation} is not supported by this adapter` };
}

export const CLAUDE_CAPABILITIES: RuntimeCapabilities = {
  start: true,
  cancel: "clean",
  stream_events: true,
  policy_coverage: "all",
  approval_pause: true,
  cost: "reported",
  reattach_after_daemon_restart: true,
  evidence: true,
  min_version: "2.1.295",
};

export const CODEX_CAPABILITIES: RuntimeCapabilities = {
  start: true,
  cancel: "clean",
  stream_events: true,
  policy_coverage: "escalated",
  approval_pause: true,
  cost: "estimated",
  reattach_after_daemon_restart: false,
  evidence: true,
  min_version: "0.0.0",
};

export interface NormalizedRuntimeEvent {
  type: string;
  payload: Record<string, unknown>;
  raw: unknown;
  byteOffset: number;
}
