export interface CommandAnalysis {
  /** Whole command plus each split subcommand, most-restrictive wins at resolve time. */
  candidates: string[];
  unparseable: boolean;
  reasons: string[];
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Split a shell command so a dangerous tail cannot hide behind an allowed prefix.
 * Operators: && || ; | newline, plus command substitutions.
 * A command we cannot parse with confidence is flagged unparseable (never allow).
 */
export function analyzeCommand(input: string): CommandAnalysis {
  const reasons: string[] = [];
  if (hasUnbalancedQuotes(input)) {
    return { candidates: [input.trim()], unparseable: true, reasons: ["unbalanced_quotes"] };
  }
  if (heredocProblem(input)) reasons.push("heredoc_expansion");

  const segments = splitOps(input, new Set(["&&", "||", ";", "\n"]));
  const candidates: string[] = [];
  const push = (value: string) => {
    const stripped = stripAssignments(value.trim());
    if (stripped) candidates.push(stripped);
  };

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    push(trimmed);
    if (trimmed.includes("|")) {
      for (const part of splitOps(trimmed, new Set(["|"]))) push(part);
    }
    collectSubstitutions(trimmed, push, reasons);
  }

  const unique = [...new Set(candidates)];
  for (const command of unique) {
    const name = commandName(command);
    if (name.startsWith("$")) reasons.push("variable_command");
    if (name === "eval") reasons.push("eval");
    if (["bash", "sh", "zsh", "dash", "ksh"].includes(name) && /(^|\s)-c(\s|$)/.test(command)) {
      reasons.push("shell_c");
      const inner = extractCString(command);
      if (inner != null) {
        const nested = analyzeCommand(inner);
        for (const part of nested.candidates) {
          if (!unique.includes(part)) unique.push(part);
        }
        if (nested.unparseable) reasons.push(...nested.reasons);
      }
    }
    if (name === "xargs" && /\b(sh|bash|zsh|dash|ksh|eval)\b/.test(command)) reasons.push("xargs_shell");
  }

  return {
    candidates: unique.length ? unique : [input.trim()],
    unparseable: reasons.length > 0,
    reasons: [...new Set(reasons)],
  };
}

function hasUnbalancedQuotes(input: string): boolean {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (c === "\\" && i + 1 < input.length) {
        i++;
        continue;
      }
      if (c === '"') quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
  }
  return quote != null;
}

function heredocProblem(input: string): boolean {
  let i = 0;
  let quote: "'" | '"' | null = null;
  while (i < input.length) {
    const c = input[i];
    if (quote) {
      if (quote === '"' && c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      i++;
      continue;
    }
    if (c === "<" && input[i + 1] === "<") {
      let j = i + 2;
      if (input[j] === "-") j++;
      const delimQuote = input[j] === "'" || input[j] === '"' ? input[j] : null;
      if (delimQuote) j++;
      let delim = "";
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j] ?? "")) {
        delim += input[j];
        j++;
      }
      if (delimQuote && input[j] === delimQuote) j++;
      if (!delim) return true;
      const nl = input.indexOf("\n", j);
      if (nl < 0) return true;
      const bodyStart = nl + 1;
      const end = input.indexOf(`\n${delim}`, bodyStart);
      const body = end < 0 ? input.slice(bodyStart) : input.slice(bodyStart, end);
      if (!delimQuote && (/\$/.test(body) || body.includes("`"))) return true;
      if (end < 0) return true;
      i = end + 1 + delim.length;
      continue;
    }
    i++;
  }
  return false;
}

function splitOps(input: string, ops: Set<string>): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i] ?? "";
    if (quote) {
      cur += c;
      if (quote === '"' && c === "\\") {
        if (i + 1 < input.length) {
          cur += input[i + 1];
          i++;
        }
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "$" && input[i + 1] === "(") {
      const extracted = extractBalanced(input, i + 1);
      if (extracted) {
        cur += input.slice(i, extracted.end);
        i = extracted.end - 1;
        continue;
      }
    }
    if (c === "`") {
      const end = input.indexOf("`", i + 1);
      if (end >= 0) {
        cur += input.slice(i, end + 1);
        i = end;
        continue;
      }
    }
    const two = input.slice(i, i + 2);
    if (ops.has(two)) {
      parts.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (ops.has(c)) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function collectSubstitutions(input: string, push: (value: string) => void, reasons: string[]): void {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (quote === '"' && c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'") {
      quote = "'";
      continue;
    }
    if (c === '"') {
      quote = '"';
      continue;
    }
    if (c === "`") {
      const end = input.indexOf("`", i + 1);
      if (end < 0) {
        reasons.push("unbalanced_subst");
        return;
      }
      push(input.slice(i + 1, end));
      const nested = analyzeNested(input.slice(i + 1, end));
      if (nested) reasons.push(...nested);
      i = end;
      continue;
    }
    if (c === "$" && input[i + 1] === "(") {
      const extracted = extractBalanced(input, i + 1);
      if (!extracted) {
        reasons.push("unbalanced_subst");
        return;
      }
      push(extracted.body);
      const nested = analyzeNested(extracted.body);
      if (nested) reasons.push(...nested);
      i = extracted.end - 1;
      continue;
    }
    if (c === "<" && input[i + 1] === "(") {
      const extracted = extractBalanced(input, i + 1);
      if (!extracted) {
        reasons.push("unbalanced_subst");
        return;
      }
      push(extracted.body);
      i = extracted.end - 1;
    }
  }
}

function analyzeNested(body: string): string[] | null {
  const inner = analyzeCommand(body);
  return inner.unparseable ? inner.reasons : null;
}

function extractBalanced(input: string, openIndex: number): { body: string; end: number } | null {
  if (input[openIndex] !== "(") return null;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = openIndex; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (quote === '"' && c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { body: input.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  return null;
}

function stripAssignments(value: string): string {
  let rest = value.trim();
  while (ASSIGNMENT.test(rest)) {
    const eq = rest.indexOf("=");
    let i = eq + 1;
    if (rest[i] === "'" || rest[i] === '"') {
      const q = rest[i];
      i++;
      while (i < rest.length) {
        if (rest[i] === "\\" && q === '"') {
          i += 2;
          continue;
        }
        if (rest[i] === q) {
          i++;
          break;
        }
        i++;
      }
      rest = rest.slice(i).trim();
      continue;
    }
    const space = rest.indexOf(" ", eq);
    if (space < 0) return "";
    rest = rest.slice(space + 1).trim();
  }
  return rest;
}

export function commandName(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("$")) {
    const match = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(trimmed);
    return match?.[0] ?? "$";
  }
  const match = /^['"]?([A-Za-z0-9_./+-]+)/.exec(trimmed);
  const raw = match?.[1] ?? "";
  const base = raw.split("/").pop() ?? raw;
  return base;
}

function extractCString(command: string): string | null {
  const match = /(^|\s)-c\s+(['"])([\s\S]*)\2/.exec(command);
  if (match) return match[3] ?? null;
  const loose = /(^|\s)-c\s+(\S+)/.exec(command);
  return loose?.[2] ?? null;
}
