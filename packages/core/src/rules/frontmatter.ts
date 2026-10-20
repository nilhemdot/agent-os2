/**
 * Minimal, safe reader for the YAML frontmatter of SKILL.md / agent / command files. It understands exactly what the rules need:
 * top-level keys, scalar values, inline lists, block lists and nested blocks (kept as raw lines). It never evaluates anything.
 * Unknown or odd YAML simply yields fewer keys, never an exception.
 */
export interface FmKey {
  key: string;
  /** 0-based line of the key */
  line: number;
  /** text after "key:" on the same line (raw, trailing comment removed; use unquote() for a single value) */
  scalar: string;
  /** continuation lines (indented or "- item"), raw */
  block: string[];
  /** 0-based line of the first continuation line, if any */
  blockLine: number;
}

export interface Frontmatter { keys: FmKey[]; endLine: number }

export const unquote = (s: string): string => {
  const t = s.trim();
  return t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'")) ? t.slice(1, -1) : t;
};

export function parseFrontmatter(text: string): Frontmatter | undefined {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return undefined;
  let end = -1;
  for (let i = 1; i < lines.length && i < 400; i++) if (lines[i]!.trim() === "---") { end = i; break; }
  if (end < 0) return undefined;
  const keys: FmKey[] = [];
  let cur: FmKey | undefined;
  for (let i = 1; i < end; i++) {
    const l = lines[i]!;
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
    if (m && !/^\s/.test(l)) {
      let scalar = m[2]!.replace(/\s+#.*$/, "");
      if (/^[|>][+-]?$/.test(scalar.trim())) scalar = "";
      cur = { key: m[1]!, line: i, scalar: scalar.trim(), block: [], blockLine: -1 };
      keys.push(cur);
    } else if (cur && (l.trim() !== "")) {
      if (cur.blockLine < 0) cur.blockLine = i;
      cur.block.push(l);
    }
  }
  return { keys, endLine: end };
}

/** Split a tool list written as "A, B(x y) C", a YAML inline list, or a block list into entries, keeping parentheses intact. */
export function toolEntries(k: FmKey): { entry: string; line: number }[] {
  const out: { entry: string; line: number }[] = [];
  const split = (s: string, line: number) => {
    let depth = 0; let buf = "";
    const flush = () => { const t = unquote(buf.trim()); if (t) out.push({ entry: t, line }); buf = ""; };
    for (const ch of s.replace(/^\[|\]$/g, "")) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && (ch === "," || /\s/.test(ch))) flush(); else buf += ch;
    }
    flush();
  };
  if (k.scalar) split(k.scalar, k.line);
  k.block.forEach((raw, i) => {
    const t = raw.trim().replace(/^-\s*/, "");
    split(t, (k.blockLine >= 0 ? k.blockLine : k.line) + i);
  });
  return out;
}

export const fmValue = (fm: Frontmatter, key: string): FmKey | undefined => fm.keys.find((k) => k.key === key);
