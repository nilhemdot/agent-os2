import { shellSubsumes, pathSubsumes } from "./match.ts";
import { describePattern, type PolicyRule } from "./parse.ts";

export interface LintWarning {
  code: "shadowed_allow";
  allowRule: string;
  shadowRule: string;
  message: string;
}

export function lintRules(rules: PolicyRule[]): LintWarning[] {
  const warnings: LintWarning[] = [];
  const allows = rules.filter((rule) => rule.effect === "allow");
  const restrictive = rules.filter((rule) => rule.effect === "deny" || rule.effect === "ask");
  for (const allow of allows) {
    for (const pattern of allow.match) {
      const described = describePattern(pattern);
      if (!described.ok) continue;
      for (const other of restrictive) {
        for (const otherPattern of other.match) {
          const otherDescribed = describePattern(otherPattern);
          if (!otherDescribed.ok) continue;
          if (otherDescribed.tool.toLowerCase() !== described.tool.toLowerCase()) continue;
          if (described.inner == null) continue;
          const wider = otherDescribed.inner ?? "*";
          const narrower = described.inner;
          const shadowed =
            described.tool.toLowerCase() === "bash"
              ? shellSubsumes(wider, narrower)
              : pathSubsumes(wider, narrower) || shellSubsumes(wider, narrower);
          if (shadowed) {
            warnings.push({
              code: "shadowed_allow",
              allowRule: allow.id,
              shadowRule: other.id,
              message: `${other.effect} rule ${other.id} matches everything allow rule ${allow.id} matches (${otherPattern} shadows ${pattern}), so the allow rule can never fire`,
            });
          }
        }
      }
    }
  }
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.allowRule}:${warning.shadowRule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
