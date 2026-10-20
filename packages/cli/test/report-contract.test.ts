import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, copyTo, fixtures, reportValidator, tmp, write } from "./util.js";

const NOW = ["--now", "2026-10-20T00:00:00Z"];
const hardened = join(fixtures, "hardened-repo");
const validate = reportValidator();

describe("report: contract (docs/REPORT_CONTRACT.md)", () => {
  it("writes the default file name in the current folder and exits 0", async () => {
    const cwd = tmp();
    const r = await cli(["report", hardened, ...NOW], cwd);
    expect(r.code).toBe(0);
    expect(existsSync(join(cwd, "tripwire-report.html"))).toBe(true);
  });
  it("--format json is valid against docs/report.schema.json", async () => {
    const cwd = tmp();
    const r = await cli(["report", hardened, "--format", "json", "--out", "-", ...NOW], cwd);
    expect(r.code).toBe(0);
    expect(validate(JSON.parse(r.out))).toBeUndefined();
  });
  it("md and html are produced", async () => {
    const cwd = tmp();
    expect((await cli(["report", hardened, "--format", "md", "--out", "r.md", ...NOW], cwd)).code).toBe(0);
    expect((await cli(["report", hardened, "--format", "html", "--out", "r.html", ...NOW], cwd)).code).toBe(0);
    expect(readFileSync(join(cwd, "r.md"), "utf8")).toMatch(/^# /);
    expect(readFileSync(join(cwd, "r.html"), "utf8")).toContain("Content-Security-Policy");
  });
  it("refuses to overwrite without --force, and overwrites with it", async () => {
    const cwd = tmp();
    write(cwd, "r.json", "old");
    const a = await cli(["report", hardened, "--format", "json", "--out", "r.json", ...NOW], cwd);
    expect(a.code).toBe(2);
    expect(readFileSync(join(cwd, "r.json"), "utf8")).toBe("old");
    const b = await cli(["report", hardened, "--format", "json", "--out", "r.json", "--force", ...NOW], cwd);
    expect(b.code).toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "r.json"), "utf8")).schemaVersion).toBe(1);
  });
  it("refuses an --out that escapes through ..", async () => {
    const cwd = join(tmp(), "inner");
    write(cwd, "x", "");
    const r = await cli(["report", hardened, "--out", "../escape.html", ...NOW], cwd);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/outside the current folder/);
  });
  it("refuses an --out that escapes through a symbolic link folder", async () => {
    const base = tmp(); const cwd = join(base, "w"); const outside = join(base, "o");
    write(cwd, "x", ""); write(outside, "x", "");
    try { symlinkSync(outside, join(cwd, "link"), "junction"); } catch { return; /* cannot create links here */ }
    const r = await cli(["report", hardened, "--out", "link/r.html", ...NOW], cwd);
    expect(r.code).toBe(2);
    expect(existsSync(join(outside, "r.html"))).toBe(false);
  });
  it("usage errors exit 2 and write nothing", async () => {
    const cwd = tmp();
    for (const args of [["report"], ["report", hardened, "--months", "25"], ["report", hardened, "--format", "pdf"], ["report", hardened, "--sarif", "x"], ["report", hardened, hardened, "--repo-name", "n"], ["report", join(cwd, "missing")], ["scan", hardened, "--force"]]) {
      const r = await cli(args, cwd);
      expect(r.code, args.join(" ")).toBe(2);
    }
    expect(existsSync(join(cwd, "tripwire-report.html"))).toBe(false);
  });
  it("is deterministic with --now and carries the demo label only when asked", async () => {
    const cwd = tmp();
    const a = (await cli(["report", hardened, "--out", "-", ...NOW], cwd)).out;
    const b = (await cli(["report", hardened, "--out", "-", ...NOW], cwd)).out;
    expect(a).toBe(b);
    expect(a).not.toContain("DEMO DATA");
    expect((await cli(["report", hardened, "--out", "-", "--demo-label", ...NOW], cwd)).out).toContain("DEMO DATA (synthetic)");
  });
  it("works on a plain folder without .git and says so", async () => {
    const cwd = tmp(); const d = copyTo(hardened);
    const r = await cli(["report", d, "--format", "json", "--out", "-", ...NOW], cwd);
    expect(JSON.parse(r.out).meta.repos[0].notes.join(" ")).toMatch(/no \.git directory/);
  });
  it("team mode accepts several folders", async () => {
    const cwd = tmp();
    const r = await cli(["report", hardened, copyTo(hardened), copyTo(hardened), "--format", "json", "--out", "-", ...NOW], cwd);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).meta.repos).toHaveLength(3);
  });
});
