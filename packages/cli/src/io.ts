import { createInterface } from "node:readline";

export interface CliIO {
  cwd: string;
  env: Record<string, string | undefined>;
  homedir: string;
  /** absolute path of the running bundle (written into git hooks) */
  selfPath: string;
  stdout(s: string): void;
  stderr(s: string): void;
  stdoutIsTTY: boolean;
  /** True when a person can answer a prompt (stdin and stderr are terminals). */
  canPrompt: boolean;
  /** Ask a yes/no question (default no). Only called when canPrompt is true. */
  ask(question: string): Promise<boolean>;
}

/** Thrown for tool errors: exit code 2 and one line on stderr. */
export class CliError extends Error {}

export function processIO(): CliIO {
  const canPrompt = !!process.stdin.isTTY && !!process.stderr.isTTY;
  return {
    cwd: process.cwd(),
    env: process.env,
    homedir: process.env.USERPROFILE || process.env.HOME || "",
    selfPath: process.argv[1] ?? "",
    stdout: (s) => { process.stdout.write(s); },
    stderr: (s) => { process.stderr.write(s); },
    stdoutIsTTY: !!process.stdout.isTTY,
    canPrompt,
    ask: (q) => new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(q + " [y/N] ", (ans) => { rl.close(); resolve(/^y(es)?$/i.test(ans.trim())); });
    }),
  };
}

/**
 * Explicit confirmation for anything that writes a file the user did not name. `--yes` confirms non-interactively;
 * otherwise a person must answer on a terminal. Without either, the answer is no.
 */
export async function confirm(io: CliIO, yes: boolean, question: string): Promise<boolean> {
  if (yes) return true;
  if (!io.canPrompt) return false;
  return io.ask(question);
}
