import { scanFiles } from "../engine/engine.js";
import type { Finding, ScannerConfig, SourceFile } from "../model/types.js";
import { sevRank } from "../model/types.js";
import type { BaselineState } from "../report/sarif.js";
import { INSTRUCTION_KINDS } from "../rules/helpers.js";
import { identityKey, looseKey } from "./identity.js";
import { addedLineIndexes, lineSimilarity, withContext } from "./lines.js";
import { semanticChanges, type ConfigChange } from "./semantic.js";
import { redactSecretsInText } from "../secrets/patterns.js";

/** Secret values never appear in change descriptions (a changed hook command may contain one). */
const redactChange = (c: ConfigChange): ConfigChange => ({ ...c, subject: redactSecretsInText(c.subject), detail: redactSecretsInText(c.detail), ...(c.before !== undefined ? { before: redactSecretsInText(c.before) } : {}), ...(c.after !== undefined ? { after: redactSecretsInText(c.after) } : {}) });

/**
 * Semantic base-vs-head comparison: what did this change make worse?
 *
 * Both states are scanned with the same rules; findings are matched by identity (rule + file + stable JSON path + normalized
 * evidence, never line numbers). Renamed/moved files are matched by content similarity first so they do not look new.
 */

export interface RepoState {
  label: string;
  files: SourceFile[];
  /** Reads any repo-relative file as text (for script-following); omit if unavailable. */
  readFile?: (repoRelPath: string) => string | undefined;
  /** Git-tracked paths in this state, when known (AG-004). */
  tracked?: Set<string>;
}

export interface DiffOptions {
  config?: ScannerConfig;
  /** Lines of context around added/changed lines in instruction files (default 3). */
  contextLines?: number;
  /** Minimum content similarity (0..1) to treat a removed+added file pair as a rename (default 0.8). */
  renameThreshold?: number;
}

export interface FindingPair { base: Finding; head: Finding; reason: string }
export interface RenameInfo { from: string; to: string; similarity: number }

export interface DiffResult {
  base: string;
  head: string;
  /** In head, not in base. `introducedByChange` is set. */
  introduced: Finding[];
  /** Present in both but higher severity (or confidence) in head. `head.introducedByChange` is set. */
  worsened: FindingPair[];
  /** Present in both, but less severe (or less certain) in head: base and head side by side. Also counted in `unchanged`. */
  improved: FindingPair[];
  /** In base, gone in head (base-side Finding objects). */
  resolved: Finding[];
  /** Present in both without getting worse (head-side objects), including pre-existing text findings outside the changed lines. */
  unchanged: Finding[];
  renames: RenameInfo[];
  /** Structured changes (permissions widened, hook changed, MCP server changed, ...). */
  changes: ConfigChange[];
  stats: { baseFindings: number; headFindings: number; introduced: number; worsened: number; improved: number; resolved: number; unchanged: number; riskierChanges: number };
}

const confRank = { high: 2, medium: 1, low: 0 } as const;
/** Text rules whose findings in modified instruction files are only reported for added/changed lines (+ context). */
const WINDOWED_RULES = new Set(["AG-021", "AG-022", "AG-023", "AG-008"]);
const INSTRUCTION = new Set<string>(INSTRUCTION_KINDS);

