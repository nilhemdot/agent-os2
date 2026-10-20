// Precision guard: re-runs the repo survey on the SAME candidate list/seed as scripts/survey.ts, scanning every clone three ways
// in one pass so that repository drift cannot be mistaken for a rule change:
//   OLD  = all rules except those added by the CLI track (AG-011, AG-024, AG-025)
//   NEW  = default rules (what users get)
//   EXP  = default + experimental rules
// Usage: tsx packages/cli/scripts/survey-guard.ts <candidates.json> [N=110]
// Safety is the same as scripts/survey.ts: shallow clone with hooks/LFS/submodules/symlinks disabled, scanned read-only, deleted.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ALL_RULES, discover, makeRepoReader, readTrackedFiles, scanFiles, sevRank, type Finding } from "../../core/src/index.ts";

const SEED = 20261017;
const SIZE_LIMIT_KB = 150_000;
const NEW_RULES = new Set(["AG-011", "AG-024", "AG-025"]);
const OUT = resolve(import.meta.dirname, "../survey-output");

const candidatesPath = process.argv[2]!;
const N = Number(process.argv[3] ?? 110);
const gh = (args: string[]): string => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const cand = JSON.parse(readFileSync(candidatesPath, "utf8")) as { repos: { repo: string }[] };
const rnd = mulberry32(SEED);
const shuffled = [...cand.repos].map((r) => ({ r, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.r);
const empty = mkdtempSync(join(tmpdir(), "tw-nohooks-"));

type Counts = Record<string, { findings: number; highCritical: number; repos: Set<string> }>;
const mk = (): Counts => ({});
const add = (c: Counts, repo: string, fs: Finding[]) => {
  for (const f of fs) {
    const e = (c[f.ruleId] ??= { findings: 0, highCritical: 0, repos: new Set() });
    e.findings++; e.repos.add(repo);
    if (sevRank(f.severity) >= sevRank("high")) e.highCritical++;
  }
};
const oldC = mk(), newC = mk(), expC = mk();
const newHits: { repo: string; ruleId: string; severity: string; file: string; title: string; evidence: string }[] = [];
let scanned = 0, tried = 0;
const hc = (fs: Finding[]) => fs.some((f) => sevRank(f.severity) >= sevRank("high"));
const reposHC = { old: 0, new: 0, experimental: 0 };

for (const c of shuffled) {
  if (scanned >= N) break;
  tried++;
  let meta: { size: number; fork: boolean; disabled: boolean; clone_url: string };
  try { meta = JSON.parse(gh(["api", `repos/${c.repo}`])); } catch { continue; }
  if (meta.fork || meta.disabled || meta.size > SIZE_LIMIT_KB) continue;
  const dir = mkdtempSync(join(tmpdir(), "tw-survey-"));
  try {
    execFileSync("git", [
      "clone", "--depth", "1", "--single-branch", "--no-tags", "--filter=blob:limit=2m",
      "-c", `core.hooksPath=${empty}`, "-c", "core.symlinks=false", "-c", "core.fsmonitor=false", "-c", "core.longpaths=true",
      "-c", "protocol.file.allow=never", "-c", "filter.lfs.smudge=", "-c", "filter.lfs.process=", "-c", "filter.lfs.required=false",
      "-c", "submodule.recurse=false", "-c", "advice.detachedHead=false", meta.clone_url, dir,
    ], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" }, stdio: "pipe", timeout: 180_000 });
    const { files } = discover(dir);
    const base = { root: dir, trackedFiles: readTrackedFiles(dir), readFile: makeRepoReader(dir) };
    const oldR = scanFiles(files, { ...base, rules: ALL_RULES.filter((r) => !NEW_RULES.has(r.id)) }).findings;
    const newR = scanFiles(files, base).findings;
    const expR = scanFiles(files, { ...base, config: { enableExperimentalRules: true } }).findings;
    add(oldC, c.repo, oldR); add(newC, c.repo, newR); add(expC, c.repo, expR);
    if (hc(oldR)) reposHC.old++; if (hc(newR)) reposHC.new++; if (hc(expR)) reposHC.experimental++;
    for (const f of expR) if (NEW_RULES.has(f.ruleId)) newHits.push({ repo: c.repo, ruleId: f.ruleId, severity: f.severity, file: f.file, title: f.title, evidence: f.evidence.slice(0, 200) });
    scanned++;
    console.error(`[${scanned}/${N}] ${c.repo} old=${oldR.length} new=${newR.length} exp=${expR.length}`);
  } catch (e) {
    console.error(`skip ${c.repo}: ${String(e).split("\n")[0]!.slice(0, 120)}`);
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); }
}
rmSync(empty, { recursive: true, force: true });

const ser = (c: Counts) => Object.fromEntries(Object.entries(c).sort().map(([k, v]) => [k, { findings: v.findings, highCritical: v.highCritical, repos: v.repos.size }]));
const out = { date: new Date().toISOString(), seed: SEED, reposTried: tried, reposScanned: scanned, reposWithHighOrCritical: reposHC, old: ser(oldC), new: ser(newC), experimental: ser(expC), newRuleHits: newHits };
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "guard.json"), JSON.stringify(out, null, 2));
console.error("wrote guard.json");
