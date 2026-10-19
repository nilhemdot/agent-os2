import { chmodSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "@agentos/core";
import { maskSecrets } from "@agentos/core";

export function writeBlob(home: string, bytes: Buffer | string): { sha256: string; size: number } {
  const buf = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  const sha256 = sha256Hex(buf);
  const dir = join(home, "blobs", sha256.slice(0, 2));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(join(home, "blobs"), 0o700);
  const file = join(dir, sha256);
  if (!existsSync(file)) {
    writeFileSync(file, buf, { mode: 0o444 });
  }
  chmodSync(file, 0o444);
  chmodSync(dir, 0o700);
  return { sha256, size: buf.length };
}

export function readBlob(home: string, sha256: string): Buffer {
  return readFileSync(join(home, "blobs", sha256.slice(0, 2), sha256));
}

export function blobMatches(home: string, sha256: string): boolean {
  try {
    const bytes = readBlob(home, sha256);
    return sha256Hex(bytes) === sha256;
  } catch {
    return false;
  }
}

export interface EvidenceSummaryInput {
  missionTitle: string;
  taskTitle: string;
  runtime: string;
  model: string | null;
  branch: string;
  baseCommit: string;
  diffStat: string;
  checks: { name: string; passed: boolean; detail?: string }[];
  approvals: { state: string; tool: string; preview: string }[];
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costLabel: string;
  duration: string;
  gating: string;
  worktree: string;
  transcript: string;
}

export function renderEvidenceMd(input: EvidenceSummaryInput): string {
  const checks = input.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`).join("\n");
  const approvals = input.approvals
    .map((approval) => `- ${approval.state} ${approval.tool}: ${maskSecrets(approval.preview)}`)
    .join("\n");
  return maskSecrets(`# Evidence pack

- Mission: ${input.missionTitle}
- Task: ${input.taskTitle}
- Runtime: ${input.runtime}${input.model ? ` (${input.model})` : ""}
- Branch: ${input.branch}
- Base: ${input.baseCommit}
- Gating: ${input.gating}
- Duration: ${input.duration}
- Worktree: ${input.worktree}
- Transcript: ${input.transcript}

## Diff stat

\`\`\`
${input.diffStat || "(no committed diff)"}
\`\`\`

## Verification

${checks || "- (none)"}

## Approvals

${approvals || "- (none)"}

## Cost

${input.costLabel}

Tokens: in ${input.tokens.input}, out ${input.tokens.output}, cache read ${input.tokens.cacheRead}, cache write ${input.tokens.cacheWrite}
`);
}

export function countJunit(xml: string): { tests: number; failures: number } {
  const tests = Number(/tests="(\d+)"/.exec(xml)?.[1] ?? 0);
  const failures = Number(/failures="(\d+)"/.exec(xml)?.[1] ?? 0) + Number(/errors="(\d+)"/.exec(xml)?.[1] ?? 0);
  return { tests, failures };
}

export function ensureDir(path: string, mode = 0o700): void {
  mkdirSync(path, { recursive: true, mode });
  chmodSync(path, mode);
}

export function writeSecret(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}
