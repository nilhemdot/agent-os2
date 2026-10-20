import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANAGED_PATHS, managedTemplate, projectTemplate, VERIFIED_KEYS } from "../src/harden.js";
import { cli, tmp, write } from "./util.js";

const jsonBlocks = (out: string): unknown[] => {
  const blocks: unknown[] = [];
  const lines = out.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "{") continue;
    let j = i; while (j < lines.length && lines[j] !== "}") j++;
    blocks.push(JSON.parse(lines.slice(i, j + 1).join("\n")));
    i = j;
  }
  return blocks;
};

const flatKeys = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => [prefix + k, ...(typeof v === "object" && !Array.isArray(v) ? flatKeys(v, prefix + k + ".") : [])]) : [];

describe("harden (print only)", () => {
  it("prints both templates, writes nothing, exits 0", async () => {
    const d = tmp();
    const r = await cli(["harden", d], d);
    expect(r.code).toBe(0);
    expect(readdirSync(d)).toEqual([]);
    const [project, managed] = jsonBlocks(r.out) as Record<string, unknown>[];
    expect(project).toEqual(projectTemplate());
    expect(managed).toEqual(managedTemplate());
    for (const p of Object.values(MANAGED_PATHS)) expect(r.out).toContain(p);
    expect(r.out).toMatch(/NOT verified|not verified/i);
  });
  it("every key in both templates is in the verified list", () => {
    const allowed = new Set<string>(VERIFIED_KEYS);
    for (const t of [projectTemplate(), managedTemplate()]) for (const k of flatKeys(t)) expect(allowed.has(k), k).toBe(true);
  });
  it("denies the secret paths, disables bypass and leaves defaultMode alone", () => {
    const p = projectTemplate() as { permissions: { deny: string[]; disableBypassPermissionsMode: string; defaultMode?: string } };
    expect(p.permissions.deny).toEqual(expect.arrayContaining(["Read(./.env)", "Read(./secrets/**)", "Read(~/.ssh/**)"]));
    expect(p.permissions.disableBypassPermissionsMode).toBe("disable");
    expect(p.permissions.defaultMode).toBeUndefined();
  });
  it("the recommended project settings produce zero findings when scanned", async () => {
    const d = tmp();
    write(d, ".claude/settings.json", JSON.stringify(projectTemplate(), null, 2));
    const r = await cli(["scan", d, "--json", "-", "--fail-on", "none"], tmp());
    expect(JSON.parse(r.out).findings).toEqual([]);
  });
});

describe("harden --write", () => {
  it("without confirmation (non-interactive, no --yes) writes nothing and exits 2", async () => {
    const d = tmp();
    const r = await cli(["harden", d, "--write"], d);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/confirmation/);
    expect(existsSync(join(d, ".claude"))).toBe(false);
  });
  it("--yes creates .claude/settings.json with exactly the template", async () => {
    const d = tmp();
    const r = await cli(["harden", d, "--write", "--yes"], d);
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(d, ".claude/settings.json"), "utf8"))).toEqual(projectTemplate());
  });
  it("an interactive 'no' writes nothing; an interactive 'yes' writes", async () => {
    const d1 = tmp();
    const no = await cli(["harden", d1, "--write"], d1, { tty: true, answer: false });
    expect(no.code).toBe(2);
    expect(no.answers).toHaveLength(1);
    expect(existsSync(join(d1, ".claude"))).toBe(false);
    const d2 = tmp();
    const yes = await cli(["harden", d2, "--write"], d2, { tty: true, answer: true });
    expect(yes.code).toBe(0);
    expect(existsSync(join(d2, ".claude/settings.json"))).toBe(true);
  });
  it("never overwrites an existing settings file, even with --yes", async () => {
    const d = tmp();
    write(d, ".claude/settings.json", '{ "mine": true }');
    const r = await cli(["harden", d, "--write", "--yes"], d);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/already exists/);
    expect(readFileSync(join(d, ".claude/settings.json"), "utf8")).toBe('{ "mine": true }');
  });
  it("refuses to write through a symlinked .claude directory", async () => {
    const d = tmp(); const elsewhere = tmp();
    try { symlinkSync(elsewhere, join(d, ".claude"), "junction"); } catch { return; } // cannot create links here
    const r = await cli(["harden", d, "--write", "--yes"], d);
    expect(r.code).toBe(2);
    expect(readdirSync(elsewhere)).toEqual([]);
  });
  it("creates .claude when it does not exist and keeps an existing empty .claude directory", async () => {
    const d = tmp(); mkdirSync(join(d, ".claude"));
    expect((await cli(["harden", d, "--write", "--yes"], d)).code).toBe(0);
    expect(existsSync(join(d, ".claude/settings.json"))).toBe(true);
  });
  it("a missing path is exit 2", async () => {
    expect((await cli(["harden", join(tmp(), "nope"), "--write", "--yes"], tmp())).code).toBe(2);
  });
});
