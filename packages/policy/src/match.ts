/** `*` / `**` match any characters, including `/` and spaces. Every other character is literal. */
export function matchShellWild(pattern: string, value: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === value;
  if (!value.startsWith(parts[0] ?? "")) return false;
  let pos = (parts[0] ?? "").length;
  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i] ?? "";
    if (part === "") continue;
    const idx = value.indexOf(part, pos);
    if (idx < 0) return false;
    pos = idx + part.length;
  }
  const last = parts[parts.length - 1] ?? "";
  if (last === "") return true;
  if (!value.endsWith(last)) return false;
  return value.length - last.length >= pos;
}

/**
 * True when every string matched by `narrower` is matched by `wider`.
 * Both patterns use shell-style stars (any characters). Used by policy lint.
 */
export function shellSubsumes(wider: string, narrower: string): boolean {
  if (matchShellWild(wider, narrower.replaceAll("*", ""))) {
    // Necessary but not sufficient; the probe set below is the real check.
  }
  const probes = probesFor(narrower);
  return probes.every((probe) => matchShellWild(wider, probe));
}

function probesFor(pattern: string): string[] {
  const stars = pattern.split("*").length - 1;
  if (stars === 0) return [pattern];
  const samples = ["", "a", "a/b", "a b", "/", " Q ", "x-y", "&&", ".env"];
  if (stars > 3) {
    return samples.map((sample) => pattern.replaceAll("*", sample));
  }
  let out = [""];
  const chunks = pattern.split("*");
  for (let i = 0; i < chunks.length - 1; i++) {
    const next: string[] = [];
    for (const prefix of out) {
      for (const sample of samples) next.push(prefix + chunks[i] + sample);
    }
    out = next.slice(0, 400);
  }
  const last = chunks[chunks.length - 1] ?? "";
  return out.map((prefix) => prefix + last);
}

export function matchPathPattern(pattern: string, absolutePath: string, home: string): boolean {
  const expanded = expandHome(pattern, home);
  const patSegs = expanded.split("/");
  const valSegs = absolutePath.split("/");
  if (matchSegments(patSegs, valSegs)) return true;
  const relative = !expanded.startsWith("/");
  if (relative) {
    for (let i = 0; i < valSegs.length; i++) {
      if (matchSegments(patSegs, valSegs.slice(i))) return true;
    }
  }
  return false;
}

export function expandHome(pattern: string, home: string): string {
  if (pattern === "~") return home;
  if (pattern.startsWith("~/")) return home.replace(/\/$/, "") + pattern.slice(1);
  return pattern;
}

function matchSegments(pat: string[], val: string[]): boolean {
  const memo = new Map<string, boolean>();
  const rec = (pi: number, vi: number): boolean => {
    const key = `${pi}:${vi}`;
    const cached = memo.get(key);
    if (cached != null) return cached;
    let ok = false;
    if (pi === pat.length) ok = vi === val.length;
    else if (pat[pi] === "**") {
      for (let k = vi; k <= val.length; k++) {
        if (rec(pi + 1, k)) {
          ok = true;
          break;
        }
      }
    } else if (vi < val.length && matchShellWild(pat[pi] ?? "", val[vi] ?? "")) {
      ok = rec(pi + 1, vi + 1);
    }
    memo.set(key, ok);
    return ok;
  };
  return rec(0, 0);
}

/** Path-pattern subsumption for lint. `**` covers every path; a star segment covers one segment. */
export function pathSubsumes(wider: string, narrower: string): boolean {
  if (wider === "**" || wider === "*" || wider.endsWith("/**") && narrower.startsWith(wider.slice(0, -3))) {
    if (wider === "**" || wider === "*") return true;
  }
  const probes = [
    narrower.replaceAll("**", "a/b").replaceAll("*", "a"),
    narrower.replaceAll("**", "a/b/c").replaceAll("*", "file"),
    narrower.replaceAll("**", "").replaceAll("*", "x"),
  ];
  return probes.every((probe) => {
    const path = probe.startsWith("/") || probe.startsWith("~") ? probe : `/probe/${probe}`;
    return matchPathPattern(wider, path.replace(/\/+/g, "/"), "/home/probe");
  });
}
