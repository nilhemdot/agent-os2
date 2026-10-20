import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Parse the paths out of a git index file (versions 2, 3, 4). Pure data parsing;
 * no git binary and no repo code is executed. Returns undefined if unparseable.
 */
export function parseGitIndex(buf: Uint8Array): Set<string> | undefined {
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (buf.length < 12 || String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!) !== "DIRC") return undefined;
    const version = dv.getUint32(4);
    const count = dv.getUint32(8);
    if (version < 2 || version > 4 || count > 1_000_000) return undefined;
    const out = new Set<string>();
    let off = 12;
    let prev = "";
    for (let i = 0; i < count; i++) {
      const entryStart = off;
      if (off + 62 > buf.length) return undefined;
      const flags = dv.getUint16(off + 60);
      off += 62;
      if (version >= 3 && flags & 0x4000) off += 2;
      let path: string;
      if (version === 4) {
        let c = buf[off++]!;
        let strip = c & 127;
        while (c & 128) { c = buf[off++]!; strip = ((strip + 1) << 7) + (c & 127); }
        let end = off;
        while (end < buf.length && buf[end] !== 0) end++;
        path = prev.slice(0, Math.max(0, prev.length - strip)) + new TextDecoder().decode(buf.subarray(off, end));
        off = end + 1;
        prev = path;
      } else {
        let end = off;
        while (end < buf.length && buf[end] !== 0) end++;
        path = new TextDecoder().decode(buf.subarray(off, end));
        const len = end - entryStart;
        off = entryStart + Math.ceil((len + 1) / 8) * 8;
      }
      if ((flags >> 12) & 3) continue; // skip conflicted-stage duplicates (still tracked, but dedupe via Set anyway)
      out.add(path);
    }
    return out;
  } catch {
    return undefined;
  }
}

/** Read tracked files from <root>/.git/index. Undefined if not a plain git checkout or unreadable. */
export function readTrackedFiles(root: string): Set<string> | undefined {
  const p = join(root, ".git", "index");
  try {
    if (!existsSync(p) || lstatSync(p).isSymbolicLink()) return undefined;
    return parseGitIndex(readFileSync(p));
  } catch {
    return undefined;
  }
}
