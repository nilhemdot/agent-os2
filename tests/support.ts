import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlane } from "../apps/daemon/src/control.ts";
import { createHttpServer } from "../apps/daemon/src/http.ts";
import { delay } from "../apps/daemon/src/control.ts";

export const ROOT = new URL("..", import.meta.url).pathname;
export const FAKE_CLAUDE = join(ROOT, "fixtures/fake-runtimes/fake-claude.mjs");
export const FAKE_CODEX = join(ROOT, "fixtures/fake-runtimes/fake-codex.mjs");

export interface Boot {
  plane: ControlPlane;
  home: string;
  port: number;
  base: string;
  api: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; headers: Headers }>;
  stop: () => Promise<void>;
}

export async function boot(opts: { scenario?: string; codexScenario?: string; config?: Record<string, unknown>; clock?: { now(): number } } = {}): Promise<Boot> {
  const home = mkdtempSync(join(tmpdir(), "agentos-"));
  const plane = ControlPlane.open({
    home,
    clock: opts.clock as any,
    config: {
      notifications: { desktop: false },
      ui: { open_browser_on_start: false },
      runtimes: {
        "claude-code": { command: [process.execPath, FAKE_CLAUDE], scenario: opts.scenario },
        codex: { command: [process.execPath, FAKE_CODEX], scenario: opts.codexScenario },
      },
      ...(opts.config ?? {}),
    },
  });
  const server = createHttpServer(plane);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  plane.port = port;
  const token = plane.token();
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {}, headers: response.headers };
  };
  return {
    plane,
    home,
    port,
    base: `http://127.0.0.1:${port}`,
    api,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      plane.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

export function initRepo(source = join(ROOT, "fixtures/sample-repo")): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-repo-"));
  cpSync(source, dir, { recursive: true });
  const git = (args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@localhost"]);
  git(["config", "user.name", "Test"]);
  git(["add", "-A"]);
  const commit = git(["commit", "-m", "init"]);
  if (commit.status !== 0) throw new Error(commit.stderr || commit.stdout);
  return dir;
}

const cliArgs = (args: string[]) => [
  "--experimental-strip-types",
  "--experimental-sqlite",
  "--disable-warning=ExperimentalWarning",
  join(ROOT, "apps/cli/src/main.ts"),
  ...args,
];

export function cli(home: string, args: string[]) {
  return spawnSync(process.execPath, cliArgs(args), {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, AGENTOS_HOME: home },
    timeout: 15000,
  });
}

/** Async spawn so an in-process daemon can answer while the CLI runs. */
export function cliAsync(home: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs(args), { cwd: ROOT, env: { ...process.env, AGENTOS_HOME: home } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 8000): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < ms) {
    const value = await fn();
    if (value) return value;
    last = value;
    await delay(25);
  }
  throw new Error(`timed out waiting; last=${JSON.stringify(last)}`);
}

export async function listen(port: number): Promise<{ close: () => Promise<void> }> {
  const server = createServer((_req, res) => {
    res.writeHead(200);
    res.end("busy");
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  return { close: () => new Promise((resolve) => server.close(() => resolve())) };
}
