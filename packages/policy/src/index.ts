export { DEFAULT_POLICY_YAML } from "./default-policy.ts";
export { lintRules, type LintWarning } from "./lint.ts";
export { matchPathPattern, matchShellWild, shellSubsumes } from "./match.ts";
export {
  PolicyInvalidError,
  describePattern,
  parsePolicy,
  policyHash,
  type PolicyDocument,
  type PolicyProblem,
  type PolicyRule,
} from "./parse.ts";
export {
  layerPolicies,
  normalizePathArg,
  patternMatches,
  pipeToShell,
  resolveDecision,
  stricter,
  type Decision,
  type LayeredPolicy,
  type ResolveContext,
  type ToolCall,
} from "./resolve.ts";
export { analyzeCommand } from "./shell.ts";

import { parsePolicy, type PolicyDocument, type PolicyRule } from "./parse.ts";
import { layerPolicies, resolveDecision, type Decision, type ResolveContext, type ToolCall } from "./resolve.ts";
import { DEFAULT_POLICY_YAML } from "./default-policy.ts";

export function loadDefaultPolicy(): PolicyDocument {
  return parsePolicy(DEFAULT_POLICY_YAML, "policy/global.yaml");
}

export function resolveLayered(
  layers: { source: "global" | "repo" | "profile"; document: PolicyDocument }[],
  call: ToolCall,
  ctx: ResolveContext,
): Decision {
  return resolveDecision(
    layerPolicies(layers.map((layer) => ({ source: layer.source, rules: layer.document.rules, default: layer.document.default }))),
    call,
    ctx,
  );
}

export function tagRules(document: PolicyDocument, source: PolicyRule["source"]): PolicyDocument {
  return { ...document, rules: document.rules.map((rule) => ({ ...rule, source })) };
}
