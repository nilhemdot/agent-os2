import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = process.env.AGENTOS_HOME || join(homedir(), ".agentos");
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const args = argv.filter((arg) => arg !== "--json");

try {
  const result = await run(args);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (typeof result === "string") process.stdout.write(result.endsWith("\n") ? result : `${result}\n`);
  else if (result != null) process.stdout.write(`${format(result)}\n`);
  process.exit(0);
} catch (error) {
  const coded = error as { code?: string; message?: string; exitCode?: number };
  const code = coded.code || "failed";
  const message = coded.message || String(error);
  if (json) process.stdout.write(`${JSON.stringify({ error: { code, message } })}\n`);
  else process.stderr.write(`${code}: ${message}\n`);
  process.exit(coded.exitCode ?? (code === "daemon_unreachable" ? 2 : code === "invalid_argument" ? 3 : 1));
}

async function run(input: string[]): Promise<unknown> {
  const [group, action, ...rest] = input;
  if (!group || group === "help" || group === "--help") return help();
  if (group === "daemon") return daemon(action, rest);
  if (group === "health") return health();
  if (group === "doctor") return textDoctor(await api("GET", "/doctor"));
  if (group === "ui") return openUi();
  if (group === "repo") return repo(action, rest);
  if (group === "profile") return profile(action, rest);
  if (group === "mission") return mission(action, rest);
  if (group === "task") return task(action, rest);
  if (group === "attempt") return attempt(action, rest);
  if (group === "approvals") return api("GET", `/approvals${rest.includes("--pending") ? "?pending=1" : ""}`);
  if (group === "approve") return api("POST", `/approvals/${must(action, "approval id")}/allow`, { for_attempt: rest.includes("--for-attempt") });
  if (group === "deny") return api("POST", `/approvals/${must(action, "approval id")}/deny`, { reason: flag(rest, "--reason") });
  if (group === "workspace") return workspace(action, rest);
  if (group === "gc") {
    return api("POST", "/gc", {
      older_than: flag(input, "--released-older-than") || "14d",
      yes: input.includes("--yes"),
      dry_run: input.includes("--dry-run") || !input.includes("--yes"),
    });
  }
  if (group === "evidence") return evidence(action, rest);
  if (group === "policy") return policy(action, rest);
  if (group === "adapters") return api("GET", "/adapters");
  if (group === "eval" && action === "run") return api("POST", "/eval", { runtime: flag(rest, "--runtime") || "claude-code" });
  throw invalid(`unknown command ${group}`);
}

async function daemon(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "start") {
    const script = new URL("../../daemon/src/main.ts", import.meta.url).pathname;
    const child = spawnSync(process.execPath, [...process.execArgv, script, ...rest], { encoding: "utf8", env: process.env });
    if (child.status !== 0) throw fail(child.stderr.trim() || child.stdout.trim() || "daemon failed to start", codeFrom(child.stderr));
    return (child.stdout || "").trim();
  }
  if (action === "stop") return stop(rest.includes("--kill-attempts"));
  if (action === "status") return status();
  if (action === "url") {
    const body = (await api("POST", "/daemon/url", {})) as { url: string };
    return body.url;
  }
  throw invalid("usage: agentos daemon start|stop|status|url");
}

async function stop(kill: boolean): Promise<string> {
  const body = await api("POST", "/daemon/shutdown", { kill_attempts: kill });
  return typeof body === "object" ? "stopping" : String(body);
}

function status(): string {
  const pid = readText(join(home, "daemon.pid"));
  if (!pid) throw unreachable();
  return `running ${pid.trim()}`;
}

async function health(): Promise<string> {
  const body = (await api("GET", "/health")) as Record<string, unknown>;
  const lines = ["status", "version", "schema_version", "uptime_s", "db", "running_attempts"].map((key) => `${key}: ${body[key]}`);
  if (body.status !== "ok") throw Object.assign(new Error(lines.join("\n")), { code: "degraded", exitCode: 1 });
  return lines.join("\n");
}

function textDoctor(body: any): string {
  return (body.lines as { name: string; status: string; detail: string }[]).map((line) => `${line.status.padEnd(4)} ${line.name}: ${line.detail}`).join("\n");
}

async function openUi(): Promise<string> {
  const ready = readText(join(home, "daemon.ready"));
  if (!ready) throw unreachable();
  const info = JSON.parse(ready);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawnSync(opener, [info.url], { stdio: "ignore" });
  return info.url;
}

async function repo(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "list") return api("GET", "/repos");
  if (action === "add") {
    return api("POST", "/repos", { path: must(rest[0], "path"), test_command: flag(rest, "--test"), base: flag(rest, "--base") });
  }
  throw invalid("usage: agentos repo add <path> [--test <cmd>] [--base <branch>]");
}

async function profile(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "list") return api("GET", "/profiles");
  if (action === "show") return api("GET", `/profiles/${encodeURIComponent(must(rest[0], "name"))}`);
  if (action === "add") {
    const runtime = flag(rest, "--runtime");
    if (!runtime) throw invalid("--runtime is required");
    return api("POST", "/profiles", {
      name: must(rest[0], "name"),
      runtime,
      model: flag(rest, "--model"),
      tools: (flag(rest, "--tools") || "Read,Edit,Write,Bash,Grep,Glob").split(","),
      allow_ungated: rest.includes("--allow-ungated"),
    });
  }
  if (action === "edit") {
    return api("PATCH", `/profiles/${encodeURIComponent(must(rest[0], "name"))}`, {
      model: flag(rest, "--model"),
      tools: flag(rest, "--tools")?.split(","),
      allow_ungated: rest.includes("--allow-ungated") ? true : undefined,
    });
  }
  throw invalid("usage: agentos profile add|list|show|edit");
}

