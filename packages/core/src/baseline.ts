import type { Finding } from "./model/types.js";
import { identityHash } from "./diff/identity.js";
import { PRODUCT } from "./product.js";

/**
 * Baseline: "accept the findings that exist today, fail only on new ones". Entries are keyed by the diff engine's stable
 * identity (rule + file + stable JSON path + subject + normalized evidence), so moving text around, or adding an array
 * element above an entry, does not make an accepted finding look new. Identical findings are counted (multiset): a baseline
 * that accepted two does not hide a third. No line numbers, evidence text or timestamps are stored.
 */

export const BASELINE_FILE = `.${PRODUCT.id}-baseline.json`;

export interface BaselineEntry {
  /** identityHash of the finding */
  id: string;
  /** how many findings with this identity were accepted */
  count: number;
  /** informational only */
  ruleId: string;
  file: string;
  title: string;
}

export interface BaselineFile {
  version: 1;
  tool: string;
  findings: BaselineEntry[];
}

export class BaselineError extends Error {}

export function createBaseline(findings: Finding[]): BaselineFile {
  const byId = new Map<string, BaselineEntry>();
  for (const f of findings) {
    const id = identityHash(f);
    const e = byId.get(id);
    if (e) e.count++;
    else byId.set(id, { id, count: 1, ruleId: f.ruleId, file: f.file, title: f.title });
  }
  const entries = [...byId.values()].sort((a, b) => a.file.localeCompare(b.file) || a.ruleId.localeCompare(b.ruleId) || a.id.localeCompare(b.id));
  return { version: 1, tool: PRODUCT.name, findings: entries };
}

export function serializeBaseline(b: BaselineFile): string {
  return JSON.stringify(b, null, 2) + "\n";
}

export function parseBaseline(text: string): BaselineFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new BaselineError(`baseline is not valid JSON: ${(e as Error).message}`); }
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 1) throw new BaselineError("baseline has an unsupported or missing version (expected 1)");
  const list = (raw as { findings?: unknown }).findings;
  if (!Array.isArray(list)) throw new BaselineError("baseline has no findings array");
  const findings: BaselineEntry[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object") throw new BaselineError("baseline entry is not an object");
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || !/^[0-9a-f]{32}$/.test(o.id)) throw new BaselineError("baseline entry has an invalid id");
    const count = o.count === undefined ? 1 : o.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) throw new BaselineError("baseline entry has an invalid count");
    findings.push({ id: o.id, count, ruleId: String(o.ruleId ?? ""), file: String(o.file ?? ""), title: String(o.title ?? "") });
  }
  return { version: 1, tool: String((raw as { tool?: unknown }).tool ?? PRODUCT.name), findings };
}

export interface BaselineApplication {
  /** findings not covered by the baseline: these are the ones that count */
  kept: Finding[];
  suppressed: Finding[];
  /** baseline entries that matched fewer findings than they accepted (fixed or changed since), informational */
  stale: number;
}

export function applyBaseline(findings: Finding[], baseline: BaselineFile): BaselineApplication {
  const remaining = new Map<string, number>();
  for (const e of baseline.findings) remaining.set(e.id, (remaining.get(e.id) ?? 0) + e.count);
  const kept: Finding[] = []; const suppressed: Finding[] = [];
  for (const f of findings) {
    const id = identityHash(f);
    const n = remaining.get(id) ?? 0;
    if (n > 0) { remaining.set(id, n - 1); suppressed.push(f); } else kept.push(f);
  }
  let stale = 0;
  for (const n of remaining.values()) stale += n;
  return { kept, suppressed, stale };
}
