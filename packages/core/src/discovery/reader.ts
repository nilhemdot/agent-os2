import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

const SCRIPT_READ_CAP = 256 * 1024;

/**
 * Reader handed to rules for script-following. Reads repo-relative paths as UTF-8 text only; refuses anything that is
 * not a regular file, is a symlink, resolves outside the repo root, or exceeds 256 KB. Never executes or imports.
 */
export function makeRepoReader(root: string): (repoRelPath: string) => string | undefined {
  let rootReal: string;
  try { rootReal = realpathSync(root); } catch { return () => undefined; }
  return (rel) => {
    try {
      if (!rel || rel.includes("\u0000")) return undefined;
      const abs = resolve(root, rel);
      const st = lstatSync(abs);
      if (!st.isFile() || st.isSymbolicLink() || st.size > SCRIPT_READ_CAP) return undefined;
      const real = realpathSync(abs);
      if (real !== rootReal && !real.startsWith(rootReal + sep)) return undefined;
      return readFileSync(real, "utf8");
    } catch { return undefined; }
  };
}
