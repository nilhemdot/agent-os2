import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv-draft-04";
import Ajv07 from "ajv";
import addFormats from "ajv-formats";
import { run } from "../src/main.js";
import type { CliIO } from "../src/io.js";

const here = dirname(fileURLToPath(import.meta.url));
export const cliRoot = resolve(here, "..");
export const repoRoot = resolve(cliRoot, "../..");
export const fixtures = join(repoRoot, "fixtures");
export const bundlePath = join(cliRoot, "dist/tripwire.mjs");

/** A unique scratch directory (never inside the repository, never shared between tests). */
export const tmp = (prefix = "tw-cli-"): string => mkdtempSync(join(tmpdir(), prefix));

export interface Harness { io: CliIO; out: () => string; err: () => string; answers: string[] }

export function makeIO(cwd: string, opts: { tty?: boolean; answer?: boolean; env?: Record<string, string | undefined>; home?: string } = {}): Harness {
  let out = ""; let err = "";
  const answers: string[] = [];
  const io: CliIO = {
    cwd, env: opts.env ?? {}, homedir: opts.home ?? "", selfPath: bundlePath,
    stdout: (s) => { out += s; }, stderr: (s) => { err += s; },
    stdoutIsTTY: !!opts.tty, canPrompt: !!opts.tty,
    ask: async (q) => { answers.push(q); return opts.answer ?? false; },
  };
  return { io, out: () => out, err: () => err, answers };
}

export async function cli(args: string[], cwd: string, opts: Parameters<typeof makeIO>[1] = {}) {
  const h = makeIO(cwd, opts);
  const code = await run(args, h.io);
  return { code, out: h.out(), err: h.err(), answers: h.answers };
}

/** Copy a fixture (or any directory) to a scratch directory so tests never write into fixtures/. */
export function copyTo(src: string, dest = tmp()): string {
  cpSync(src, dest, { recursive: true });
  return dest;
}

export function write(root: string, rel: string, text: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

/** Git via the CLI is used by the TEST HARNESS only to build scratch repositories; the product never runs git. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", ...args], {
    cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: join(tmpdir(), "tw-empty-gitconfig"), GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

export function sarifValidator() {
  const schema = JSON.parse(readFileSync(join(repoRoot, "packages/core/test/data/sarif-schema-2.1.0.json"), "utf8"));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const v = ajv.compile(schema);
  return (doc: unknown): string | undefined => (v(doc) ? undefined : JSON.stringify(v.errors?.slice(0, 5)));
}

export function runBundle(args: string[], cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [bundlePath, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Validates a JSON report against docs/report.schema.json (draft-07). Returns an error summary, or undefined when valid. */
export function reportValidator() {
  const schema = JSON.parse(readFileSync(join(repoRoot, "docs/report.schema.json"), "utf8"));
  const ajv = new Ajv07({ strict: false, allErrors: true });
  const v = ajv.compile(schema);
  return (doc: unknown): string | undefined => (v(doc) ? undefined : JSON.stringify(v.errors?.slice(0, 5)));
}
