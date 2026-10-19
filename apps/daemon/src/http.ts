import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { AgentError, sha256Hex } from "@agentos/core";
import { readBlob } from "@agentos/evidence";
import type { ControlPlane } from "./control.ts";

const API = new Set([
  "health",
  "auth",
  "repos",
  "profiles",
  "missions",
  "tasks",
  "attempts",
  "approvals",
  "workspaces",
  "evidence",
  "adapters",
  "policy",
  "events",
  "gate",
  "doctor",
  "gc",
  "eval",
  "daemon",
]);

export interface HttpOptions {
  webRoot?: string;
  onShutdown?: (killAttempts: boolean) => void | Promise<void>;
}

export function createHttpServer(plane: ControlPlane, options: HttpOptions = {}): Server {
  const webRoot = options.webRoot ?? join(repoRoot(), "apps", "web", "dist");
  const server = createServer((req, res) => {
    void handle(plane, req, res, webRoot, options).catch((error) => {
      if (error instanceof AgentError) {
        send(res, error.status, { error: { code: error.code, message: error.message, details: error.details } });
        return;
      }
      const id = sha256Hex(`${Date.now()}:${Math.random()}`).slice(0, 12);
      plane.log(`request ${id} ${error instanceof Error ? error.stack : error}`);
      send(res, 500, { error: { code: "internal", message: "Internal error", details: { request_id: id } } });
    });
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
  return server;
}

async function handle(plane: ControlPlane, req: IncomingMessage, res: ServerResponse, webRoot: string, options: HttpOptions): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const port = plane.port || plane.config.daemon.port;
  const host = String(req.headers.host || "");
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    send(res, 421, { error: { code: "bad_host", message: "Host must be loopback", details: {} } });
    return;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const head = parts[0] || "";
  if (!head || !API.has(head)) {
    serveStatic(req, res, webRoot, url.pathname);
    return;
  }
  if (head === "health" && req.method === "GET") {
    send(res, 200, plane.health());
    return;
  }
  if (head === "auth" && req.method === "GET") {
    const code = url.searchParams.get("code") || "";
    if (!plane.consumeLaunchCode(code)) {
      send(res, 401, { error: { code: "unauthorized", message: "Launch code is invalid or expired", details: {} } });
      return;
    }
    res.writeHead(302, {
      location: "/",
      "set-cookie": `agentos_session=${plane.token()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
    });
    res.end();
    return;
  }
  if (head === "gate" && parts[1] === "claude" && parts[2] && req.method === "POST") {
    const attempt = plane.attempt(parts[2]);
    const presented = bearer(req);
    if (!attempt || !presented || presented !== attempt.gate_token) {
      send(res, 401, { error: { code: "unauthorized", message: "Gate token rejected", details: {} } });
      return;
    }
    const body = await readBody(req);
    const decision = await plane.gateClaude(parts[2], body, Date.now());
    if (decision == null) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("");
      return;
    }
    send(res, 200, decision);
    return;
  }
  if (head === "events" && parts[1] === "stream" && req.method === "GET") {
    if (!authorized(plane, req)) {
      send(res, 401, { error: { code: "unauthorized", message: "Bearer token required", details: {} } });
      return;
    }
    plane.subscribe(res, {
      last: Number(req.headers["last-event-id"] || url.searchParams.get("last") || 0),
      missionId: url.searchParams.get("mission_id") || undefined,
      attemptId: url.searchParams.get("attempt_id") || undefined,
    });
    return;
  }
  if (!authorized(plane, req)) {
    send(res, 401, { error: { code: "unauthorized", message: "Bearer token required", details: {} } });
    return;
  }
  if (isWrite(req.method) && req.headers.origin) {
    const origin = String(req.headers.origin);
    if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
      send(res, 403, { error: { code: "bad_origin", message: "Origin is not this daemon", details: {} } });
      return;
    }
  }
  const body = isWrite(req.method) ? await readBody(req) : {};
  const idem = req.headers["idempotency-key"] ? String(req.headers["idempotency-key"]) : undefined;
  const requestHash = sha256Hex(`${req.method} ${url.pathname}?${url.searchParams.toString()}\n${JSON.stringify(body)}`);
  if (idem && isWrite(req.method)) {
    const prior = plane.idempotency(idem, requestHash, 0, "", true);
    if (prior.hit) {
      res.writeHead(prior.status ?? 200, { "content-type": "application/json" });
      res.end(prior.body);
      return;
    }
  }
  const result = await dispatch(plane, req.method || "GET", parts, url, body);
  const encoded = JSON.stringify(result.body);
  if (idem && isWrite(req.method) && result.status < 500) plane.idempotency(idem, requestHash, result.status, encoded, false);
  send(res, result.status, result.body);
  if (result.shutdown) {
    const pid = join(plane.home, "daemon.pid");
    if (existsSync(pid)) unlinkSync(pid);
    await options.onShutdown?.(Boolean(body.kill_attempts));
  }
}

async function dispatch(plane: ControlPlane, method: string, parts: string[], url: URL, body: any): Promise<{ status: number; body: unknown; shutdown?: boolean }> {
  const [head, a, b, c] = parts;
  if (head === "daemon" && a === "url" && method === "POST") {
    const launch = plane.issueLaunchCode();
    return { status: 200, body: { url: launch.url } };
  }
  if (head === "daemon" && a === "shutdown" && method === "POST") {
    plane.accepting = false;
    if (body.kill_attempts) {
      const ids = new Set<string>();
      for (const mission of plane.listMissions()) {
        for (const attempt of mission.running_attempts as { id: string }[]) ids.add(attempt.id);
      }
      for (const id of ids) await plane.cancelAttempt(id);
    }
    return { status: 200, body: { status: "stopping" }, shutdown: true };
  }
  if (head === "doctor" && method === "GET") return { status: 200, body: plane.doctor() };
  if (head === "gc" && method === "POST") {
    const older = body.older_than_ms != null ? Number(body.older_than_ms) : parseDuration(String(body.older_than || "14d"));
    return { status: 200, body: plane.gc({ olderThanMs: older, yes: Boolean(body.yes), dryRun: body.dry_run !== false && !body.yes }) };
  }
  if (head === "eval" && method === "POST") return { status: 200, body: await plane.runEval(String(body.runtime || "claude-code")) };
  if (head === "repos" && method === "GET") return { status: 200, body: { repos: plane.listRepos() } };
  if (head === "repos" && method === "POST") return { status: 201, body: plane.addRepo(body.path, body.test_command, body.base) };
  if (head === "profiles" && method === "GET" && !a) return { status: 200, body: { profiles: plane.listProfiles() } };
  if (head === "profiles" && method === "POST") {
    return {
      status: 201,
      body: plane.addProfile({
        name: body.name,
        runtime: body.runtime,
        model: body.model,
        tools: body.tools ?? ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
        overlay: body.overlay,
        budget: body.budget,
        allowUngated: Boolean(body.allow_ungated),
      }),
    };
  }
  if (head === "profiles" && a && method === "GET") {
    const profile = plane.listProfiles().find((item) => item.name === decodeURIComponent(a) || item.id === a);
    if (!profile) throw new AgentError("not_found", "Profile not found", 404);
    return { status: 200, body: profile };
  }
  if (head === "profiles" && a && method === "PATCH") {
    return {
      status: 200,
      body: plane.updateProfile(decodeURIComponent(a), {
        model: body.model,
        tools: body.tools,
        overlay: body.overlay,
        budget: body.budget,
        allowUngated: body.allow_ungated,
      }),
    };
  }
  if (head === "missions" && method === "GET" && !a) return { status: 200, body: { missions: plane.listMissions() } };
  if (head === "missions" && method === "POST" && !a) {
    return { status: 201, body: plane.createMission({ title: body.title, repo: body.repo, budget: body.budget, criteria: body.criteria, objective: body.objective }) };
  }
  if (head === "missions" && a && method === "GET" && !b) return { status: 200, body: plane.missionView(a) };
  if (head === "missions" && a && method === "PATCH") return { status: 200, body: plane.updateMission(a, body) };
  if (head === "missions" && a && b === "start" && method === "POST") return { status: 200, body: plane.startMission(a) };
  if (head === "missions" && a && b === "cancel" && method === "POST") return { status: 200, body: await plane.cancelMission(a) };
  if (head === "missions" && a && b === "archive" && method === "POST") return { status: 200, body: plane.archiveMission(a) };
  if (head === "missions" && a && method === "DELETE") throw new AgentError("not_supported", "Missions are archived, never deleted", 405);
  if (head === "missions" && a && b === "tasks" && method === "GET") return { status: 200, body: { tasks: plane.listTasks(a) } };
  if (head === "missions" && a && b === "tasks" && method === "POST") {
    return { status: 201, body: plane.addTask(a, body.title, { profile: body.profile, after: body.after, description: body.description, noVerify: Boolean(body.no_verify) }) };
  }
  if (head === "tasks" && a && b === "state" && method === "POST") return { status: 200, body: plane.requestTaskState(a, body.state) };
  if (head === "tasks" && a && b === "deps" && method === "POST") return { status: 200, body: plane.addDependency(a, body.depends_on) };
  if (head === "tasks" && a && b === "attempts" && method === "POST") {
    return { status: 201, body: await plane.startAttempt(a, { profile: body.profile, parallel: Boolean(body.parallel) }) };
  }
  if (head === "attempts" && a && method === "GET" && !b) return { status: 200, body: plane.attemptView(a) };
  if (head === "attempts" && a && b === "cancel" && method === "POST") return { status: 200, body: await plane.cancelAttempt(a, body.reason) };
  if (head === "attempts" && a && b === "accept" && method === "POST") return { status: 200, body: plane.acceptAttempt(a, body.override) };
  if (head === "attempts" && a && b === "reject" && method === "POST") return { status: 200, body: plane.rejectAttempt(a, body.reason || "") };
  if (head === "attempts" && a && b === "merge" && method === "POST") return { status: 200, body: plane.mergeAttempt(a) };
  if (head === "attempts" && a && b === "events" && method === "GET") {
    return {
      status: 200,
      body: { events: plane.events(a, Number(url.searchParams.get("after") || 0), Number(url.searchParams.get("limit") || 50), url.searchParams.get("raw") === "1") },
    };
  }
  if (head === "attempts" && a && b === "evidence" && method === "GET") return { status: 200, body: plane.evidenceList(a) };
  if (head === "attempts" && a && b === "evidence" && c === "export" && method === "POST") {
    const out = body.out || join(plane.home, "logs", `${a}.tar.gz`);
    return { status: 200, body: { path: plane.exportEvidence(a, out, Boolean(body.redact)) } };
  }
  if (head === "approvals" && method === "GET" && !a) {
    const reveal = url.searchParams.get("reveal");
    return { status: 200, body: { approvals: plane.listApprovals(url.searchParams.get("pending") === "1", reveal) } };
  }
  if (head === "approvals" && a && b === "allow" && method === "POST") {
    return { status: 200, body: plane.decideApproval(a, "allow", { actor: body.actor || "user", forAttempt: Boolean(body.for_attempt), reason: body.reason }) };
  }
  if (head === "approvals" && a && b === "deny" && method === "POST") {
    return { status: 200, body: plane.decideApproval(a, "deny", { actor: body.actor || "user", reason: body.reason }) };
  }
  if (head === "workspaces" && method === "GET") return { status: 200, body: { workspaces: plane.listWorkspaces() } };
  if (head === "workspaces" && a && b === "release" && method === "POST") return { status: 200, body: plane.releaseWorkspace(a) };
  if (head === "workspaces" && a && b === "remove" && method === "POST") {
    return { status: 200, body: plane.removeWorkspace(a, { force: Boolean(body.force), deleteBranch: Boolean(body.delete_branch) }) };
  }
  if (head === "evidence" && a && b === "content" && method === "GET") {
    const row = plane.evidenceById(a);
    return { status: 200, body: { sha256: row.sha256, media_type: row.media_type, kind: row.kind, text: readBlob(plane.home, row.sha256).toString("utf8") } };
  }
  if (head === "adapters" && method === "GET") return { status: 200, body: { adapters: plane.adapters(), explanations: CAPABILITY_EXPLANATIONS } };
  if (head === "policy" && a === "check" && method === "POST") {
    return { status: 200, body: plane.policyCheck(body.tool, body.arg ?? "", { profile: body.profile, repo: body.repo }) };
  }
  if (head === "policy" && a === "lint" && method === "GET") {
    return { status: 200, body: { warnings: plane.policyLint(), error: plane.policyDocs.error ?? null, hash: plane.effectiveHash() } };
  }
  if (head === "policy" && method === "GET") {
    const file = join(plane.home, "policy", "global.yaml");
    return { status: 200, body: { yaml: existsSync(file) ? readFileSync(file, "utf8") : "", error: plane.policyDocs.error ?? null, hash: plane.effectiveHash() } };
  }
  throw new AgentError("not_found", "No such route", 404);
}

const CAPABILITY_EXPLANATIONS: Record<string, string> = {
  start: "Whether AgentOS can spawn this runtime in a leased worktree.",
  cancel: "How a running attempt is stopped: a clean signal, kill only, or not at all.",
  stream_events: "Whether the runtime's output becomes a timeline.",
  policy_coverage: "all means every tool call is gated; escalated means only calls the runtime asks about; none means ungated.",
  approval_pause: "Whether an ask decision can hold the call until you answer.",
  cost: "reported by the runtime, estimated from a price table, or unknown.",
  reattach_after_daemon_restart: "Whether a daemon crash can resume watching the same process.",
  evidence: "Whether AgentOS can collect a diff and transcript after the attempt.",
};

function serveStatic(req: IncomingMessage, res: ServerResponse, webRoot: string, pathname: string): void {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(webRoot, rel));
  if (!file.startsWith(normalize(webRoot))) {
    send(res, 403, { error: { code: "forbidden", message: "Path rejected", details: {} } });
    return;
  }
  const target = existsSync(file) && statSync(file).isFile() ? file : join(webRoot, "index.html");
  if (!existsSync(target)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>AgentOS</title><p>Mission Control is not built. Run <code>npm run build:web</code>.</p>");
    return;
  }
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  };
  res.writeHead(200, { "content-type": types[extname(target)] || "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(target).pipe(res);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    connection: "close",
  });
  res.end(json);
}

function bearer(req: IncomingMessage): string {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  return match ? match[1].trim() : "";
}

function cookieToken(req: IncomingMessage): string {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "agentos_session") return rest.join("=");
  }
  return "";
}

function authorized(plane: ControlPlane, req: IncomingMessage): boolean {
  const token = plane.token();
  return bearer(req) === token || cookieToken(req) === token;
}

function isWrite(method: string | undefined): boolean {
  return method !== "GET" && method !== "HEAD";
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new AgentError("invalid_argument", "Request body is not JSON", 400));
      }
    });
    req.on("error", reject);
  });
}

function parseDuration(text: string): number {
  const match = /^(\d+)([smhd])$/.exec(text.trim());
  if (!match) return 14 * 86400000;
  const n = Number(match[1]);
  const unit = match[2] === "s" ? 1000 : match[2] === "m" ? 60000 : match[2] === "h" ? 3600000 : 86400000;
  return n * unit;
}

function repoRoot(): string {
  return new URL("../../../", import.meta.url).pathname;
}
