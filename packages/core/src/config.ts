import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { ScannerConfig } from "./model/types.js";
import { configFileCandidates, PRODUCT, type Product } from "./product.js";

/** Parse config text (comments and trailing commas allowed). Invalid input yields an empty config. */
export function parseConfig(text: string): ScannerConfig {
  try {
    const v = parseJsonc(text, [], { allowTrailingComma: true }) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as ScannerConfig) : {};
  } catch { return {}; }
}

export interface ConfigResolution {
  /** File name chosen (relative to the repo root), if any exists. */
  name?: string;
  /** True when the chosen file uses an older name than `product.configFile`. */
  legacy: boolean;
  /** Older-named files that exist next to a current-named one and are therefore ignored. */
  shadowed: string[];
}

/** Pick the config file to read: the current name wins; an older name is used only when the current one is absent. */
export function resolveConfigFile(exists: (name: string) => boolean, product: Product = PRODUCT): ConfigResolution {
  const cands = configFileCandidates(product);
  const present = cands.filter((c) => exists(c.name));
  if (!present.length) return { legacy: false, shadowed: [] };
  const [first, ...rest] = present;
  return { name: first!.name, legacy: first!.legacy, shadowed: rest.map((r) => r.name) };
}

export function deprecationMessage(legacyName: string, product: Product = PRODUCT): string {
  return `${product.name}: "${legacyName}" is a deprecated config file name. Rename it to "${product.configFile}" (the old name is still read, but only while the new one is absent).`;
}

/** Load the per-repo config from disk. Logs a deprecation note through `onNote` when only an older file name exists. */
export function loadConfig(root: string, opts: { product?: Product; onNote?: (msg: string) => void } = {}): ScannerConfig {
  const product = opts.product ?? PRODUCT;
  const note = opts.onNote ?? ((m: string) => console.warn(m));
  const res = resolveConfigFile((n) => existsSync(join(root, n)), product);
  if (!res.name) return {};
  if (res.legacy) note(deprecationMessage(res.name, product));
  for (const s of res.shadowed) note(`${product.name}: "${s}" is ignored because "${res.name}" exists.`);
  try { return parseConfig(readFileSync(join(root, res.name), "utf8")); } catch { return {}; }
}
