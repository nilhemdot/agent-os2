#!/usr/bin/env node
// Scripted Codex App Server stand-in (JSON-RPC over stdio).
// Live Codex behavior is NOT verified here.
import { appendFileSync, existsSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";

const args = process.argv.slice(2);
const scenarioPath = process.env.AGENTOS_FAKE_SCENARIO || "";
function scenario() {
  if (scenarioPath && existsSync(scenarioPath)) return JSON.parse(readFileSync(scenarioPath, "utf8"));
  return {};
}

if (args.includes("--version")) {
  process.stdout.write(`${scenario().version || "codex 0.0.0-fake"}\n`);
  process.exit(0);
}

const script = scenario();
const jsonl = args.includes("--jsonl") || script.mode === "jsonl";
if (!jsonl && (script.appServer === false || args.includes("--no-app-server"))) {
  process.stderr.write("codex app server unavailable\n");
  process.exit(2);
}
const rl = readline.createInterface({ input: process.stdin });
const pending = new Map();
let threadId = "thread-fake";

const stdinLog = join(process.cwd(), ".agentos-codex-stdin.jsonl");

function send(message) {
  writeSync(1, `${JSON.stringify(message)}\n`);
}

function note(line) {
  try {
    appendFileSync(stdinLog, `${line}\n`);
  } catch {
    // the worktree may not be writable yet during --version
  }
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

async function runTurn(prompt) {
  let n = 1;
  for (const step of script.steps || []) {
    if (step.kind === "command") {
      const id = 1000 + n++;
      send({
        jsonrpc: "2.0",
        id,
        method: "item/commandExecution/requestApproval",
        params: { threadId, turnId: "turn-1", itemId: `item-${id}`, command: step.command },
      });
      const decision = await new Promise((resolvePromise) => pending.set(id, resolvePromise));
      if (decision === "accept" && step.apply) {
        const { writeFileSync, readFileSync: read, existsSync: exists } = await import("node:fs");
        const { resolve } = await import("node:path");
        for (const edit of step.apply) {
          const path = resolve(process.cwd(), edit.path);
          const current = exists(path) ? read(path, "utf8") : "";
          writeFileSync(path, edit.find != null ? current.replace(edit.find, edit.replace ?? "") : edit.content ?? "");
        }
      }
    } else if (step.kind === "file") {
      const id = 1000 + n++;
      send({
        jsonrpc: "2.0",
        id,
        method: "item/fileChange/requestApproval",
        params: { threadId, turnId: "turn-1", itemId: `item-${id}`, paths: step.paths || [] },
      });
      await new Promise((resolvePromise) => pending.set(id, resolvePromise));
    } else if (step.kind === "raw") {
      send(step.message);
    } else if (step.kind === "ungated") {
      send({
        jsonrpc: "2.0",
        method: "item/completed",
        params: { command: step.command, gated: false, threadId },
      });
    }
  }
  if (script.usage) {
    send({ jsonrpc: "2.0", method: "turn/usage", params: { usage: script.usage } });
  }
  send({
    jsonrpc: "2.0",
    method: "turn/completed",
    params: { usage: script.usage || null, promptBytes: Buffer.byteLength(prompt || "") },
  });
  if (!script.stayAliveMs) process.exit(script.exitCode ?? 0);
  else setTimeout(() => process.exit(script.exitCode ?? 0), script.stayAliveMs);
}

if (jsonl) {
  let prompt = "";
  process.stdin.on("data", (chunk) => {
    prompt += chunk.toString();
  });
  process.stdin.on("end", () => {
    for (const step of script.steps || []) {
      if (step.kind === "ungated" || step.kind === "command") {
        send({ type: "item.completed", command: step.command || "", gated: false });
      }
    }
    send({ type: "result", subtype: "success" });
    process.exit(0);
  });
} else {
  rl.on("line", (line) => {
    if (!line.trim()) return;
    note(line);
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result?.decision || "decline");
      pending.delete(msg.id);
      return;
    }
    if (msg.method === "initialize") {
      reply(msg.id, { protocol: "agentos-fake-codex", userAgent: "codex-fake" });
      return;
    }
    if (msg.method === "thread/start") {
      threadId = "thread-fake";
      reply(msg.id, { threadId, cwd: msg.params?.cwd, sandbox: msg.params?.sandbox || "workspace-write" });
      return;
    }
    if (msg.method === "turn/start") {
      reply(msg.id, { turnId: "turn-1" });
      void runTurn(String(msg.params?.prompt || ""));
      return;
    }
    if (msg.method === "turn/interrupt") {
      reply(msg.id, { interrupted: true });
      process.exit(130);
    }
  });
}