async function mission(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "create") {
    const title = rest.find((arg) => !arg.startsWith("--"));
    if (!title?.trim()) throw invalid("title is required");
    return api("POST", "/missions", { title, repo: flag(rest, "--repo"), budget: flag(rest, "--budget"), criteria: flags(rest, "--criteria"), objective: flag(rest, "--objective") });
  }
  if (action === "list") {
    const body = (await api("GET", "/missions")) as { missions: any[] };
    if (json) return body;
    return body.missions
      .map((item) => `${item.id}  ${item.display_state || item.state}  ${item.title}  spent ${item.spent_usd}/${item.budget_usd ?? "-"}`)
      .join("\n");
  }
  if (action === "show") return api("GET", `/missions/${must(rest[0], "id")}`);
  if (action === "start") return api("POST", `/missions/${must(rest[0], "id")}/start`);
  if (action === "cancel") return api("POST", `/missions/${must(rest[0], "id")}/cancel`);
  if (action === "archive") return api("POST", `/missions/${must(rest[0], "id")}/archive`);
  throw invalid("usage: agentos mission create|list|show|start|cancel|archive");
}

async function task(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "add") {
    return api("POST", `/missions/${must(rest[0], "mission")}/tasks`, {
      title: must(rest[1], "title"),
      profile: flag(rest, "--profile"),
      after: flags(rest, "--after"),
      description: flag(rest, "--description"),
      no_verify: rest.includes("--no-verify"),
    });
  }
  if (action === "list") return api("GET", `/missions/${must(rest[0], "mission")}/tasks`);
  throw invalid("usage: agentos task add <mission> <title>");
}

async function attempt(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "start") return api("POST", `/tasks/${must(rest[0], "task")}/attempts`, { profile: flag(rest, "--profile"), parallel: rest.includes("--parallel") });
  if (action === "cancel") return api("POST", `/attempts/${must(rest[0], "id")}/cancel`, { reason: flag(rest, "--reason") });
  if (action === "show") return api("GET", `/attempts/${must(rest[0], "id")}`);
  if (action === "accept") return api("POST", `/attempts/${must(rest[0], "id")}/accept`, { override: flag(rest, "--override") });
  if (action === "reject") return api("POST", `/attempts/${must(rest[0], "id")}/reject`, { reason: flag(rest, "--reason") || "" });
  if (action === "merge") return api("POST", `/attempts/${must(rest[0], "id")}/merge`);
  if (action === "list") throw invalid("list attempts from agentos mission show");
  throw invalid("usage: agentos attempt start|cancel|show|accept|reject|merge");
}

async function workspace(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "list") return api("GET", "/workspaces");
  if (action === "release") return api("POST", `/workspaces/${must(rest[0], "id")}/release`);
  if (action === "remove") return api("POST", `/workspaces/${must(rest[0], "id")}/remove`, { force: rest.includes("--force"), delete_branch: rest.includes("--delete-branch") });
  throw invalid("usage: agentos workspace list|release|remove");
}

async function evidence(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "show") return api("GET", `/attempts/${must(rest[0], "attempt")}/evidence`);
  if (action === "export") {
    return api("POST", `/attempts/${must(rest[0], "attempt")}/evidence/export`, { out: flag(rest, "--out"), redact: rest.includes("--redact") });
  }
  throw invalid("usage: agentos evidence show|export <attempt>");
}

async function policy(action: string | undefined, rest: string[]): Promise<unknown> {
  if (action === "show" || !action) return api("GET", "/policy");
  if (action === "lint") return api("GET", "/policy/lint");
  if (action === "check") {
    return api("POST", "/policy/check", { tool: flag(rest, "--tool"), arg: flag(rest, "--arg") || "", profile: flag(rest, "--profile"), repo: flag(rest, "--repo") });
  }
  throw invalid("usage: agentos policy check|lint|show");
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const port = Number(readText(join(home, "daemon.port")) || 7787);
  const token = readText(join(home, "daemon.token"));
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token.trim()}` } : {}),
        ...(body != null ? { "content-type": "application/json" } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw unreachable();
  }
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = parsed.error || { code: "failed", message: text };
    throw Object.assign(new Error(error.message), { code: error.code, exitCode: response.status === 400 && error.code === "invalid_argument" ? 3 : 1 });
  }
  return parsed;
}

function unreachable(): Error {
  return Object.assign(new Error("daemon not running; start it with `agentos daemon start`"), { code: "daemon_unreachable", exitCode: 2 });
}

function invalid(message: string): Error {
  return Object.assign(new Error(message), { code: "invalid_argument", exitCode: 3 });
}

function fail(message: string, code: string): Error {
  return Object.assign(new Error(message), { code, exitCode: 1 });
}

function codeFrom(text: string): string {
  const match = /^([a-z0-9_]+):/.exec(text.trim());
  return match?.[1] || "startup_failed";
}

function must(value: string | undefined, name: string): string {
  if (!value || value.startsWith("--")) throw invalid(`${name} is required`);
  return value;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function flags(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) values.push(args[++i]);
  return values;
}

function readText(file: string): string | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

function format(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function help(): string {
  return `agentos — local control plane

  daemon start|stop|status|url
  health
  doctor
  mission create|list|show|start|cancel|archive
  task add|list
  attempt start|cancel|show|accept|reject|merge
  approvals | approve | deny
  repo add|list
  profile add|list|show|edit
  workspace list|release|remove
  evidence show|export
  policy check|lint|show
  adapters
  eval run
  gc
  ui
`;
}