export function diffStates(base: RepoState, head: RepoState, opts: DiffOptions = {}): DiffResult {
  const contextLines = opts.contextLines ?? 3;
  const threshold = opts.renameThreshold ?? 0.8;
  const basePaths = new Set(base.files.map((f) => f.path));
  const headPaths = new Set(head.files.map((f) => f.path));

  // ---- renames / moves by content similarity
  const baseOnly = base.files.filter((f) => !headPaths.has(f.path));
  const used = new Set<string>();
  const renames: RenameInfo[] = [];
  for (const h of head.files.filter((f) => !basePaths.has(f.path))) {
    let best: { b: SourceFile; sim: number } | undefined;
    for (const b of baseOnly) {
      if (used.has(b.path) || b.kind !== h.kind) continue;
      const sim = lineSimilarity(b.text, h.text);
      if (sim >= threshold && (!best || sim > best.sim)) best = { b, sim };
    }
    if (best) { used.add(best.b.path); renames.push({ from: best.b.path, to: h.path, similarity: best.sim }); }
  }
  const headToBase = new Map(renames.map((r) => [r.to, r.from] as const));
  const baseToHead = new Map(renames.map((r) => [r.from, r.to] as const));

  // ---- scan both states
  const scanState = (s: RepoState): Finding[] => scanFiles(s.files, { config: opts.config, trackedFiles: s.tracked, readFile: s.readFile }).findings;
  const baseFindings = scanState(base);
  const headFindings = scanState(head);

  // ---- match by identity (multiset), with renamed files mapped onto their head path
  const asHead = (f: Finding): Finding => (baseToHead.has(f.file) ? { ...f, file: baseToHead.get(f.file)! } : f);
  const headByKey = new Map<string, Finding[]>();
  for (const f of headFindings) { const k = identityKey(f); (headByKey.get(k) ?? headByKey.set(k, []).get(k)!).push(f); }
  const unchanged: Finding[] = [];
  const unmatchedBase: Finding[] = [];
  for (const b of baseFindings) {
    const list = headByKey.get(identityKey(asHead(b)));
    if (list?.length) unchanged.push(list.shift()!);
    else unmatchedBase.push(b);
  }
  const unmatchedHead = [...headByKey.values()].flat();

  // ---- pair changed counterparts ("worsened"): only when unambiguous (exactly one on each side for that path)
  const worsened: FindingPair[] = [];
  const improved: FindingPair[] = [];
  const baseLoose = new Map<string, Finding[]>(), headLoose = new Map<string, Finding[]>();
  for (const b of unmatchedBase) { const k = looseKey(asHead(b)); (baseLoose.get(k) ?? baseLoose.set(k, []).get(k)!).push(b); }
  for (const h of unmatchedHead) { const k = looseKey(h); (headLoose.get(k) ?? headLoose.set(k, []).get(k)!).push(h); }
  const pairedBase = new Set<Finding>(), pairedHead = new Set<Finding>();
  for (const [k, bs] of baseLoose) {
    const hs = headLoose.get(k);
    if (bs.length !== 1 || hs?.length !== 1) continue;
    const b = bs[0]!, h = hs[0]!;
    pairedBase.add(b); pairedHead.add(h);
    const sevUp = sevRank(h.severity) > sevRank(b.severity);
    const confUp = sevRank(h.severity) === sevRank(b.severity) && confRank[h.confidence] > confRank[b.confidence];
    if (sevUp || confUp) worsened.push({ base: b, head: { ...h, introducedByChange: true }, reason: sevUp ? `severity ${b.severity} → ${h.severity}` : `confidence ${b.confidence} → ${h.confidence}` });
    else {
      const sevDown = sevRank(h.severity) < sevRank(b.severity);
      const confDown = sevRank(h.severity) === sevRank(b.severity) && confRank[h.confidence] < confRank[b.confidence];
      if (sevDown || confDown) improved.push({ base: b, head: h, reason: sevDown ? `severity ${b.severity} → ${h.severity}` : `confidence ${b.confidence} → ${h.confidence}` });
      unchanged.push(h);
    }
  }

  // ---- introduced / resolved, with changed-line gating for text rules in modified instruction files
  const headByPath = new Map(head.files.map((f) => [f.path, f] as const));
  const baseByPath = new Map(base.files.map((f) => [f.path, f] as const));
  const introduced: Finding[] = [];
  for (const h of unmatchedHead.filter((x) => !pairedHead.has(x))) {
    const hf = headByPath.get(h.file);
    const baseCounterpart = baseByPath.get(headToBase.get(h.file) ?? h.file);
    if (hf && baseCounterpart && INSTRUCTION.has(hf.kind) && WINDOWED_RULES.has(h.ruleId)) {
      const lines = hf.text.split("\n").length;
      const window = withContext(addedLineIndexes(baseCounterpart.text, hf.text), contextLines, lines);
      let touches = false;
      for (let l = h.range.startLine; l <= h.range.endLine; l++) if (window.has(l)) { touches = true; break; }
      if (!touches) { unchanged.push(h); continue; } // pre-existing text outside the change
    }
    introduced.push({ ...h, introducedByChange: true });
  }
  const resolved = unmatchedBase.filter((b) => !pairedBase.has(b));

  const changes = semanticChanges({ base: { files: base.files, tracked: base.tracked }, head: { files: head.files, tracked: head.tracked }, renames: headToBase }).map(redactChange);

  return {
    base: base.label, head: head.label, introduced, worsened, improved, resolved, unchanged, renames, changes,
    stats: {
      baseFindings: baseFindings.length, headFindings: headFindings.length, introduced: introduced.length, worsened: worsened.length, improved: improved.length,
      resolved: resolved.length, unchanged: unchanged.length, riskierChanges: changes.filter((c) => c.riskier).length,
    },
  };
}

/** SARIF baselineState per head-side finding (and "absent" for resolved ones). */
export function baselineStatesOf(d: DiffResult): Map<Finding, BaselineState> {
  const m = new Map<Finding, BaselineState>();
  for (const f of d.introduced) m.set(f, "new");
  for (const p of d.worsened) m.set(p.head, "updated");
  for (const f of d.unchanged) m.set(f, "unchanged");
  for (const f of d.resolved) m.set(f, "absent");
  return m;
}

/** Findings a PR gate should look at: what the change introduced or made worse. */
export const changedFindings = (d: DiffResult): Finding[] => [...d.introduced, ...d.worsened.map((p) => p.head)];
