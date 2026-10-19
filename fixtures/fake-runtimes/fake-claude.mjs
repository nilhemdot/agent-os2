#!/usr/bin/env node
// Scripted Claude Code stand-in. Speaks the flag set and hook shape AgentOS uses.
// Live Claude Code behavior is NOT verified here.
import { readFileSync, writeFileSync, existsSync, writeSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const scenarioPath = process.env.AGENTOS_FAKE_SCENARIO || "";

function scenario() {
  if (process.env.AGENTOS_FAKE_VERSION && args.includes("--version")) {
    return { version: process.env.AGENTOS_FAKE_VERSION };
  }
  if (scenarioPath && existsSync(scenarioPath)) return JSON.parse(readFileSync(scenarioPath, "utf8"));
  return {};
}

if (args.includes("--version")) {
  process.stdout.write(`${scenario().version || process.env.AGENTOS_FAKE_VERSION || "2.1.295"}\n`);
  process.exit(0);
}

const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const sessionId = flag("--session-id") || "fake-session";
const settingsPath = flag("--settings");
const model = flag("--model");
const budget = flag("--max-budget-usd");
const script = scenario();

function emit(obj) {
  writeSync(1, `${JSON.stringify(obj)}\n`);
}

function readStdin() {
  return new Promise((resolvePromise) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    process.stdin.resume();
  });
}

function loadHook() {
  if (!settingsPath) return null;
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  const hook = settings.hooks?.PreToolUse?.[0]?.hooks?.[0];
  if (!hook) return null;
  const token = process.env.AGENTOS_GATE_TOKEN || "";
  const header = String(hook.headers?.Authorization || "").replace("${AGENTOS_GATE_TOKEN}", token);
  return { url: hook.url, authorization: header, onFailure: hook.onFailure || "block" };
}

async function postGate(hook, payload) {
  const response = await fetch(hook.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: hook.authorization },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) return { allow: false, reason: `http ${response.status}` };
  if (!text.trim()) return { allow: false, reason: "empty" };
  const body = JSON.parse(text);
  const decision = body.hookSpecificOutput?.permissionDecision || body.decision;
  return { allow: decision === "allow", reason: body.hookSpecificOutput?.permissionDecisionReason || body.reason || "" };
}

function applyEdits(edits) {
  for (const edit of edits || []) {
    const path = resolve(process.cwd(), edit.path);
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    const next = edit.find != null ? current.replace(edit.find, edit.replace ?? "") : edit.content ?? "";
    writeFileSync(path, next);
  }
}

process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const stdinPromise = readStdin();
emit({ type: "system", subtype: "init", session_id: sessionId, model: model || script.model || "fake-claude" });

if (script.budgetStop && budget) {
  emit({
    type: "result",
    subtype: "error_max_budget_usd",
    total_cost_usd: Number(budget),
    usage: script.usage || { input_tokens: 1, output_tokens: 1 },
    num_turns: 1,
    duration_ms: 5,
  });
  process.exit(0);
}

await stdinPromise;
const hook = loadHook();
let toolSeq = 0;
for (const step of script.steps || []) {
  if (step.kind === "pauseMs") {
    await new Promise((r) => setTimeout(r, step.ms || 200));
    continue;
  }
  if (step.kind === "text") {
    const message = { type: "assistant", message: { content: [{ type: "text", text: step.text || "" }] } };
    if (step.usage) message.message.usage = step.usage;
    emit(message);
    continue;
  }
  if (step.kind === "tool") {
    toolSeq += 1;
    const id = step.id || `toolu_${toolSeq}`;
    const input = step.input || {};
    let allowed = true;
    let reason = "";
    if (!step.skipGate) {
      if (!hook) {
        allowed = false;
        reason = "no hook";
      } else {
        try {
          const decision = await postGate(hook, {
            hook_event_name: "PreToolUse",
            tool_name: step.name,
            tool_input: input,
            tool_use_id: id,
            session_id: sessionId,
            cwd: process.cwd(),
          });
          allowed = decision.allow;
          reason = decision.reason;
        } catch (error) {
          allowed = hook.onFailure === "block" ? false : true;
          reason = `hook error: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    }
    emit({
      type: "assistant",
      message: { content: [{ type: "tool_use", id, name: step.name, input }] },
    });
    if (allowed) applyEdits(step.apply);
    emit({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            is_error: !allowed,
            content: allowed ? "ok" : `Blocked by AgentOS: ${reason}`,
          },
        ],
      },
    });
  }
}

if (script.stayAliveMs) await new Promise((r) => setTimeout(r, script.stayAliveMs));

const usage = script.usage || { input_tokens: 12, output_tokens: 6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
emit({
  type: "result",
  subtype: script.resultSubtype || "success",
  total_cost_usd: script.total_cost_usd ?? 0.001,
  usage,
  num_turns: toolSeq || 1,
  duration_ms: script.duration_ms ?? 20,
});
process.exit(script.exitCode ?? 0);
