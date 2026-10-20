import { createHash } from "node:crypto";
import type { Finding } from "../model/types.js";

/**
 * Stable finding identity. Line numbers are deliberately NOT part of it: a finding must keep its identity when text above it
 * moves. Array indices in JSON paths are also dropped (they shift when an element is added or removed); duplicates are
 * handled by counting (multiset matching) in the diff engine.
 */
export const stablePath = (jsonPath: string | undefined): string => (jsonPath ?? "").replace(/(^|\.)\d+(?=\.|$)/g, "$1[]");

/** Evidence with whitespace collapsed and chain line numbers ("file.js:12 [signal]") neutralized. */
export const normEvidence = (e: string): string => e.replace(/\s+/g, " ").replace(/:\d+ \[/g, ":N [").trim();

const SEP = "␟";

/** ruleId + file + stable JSON path + normalized evidence. */
export const identityKey = (f: Finding): string => [f.ruleId, f.file, stablePath(f.jsonPath), f.subject ?? "", normEvidence(f.evidence)].join(SEP);

/** Same as identityKey without the evidence: used to pair a finding with its changed counterpart ("worsened"). */
export const looseKey = (f: Finding): string => [f.ruleId, f.file, stablePath(f.jsonPath), f.subject ?? ""].join(SEP);

/** Short hex fingerprint of the identity (SARIF partialFingerprints). */
export const identityHash = (f: Finding): string => createHash("sha256").update(identityKey(f)).digest("hex").slice(0, 32);
