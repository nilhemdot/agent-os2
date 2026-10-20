import product from "../../../product.json";

/**
 * The single source of product identity. Everything in code reads from here; product.json is the one file to edit
 * (then run `node scripts/rename-product.mjs --apply` to update docs, fixtures and package names, and
 * `pnpm --filter ./packages/extension run manifest` to regenerate the extension manifest).
 *
 * Not constantized: rule IDs ("AG-001"). They are stable identifiers in SARIF and suppressions; changing the
 * prefix is a separate decision (see DECISIONS.md).
 */
export interface Product {
  /** Display name, e.g. in messages and the status bar. */
  name: string;
  /** Lowercase id: command ids, view types, URI schemes, package scope. */
  id: string;
  /** Prefix of every setting, e.g. "<prefix>.maxFileSizeKb". */
  settingsPrefix: string;
  /** Per-repo config file name (suppressions). */
  configFile: string;
  /** Older config names that are still read (with a deprecation note) when `configFile` is absent. */
  legacyConfigFiles: string[];
  lockFile: string;
  /** Marketplace publisher id (placeholder until you choose one). */
  publisher: string;
  copyrightHolder: string;
  /** Base URL of the hosted rule documentation; empty means "not published", and SARIF omits helpUri. */
  docsUrl: string;
  ruleIdPrefix: string;
}

export const PRODUCT: Product = product as Product;

/** Command id, e.g. cmd("scanWorkspace") -> "<id>.scanWorkspace". */
export const cmd = (name: string, p: Product = PRODUCT): string => `${p.id}.${name}`;
/** Custom URI scheme, e.g. scheme("preview") -> "<id>-preview". */
export const scheme = (name: string, p: Product = PRODUCT): string => `${p.id}-${name}`;
/** Fully qualified setting key. */
export const setting = (name: string, p: Product = PRODUCT): string => `${p.settingsPrefix}.${name}`;
/** Extension identifier "<publisher>.<id>". */
export const extensionId = (p: Product = PRODUCT): string => `${p.publisher}.${p.id}`;

/** Config file names to try, in order: the current name, then legacy names that differ from it. */
export function configFileCandidates(p: Product = PRODUCT): { name: string; legacy: boolean }[] {
  const out = [{ name: p.configFile, legacy: false }];
  for (const l of p.legacyConfigFiles) if (l !== p.configFile) out.push({ name: l, legacy: true });
  return out;
}
