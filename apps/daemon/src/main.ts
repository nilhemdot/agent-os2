import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentError } from "@agentos/core";
import { ControlPlane } from "./control.ts";
import { createHttpServer } from "./http.ts";

const args = process.argv.slice(2);
const foreground = args.includes("--foreground");
const home = process.env.AGENTOS_HOME || join(homedir(), ".agentos");

if (!foreground) {
  await supervise(home);
} else {
  await serve(home);
}

async function supervise(dataHome: string): Promise<void> {
  const pidFile = join(dataHome, "daemon.pid");
  const existing = readPid(pidFile);
  if (existing && alive(existing)) {
    process.stdout.write(`already running ${existing}\n`);
    process.exit(0);
  }
  const ready = join(dataHome, "daemon.ready");
  const errorFile = join(dataHome, "daemon.error");
  if (existsSync(ready)) unlinkSync(ready);
  if (existsSync(errorFile)) unlinkSync(errorFile);
  const child = spawn(process.execPath, [...process.execArgv, new URL(import.meta.url).pathname, "--foreground"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (existsSync(errorFile)) {
      const error = JSON.parse(readFileSync(errorFile, "utf8"));
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.exit(1);
    }
    if (existsSync(ready)) {
      const info = JSON.parse(readFileSync(ready, "utf8"));
      process.stdout.write(`${info.url}\n`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  process.stderr.write("daemon did not become ready within 3s\n");
  process.exit(1);
}

async function serve(dataHome: string): Promise<void> {
  let plane: ControlPlane;
  try {
    plane = ControlPlane.open({ home: dataHome });
  } catch (error) {
    fail(dataHome, error);
    return;
  }
  const server = createHttpServer(plane, {
    onShutdown: async () => {
      clearInterval(timer);
      server.close();
      plane.close();
      setTimeout(() => process.exit(0), 30);
    },
  });
  const timer = setInterval(() => {
    try {
      plane.tick();
      plane.pulseSse();
    } catch (error) {
      plane.log(`tick ${error instanceof Error ? error.message : error}`);
    }
  }, 1000);
  timer.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(plane.config.daemon.port, "127.0.0.1", () => resolve());
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      fail(dataHome, new AgentError("port_in_use", `Port ${plane.config.daemon.port} is in use. Change daemon.port.`, 1, { port: plane.config.daemon.port, key: "daemon.port" }));
    } else {
      fail(dataHome, error);
    }
    return;
  }
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : plane.config.daemon.port;
  plane.port = port;
  writeFileSync(join(dataHome, "daemon.pid"), String(process.pid), { mode: 0o600 });
  writeFileSync(join(dataHome, "daemon.port"), String(port), { mode: 0o600 });
  const launch = plane.issueLaunchCode();
  const url = launch.url.replace(/:(\d+)/, `:${port}`);
  writeFileSync(join(dataHome, "daemon.ready"), JSON.stringify({ pid: process.pid, port, url }), { mode: 0o600 });
  process.stdout.write(`${url}\n`);
  const stop = (kill: boolean) => {
    plane.accepting = false;
    if (kill) {
      void (async () => {
        for (const mission of plane.listMissions()) {
          for (const attempt of mission.running_attempts as { id: string }[]) await plane.cancelAttempt(attempt.id);
        }
        shutdownFiles(dataHome);
        process.exit(0);
      })();
      return;
    }
    shutdownFiles(dataHome);
    server.close();
    plane.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => stop(false));
  process.on("SIGINT", () => stop(false));
}

function shutdownFiles(dataHome: string): void {
  for (const name of ["daemon.pid", "daemon.ready"]) {
    const file = join(dataHome, name);
    if (existsSync(file)) unlinkSync(file);
  }
}

function fail(dataHome: string, error: unknown): void {
  const agent = error instanceof AgentError ? error : null;
  const body = {
    code: agent?.code ?? "startup_failed",
    message: error instanceof Error ? error.message : String(error),
    details: agent?.details ?? {},
  };
  try {
    writeFileSync(join(dataHome, "daemon.error"), JSON.stringify(body), { mode: 0o600 });
  } catch {
    // home may not exist yet
  }
  process.stderr.write(`${body.code}: ${body.message}\n`);
  process.exit(1);
}

function readPid(file: string): number | null {
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
