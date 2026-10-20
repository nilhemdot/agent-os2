import type { Finding, Range, Rule, Severity, StructuredEdit } from "../model/types.js";
import { identityHash } from "../diff/identity.js";
import { PRODUCT } from "../product.js";
import { ALL_RULES } from "../rules/registry.js";
import { redactSecretsInText } from "../secrets/patterns.js";
import { RULE_HELP } from "./ruleHelp.js";
import pkg from "../../package.json";

/** SARIF 2.1.0 output. Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/ (validated in tests against the official schema). */

export const TOOL_VERSION: string = (pkg as { version: string }).version;
export const SARIF_SCHEMA = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json";

export type BaselineState = "new" | "unchanged" | "updated" | "absent";
type Level = "error" | "warning" | "note";

export interface SarifOptions {
  findings: Finding[];
  /** Suppressed findings; emitted with a `suppressions` entry when `includeSuppressed` is set. */
  suppressed?: { finding: Finding; reason: string }[];
  includeSuppressed?: boolean;
  /** Per-finding baseline state (diff mode). Findings not in the map get no baselineState. */
  baselineStates?: Map<Finding, BaselineState>;
  toolVersion?: string;
  /** Absolute URI of the repository root (with trailing slash), emitted as originalUriBaseIds["%SRCROOT%"]. */
  rootUri?: string;
  /** Base URL of the hosted rule documentation; rules get helpUri `${base}#<id>` only when set (PRODUCT.docsUrl by default). */
  helpBaseUri?: string;
  /** Attach SARIF `fixes` for autofixes that need no user input. */
  includeFixes?: boolean;
  rules?: Rule[];
}

export const sarifLevel = (s: Severity): Level => (s === "critical" || s === "high" ? "error" : s === "medium" ? "warning" : "note");

/** GitHub code scanning ranks by this numeric string: >=9 critical, 7-8.9 high, 4-6.9 medium, <4 low. */
export const SECURITY_SEVERITY: Record<Severity, string> = { critical: "9.5", high: "8.0", medium: "5.5", low: "3.0", info: "1.0" };

const encodePath = (p: string): string => p.split("/").map(encodeURIComponent).join("/");

function artifact(file: string): { uri: string; uriBaseId: string } {
  return file.startsWith("~/")
    ? { uri: encodePath(file.slice(2)), uriBaseId: "%USERPROFILE%" }
    : { uri: encodePath(file), uriBaseId: "%SRCROOT%" };
}

/** Our ranges are 0-based with exclusive end; SARIF regions are 1-based with an exclusive endColumn. */
export function sarifRegion(r: Range): { startLine: number; startColumn: number; endLine: number; endColumn: number } {
  const startLine = r.startLine + 1, startColumn = r.startCol + 1, endLine = r.endLine + 1;
  let endColumn = r.endCol + 1;
  if (endLine === startLine && endColumn <= startColumn) endColumn = startColumn + 1;
  return { startLine, startColumn, endLine, endColumn };
}

function fixOf(f: Finding, a: StructuredEdit) {
  return {
    description: { text: a.description },
    artifactChanges: [{
      artifactLocation: artifact(a.file),
      replacements: a.edits.map((e) => ({
        deletedRegion: sarifRegion(e.range),
        ...(e.newText ? { insertedContent: { text: e.newText } } : {}),
      })),
    }],
  };
}

function ruleDescriptor(r: { id: string; category?: string; defaultSeverity: Severity; experimental?: boolean }, helpBase: string | undefined) {
  const h = RULE_HELP[r.id];
  return {
    id: r.id,
    name: h?.name ?? r.id,
    shortDescription: { text: h?.short ?? r.id },
    fullDescription: { text: h?.full ?? h?.short ?? r.id },
    ...(helpBase ? { helpUri: `${helpBase}#${r.id.toLowerCase()}` } : {}),
    help: { text: `${h?.full ?? ""}\n\nSee docs/RULES.md for what this rule catches, what it misses, and false-positive notes.`.trim() },
    defaultConfiguration: { level: sarifLevel(r.defaultSeverity) },
    properties: {
      tags: ["security", ...(r.category ? [`category/${r.category}`] : []), ...(r.experimental ? ["experimental"] : [])],
      "security-severity": SECURITY_SEVERITY[r.defaultSeverity],
    },
  };
}

export function toSarif(opts: SarifOptions) {
  const rules = opts.rules ?? ALL_RULES;
  const helpBase = opts.helpBaseUri ?? (PRODUCT.docsUrl || undefined);
  const descriptors = [
    ruleDescriptor({ id: "AG-000", category: "execution", defaultSeverity: "low" }, helpBase),
    ...rules.map((r) => ruleDescriptor({ id: r.id, category: r.category, defaultSeverity: r.defaultSeverity, experimental: r.experimental }, helpBase)),
  ];
  const index = new Map(descriptors.map((d, i) => [d.id, i]));
  const ensureRule = (f: Finding): number => {
    let i = index.get(f.ruleId);
    if (i === undefined) { i = descriptors.length; descriptors.push(ruleDescriptor({ id: f.ruleId, category: f.category, defaultSeverity: f.severity }, helpBase)); index.set(f.ruleId, i); }
    return i;
  };

  const fpKey = `${PRODUCT.id}Identity/v1`;
  const toResult = (f: Finding, suppression?: string) => {
    const ruleIndex = ensureRule(f);
    const baseline = opts.baselineStates?.get(f);
    const fixes = opts.includeFixes ? (f.autofix ?? []).filter((a) => !a.input && a.edits.length).map((a) => fixOf(f, a)) : [];
    return {
      ruleId: f.ruleId,
      ruleIndex,
      level: sarifLevel(f.severity),
      message: { text: redactSecretsInText(`${f.title}. ${f.whyItMatters}`) },
      locations: [{ physicalLocation: { artifactLocation: artifact(f.file), region: sarifRegion(f.range) } }],
      partialFingerprints: { [fpKey]: identityHash(f) },
      ...(baseline ? { baselineState: baseline } : {}),
      ...(fixes.length ? { fixes } : {}),
      ...(suppression !== undefined ? { suppressions: [{ kind: "external", justification: suppression }] } : {}),
      properties: {
        severity: f.severity,
        confidence: f.confidence,
        category: f.category,
        evidence: redactSecretsInText(f.evidence),
        remediation: redactSecretsInText(f.fix),
        ...(f.experimental ? { experimental: true } : {}),
        ...(f.introducedByChange ? { introducedByChange: true } : {}),
      },
    };
  };

  const results = [
    ...opts.findings.map((f) => toResult(f)),
    ...(opts.includeSuppressed ? (opts.suppressed ?? []).map((s) => toResult(s.finding, s.reason)) : []),
  ];

  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0" as const,
    runs: [{
      tool: { driver: { name: PRODUCT.name, version: opts.toolVersion ?? TOOL_VERSION, semanticVersion: opts.toolVersion ?? TOOL_VERSION, rules: descriptors } },
      ...(opts.rootUri ? { originalUriBaseIds: { "%SRCROOT%": { uri: opts.rootUri.endsWith("/") ? opts.rootUri : opts.rootUri + "/" } } } : {}),
      columnKind: "utf16CodeUnits" as const,
      invocations: [{ executionSuccessful: true }],
      results,
    }],
  };
}

export type SarifLog = ReturnType<typeof toSarif>;
