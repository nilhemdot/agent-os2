import { parseTree, findNodeAtLocation, parse as parseJsonc, type Node, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import type { FileKind, Range, SourceFile } from "../model/types.js";
import { LineIndex } from "./positions.js";

const MAX_DEPTH = 64;

function depthOk(v: unknown, d = 0): boolean {
  if (d > MAX_DEPTH) return false;
  if (v && typeof v === "object") for (const c of Object.values(v as object)) if (!depthOk(c, d + 1)) return false;
  return true;
}

export function makeJsoncFile(path: string, kind: FileKind, text: string): SourceFile {
  const idx = new LineIndex(text);
  const errors: ParseError[] = [];
  let tree: Node | undefined;
  let parsed: unknown;
  let parseError: string | undefined;
  let parseWarning: string | undefined;
  try {
    parsed = parseJsonc(text, errors, { allowTrailingComma: true });
    tree = parseTree(text, [], { allowTrailingComma: true });
    if (!depthOk(parsed)) { parsed = undefined; parseError = "nesting too deep"; }
    else if (parsed === undefined || parsed === null || typeof parsed !== "object") parseError = "invalid JSON";
    else if (errors.length) parseWarning = `${errors.length} syntax error(s); analysis is partial`;
  } catch (e) { parseError = String(e); }
  return {
    path, kind, text, parsed, parseError, parseWarning,
    locate(p): Range | undefined {
      if (!tree) return undefined;
      const n = findNodeAtLocation(tree, p);
      if (!n) return undefined;
      const start = n.parent?.type === "property" ? n.parent.offset : n.offset;
      return idx.range(start, n.offset + n.length);
    },
  };
}

/** TOML locate is approximate: smol-toml exposes no spans, so we find the table header and key line. */
export function makeTomlFile(path: string, kind: FileKind, text: string): SourceFile {
  const idx = new LineIndex(text);
  let parsed: unknown; let parseError: string | undefined;
  try { parsed = parseToml(text); if (!depthOk(parsed)) { parsed = undefined; parseError = "nesting too deep"; } }
  catch (e) { parseError = String(e); }
  const lines = text.split("\n");
  return {
    path, kind, text, parsed, parseError,
    locate(p): Range | undefined {
      const key = String(p[p.length - 1]);
      const table = p.slice(0, -1).join(".");
      let inTable = table === "";
      let offset = 0;
      for (const line of lines) {
        const t = line.trim();
        const h = /^\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(t);
        if (h) inTable = h[1]!.replace(/["'\s]/g, "") === table;
        else if (inTable && t.startsWith(key) && /^\s*=/.test(t.slice(key.length))) {
          return idx.range(offset, offset + line.replace(/\r$/, "").length);
        }
        offset += line.length + 1;
      }
      const tl = lines.findIndex((l) => l.replace(/["'\s]/g, "").startsWith(`[${p.join(".")}]`));
      if (tl >= 0) return idx.range(idx.offsetOf(tl, 0), idx.offsetOf(tl, lines[tl]!.replace(/\r$/, "").length));
      return undefined;
    },
  };
}

export function makeTextFile(path: string, kind: FileKind, text: string): SourceFile {
  return { path, kind, text, locate: () => undefined };
}

const STRUCTURED: FileKind[] = [
  "claude-settings", "claude-local-settings", "mcp-json", "cursor-mcp", "vscode-mcp",
  "vscode-tasks", "gemini-settings", "claude-desktop-config",
];

export function parseFile(path: string, kind: FileKind, text: string): SourceFile {
  if (kind === "codex-config") return makeTomlFile(path, kind, text);
  if (STRUCTURED.includes(kind)) return makeJsoncFile(path, kind, text);
  return makeTextFile(path, kind, text);
}
