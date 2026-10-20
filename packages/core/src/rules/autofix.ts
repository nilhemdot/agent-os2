import { findNodeAtLocation, parseTree } from "jsonc-parser";
import type { Range, SourceFile, StructuredEdit, TextEdit } from "../model/types.js";
import { LineIndex } from "../parsers/positions.js";
import type { Path } from "./helpers.js";
import { PRODUCT } from "../product.js";

/**
 * Autofix helpers. Every helper only COMPUTES edits (line/col ranges against the file text it was given).
 * Nothing here writes to disk; the extension shows a diff and applies via WorkspaceEdit after confirmation.
 */

/** Apply edits (ranges in the coordinates of `text`) and return the new text. Overlapping edits throw. */
export function applyTextEdits(text: string, edits: TextEdit[]): string {
  const idx = new LineIndex(text);
  const abs = edits
    .map((e) => ({ s: idx.offsetOf(e.range.startLine, e.range.startCol), e: idx.offsetOf(e.range.endLine, e.range.endCol), t: e.newText }))
    .sort((a, b) => b.s - a.s || b.e - a.e);
  let out = text;
  let lastStart = Infinity;
  for (const x of abs) {
    if (x.e > lastStart) throw new Error("overlapping edits");
    out = out.slice(0, x.s) + x.t + out.slice(x.e);
    lastStart = x.s;
  }
  return out;
}

/** Fill `{{input}}` placeholders. */
export function fillInput(edit: StructuredEdit, value: string): StructuredEdit {
  return { ...edit, edits: edit.edits.map((e) => ({ ...e, newText: e.newText.split("{{input}}").join(value) })) };
}

function nodeAt(file: SourceFile, path: Path) {
  const tree = parseTree(file.text, [], { allowTrailingComma: true });
  const node = tree ? findNodeAtLocation(tree, path) : undefined;
  return node ? { tree, node } : undefined;
}

/**
 * Remove a JSON property or array element together with its separating comma, using the nodes' own source ranges
 * (comments and formatting elsewhere are untouched). Works for one-line and multi-line containers and trailing commas.
 */
export function removeNodeEdits(file: SourceFile, path: Path): TextEdit[] {
  try {
    const found = nodeAt(file, path);
    if (!found) return [];
    const target = found.node.parent?.type === "property" ? found.node.parent : found.node;
    const container = target.parent;
    if (!container || !container.children) return [];
    const sibs = container.children;
    const i = sibs.indexOf(target);
    if (i < 0) return [];
    const idx = new LineIndex(file.text);
    const end = target.offset + target.length;
    let from = target.offset;
    let to = end;
    const text = file.text;
    if (i + 1 < sibs.length) {
      // Remove "elem," plus trailing blanks; if the element sat alone on its line, remove the whole line.
      let j = end;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] === ",") {
        let to2 = j + 1;
        while (to2 < text.length && (text[to2] === " " || text[to2] === "\t")) to2++;
        let ls = from;
        while (ls > 0 && (text[ls - 1] === " " || text[ls - 1] === "\t")) ls--;
        const nl = text[to2] === "\r" && text[to2 + 1] === "\n" ? 2 : text[to2] === "\n" ? 1 : 0;
        if ((ls === 0 || text[ls - 1] === "\n") && nl) { from = ls; to2 += nl; }
        to = to2;
      } else {
        to = sibs[i + 1]!.offset; // something other than a comma follows (a comment): fall back to the next element's start
      }
    } else if (i > 0) {
      from = sibs[i - 1]!.offset + sibs[i - 1]!.length; // ", elem" (the previous element keeps its own text)
    } else {
      // only child: if it sits alone on its line(s), remove the whole line so no blank line is left behind
      let ls = from;
      while (ls > 0 && (text[ls - 1] === " " || text[ls - 1] === "\t")) ls--;
      let te = to;
      while (te < text.length && (text[te] === " " || text[te] === "\t")) te++;
      const nl = text[te] === "\r" && text[te + 1] === "\n" ? 2 : text[te] === "\n" ? 1 : 0;
      if ((ls === 0 || text[ls - 1] === "\n") && nl) { from = ls; to = te + nl; }
    }
    return [{ range: idx.range(from, to), newText: "" }];
  } catch { return []; }
}

/** Replace an existing JSON value with `value` (exact node range; nothing else changes). */
export function setValueEdit(file: SourceFile, path: Path, value: unknown): TextEdit[] {
  try {
    const found = nodeAt(file, path);
    if (!found) return [];
    const idx = new LineIndex(file.text);
    return [{ range: idx.range(found.node.offset, found.node.offset + found.node.length), newText: JSON.stringify(value) }];
  } catch { return []; }
}

/** Replace one array element (string) with several string elements. */
export function replaceElementEdit(file: SourceFile, path: Path, values: string[]): TextEdit[] {
  const range = file.locate(path);
  if (!range) return [];
  return [{ range, newText: values.map((v) => JSON.stringify(v)).join(", ") }];
}

/** Range of the first occurrence of `needle` inside the source range of `path`. */
export function substringRange(file: SourceFile, path: Path, needle: string): Range | undefined {
  const r = file.locate(path);
  if (!r || !needle) return undefined;
  const idx = new LineIndex(file.text);
  const s = idx.offsetOf(r.startLine, r.startCol);
  const e = idx.offsetOf(r.endLine, r.endCol);
  const at = file.text.slice(s, e).indexOf(needle);
  return at < 0 ? undefined : idx.range(s + at, s + at + needle.length);
}

const sanitizeVar = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

/** Replace a hardcoded secret (found by AG-008) with `${VAR}`. JSON-based files only. */
export function envRefEdit(file: SourceFile, path: Path, secret: string): StructuredEdit[] {
  if (file.kind === "codex-config" || file.parsed === undefined) return [];
  const range = substringRange(file, path, secret);
  if (!range) return [];
  const last = path[path.length - 1];
  const inEnv = path.includes("env");
  let name: string;
  if (inEnv && typeof last === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) name = last.toUpperCase();
  else {
    const server = typeof path[1] === "string" ? sanitizeVar(path[1]) : "";
    const what = typeof last === "string" && path.includes("headers") ? sanitizeVar(last) : "TOKEN";
    name = [server, what === "AUTHORIZATION" ? "TOKEN" : what].filter(Boolean).join("_") || `${PRODUCT.id.toUpperCase()}_SECRET`;
  }
  return [{
    file: file.path,
    description: `Replace the hardcoded secret with \${${name}} (set ${name} in your environment, then revoke the leaked value)`,
    edits: [{ range, newText: `\${${name}}` }],
  }];
}
