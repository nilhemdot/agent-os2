import { lstatSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "../model/types.js";
import { parseFile } from "../parsers/parse.js";
import { classifyPath, SKIP_DIRS } from "./patterns.js";

export interface DiscoverOptions { maxFileSizeKb?: number; maxFiles?: number }
export interface DiscoverResult { files: SourceFile[]; skipped: { path: string; reason: string }[] }

const MAX_DEPTH = 12;

/** Walk the repo reading ONLY candidate files. Never follows symlinks. */
export function discover(root: string, opts: DiscoverOptions = {}): DiscoverResult {
  const cap = (opts.maxFileSizeKb ?? 1024) * 1024;
  const maxFiles = opts.maxFiles ?? 2000;
  const files: SourceFile[] = [];
  const skipped: DiscoverResult["skipped"] = [];

  const walk = (rel: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    let entries: Dirent[];
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    for (const ent of entries) {
      const name = ent.name;
      const relPath = rel ? `${rel}/${name}` : name;
      // Dirent carries the entry type, so non-candidate files cost no extra syscall; only candidates are stat'ed (for size).
      if (ent.isSymbolicLink()) { if (classifyPath(relPath)) skipped.push({ path: relPath, reason: "symlink" }); continue; }
      if (ent.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(relPath, depth + 1); continue; }
      if (!ent.isFile()) continue;
      const kind = classifyPath(relPath);
      if (!kind) continue;
      const abs = join(root, relPath);
      let size: number;
      try { size = lstatSync(abs).size; } catch { continue; }
      if (size > cap) { skipped.push({ path: relPath, reason: "too large" }); continue; }
      if (files.length >= maxFiles) { skipped.push({ path: relPath, reason: "file limit" }); continue; }
      try { files.push(parseFile(relPath, kind, readFileSync(abs, "utf8"))); }
      catch { skipped.push({ path: relPath, reason: "unreadable" }); }
    }
  };
  walk("", 0);
  return { files, skipped };
}

export interface UserLevelCandidate { rel: string; kind: import("../model/types.js").FileKind }

/** User-level agent config locations (opt-in; labelled "~/..." and never read unless the caller asks). */
export function userLevelCandidates(platform: string = process.platform): UserLevelCandidate[] {
  const desktop =
    platform === "win32" ? "AppData/Roaming/Claude/claude_desktop_config.json"
    : platform === "darwin" ? "Library/Application Support/Claude/claude_desktop_config.json"
    : ".config/Claude/claude_desktop_config.json";
  return [
    { rel: ".claude/settings.json", kind: "claude-local-settings" }, // personal file: treated like local settings
    { rel: ".claude.json", kind: "mcp-json" },
    { rel: ".codex/config.toml", kind: "codex-config" },
    { rel: ".cursor/mcp.json", kind: "cursor-mcp" },
    { rel: desktop, kind: "claude-desktop-config" },
  ];
}

/** Read user-level config files from `home`. Skips symlinks, oversized and unreadable files. */
export function discoverUserLevel(home: string, opts: DiscoverOptions & { platform?: string } = {}): DiscoverResult {
  const cap = (opts.maxFileSizeKb ?? 1024) * 1024;
  const files: SourceFile[] = [];
  const skipped: DiscoverResult["skipped"] = [];
  for (const c of userLevelCandidates(opts.platform)) {
    const abs = join(home, c.rel);
    const label = "~/" + c.rel;
    try {
      const st = lstatSync(abs);
      if (st.isSymbolicLink() || !st.isFile()) continue;
      if (st.size > cap) { skipped.push({ path: label, reason: "too large" }); continue; }
      files.push(parseFile(label, c.kind, readFileSync(abs, "utf8")));
    } catch { /* absent: fine */ }
  }
  return { files, skipped };
}
