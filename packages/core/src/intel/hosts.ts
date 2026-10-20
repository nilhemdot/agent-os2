/**
 * Small hand-maintained data tables. `verified: false` means the entry reflects author knowledge
 * and has not been re-checked against a primary source (see docs/SOURCES.md).
 */

export const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export const isLoopback = (host: string): boolean =>
  LOOPBACK_HOSTS.has(host.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(host) || host.toLowerCase().endsWith(".localhost");

/** Default API hosts for first-party endpoints; overriding *_BASE_URL to these is not flagged. */
export const FIRST_PARTY_API_HOSTS: { pattern: RegExp; verified: boolean }[] = [
  { pattern: /^api\.anthropic\.com$/i, verified: true },
  { pattern: /^api\.openai\.com$/i, verified: true },
  { pattern: /^generativelanguage\.googleapis\.com$/i, verified: true },
  { pattern: /^([a-z0-9-]+-)?aiplatform\.googleapis\.com$/i, verified: false },
  { pattern: /^bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com$/i, verified: false },
];

export const isFirstPartyHost = (host: string): boolean => FIRST_PARTY_API_HOSTS.some((h) => h.pattern.test(host));

/** Hosts commonly used to capture/relay data (webhook, paste, tunnel classes). */
export const EXFIL_HOST_CLASSES: { pattern: RegExp; cls: string; verified: boolean }[] = [
  { pattern: /(^|\.)webhook\.site$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)requestbin\.com$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)requestcatcher\.com$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)pipedream\.net$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)beeceptor\.com$/i, cls: "webhook-capture", verified: false },
  { pattern: /^(canary)?tokens\.org$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)ngrok(-free)?\.(io|app|dev)$/i, cls: "tunnel", verified: false },
  { pattern: /(^|\.)trycloudflare\.com$/i, cls: "tunnel", verified: false },
  { pattern: /(^|\.)loca\.lt$/i, cls: "tunnel", verified: false },
  { pattern: /(^|\.)serveo\.net$/i, cls: "tunnel", verified: false },
  { pattern: /^discord(app)?\.com$/i, cls: "chat-webhook", verified: false },
  { pattern: /^hooks\.slack\.com$/i, cls: "chat-webhook", verified: false },
  { pattern: /^pastebin\.com$/i, cls: "paste", verified: false },
  { pattern: /(^|\.)transfer\.sh$/i, cls: "paste", verified: false },
  { pattern: /(^|\.)(oast\.(pro|live|site|online|fun|me)|interact\.sh|burpcollaborator\.net)$/i, cls: "oast", verified: false },
  { pattern: /\.invalid$/i, cls: "placeholder-invalid-tld", verified: true },
];

export function exfilClass(host: string): string | undefined {
  return EXFIL_HOST_CLASSES.find((h) => h.pattern.test(host))?.cls;
}

/** MCP packages treated as "well-known": unpinned launch is medium instead of high. */
export const WELL_KNOWN_MCP_PACKAGES: { pattern: RegExp; verified: boolean }[] = [
  { pattern: /^@modelcontextprotocol\//, verified: true },
  { pattern: /^mcp-server-(fetch|git|time|sqlite|memory)$/, verified: false },
  // Widely used, vendor-published MCP servers. Popularity judged by the author; not independently verified.
  { pattern: /^@anthropic-ai\//, verified: false },
  { pattern: /^@playwright\/mcp$/, verified: false },
  { pattern: /^@upstash\/context7-mcp$/, verified: false },
  { pattern: /^chrome-devtools-mcp$/, verified: false },
  { pattern: /^@notionhq\/notion-mcp-server$/, verified: false },
];

export const isWellKnownMcpPackage = (name: string): boolean => WELL_KNOWN_MCP_PACKAGES.some((p) => p.pattern.test(name));

/** Default package-registry / index hosts; redirecting to these is not flagged. */
export const DEFAULT_REGISTRY_HOSTS: { pattern: RegExp; verified: boolean }[] = [
  { pattern: /^registry\.npmjs\.org$/i, verified: false },
  { pattern: /^registry\.yarnpkg\.com$/i, verified: false },
  { pattern: /^pypi\.org$/i, verified: false },
  { pattern: /^files\.pythonhosted\.org$/i, verified: false },
  { pattern: /^proxy\.golang\.org$/i, verified: false },
  { pattern: /^(?:index\.)?crates\.io$/i, verified: false },
  { pattern: /^(?:npm|nuget|rubygems|maven|gradle)\.pkg\.github\.com$/i, verified: false },
];
export const isDefaultRegistryHost = (host: string): boolean => DEFAULT_REGISTRY_HOSTS.some((h) => h.pattern.test(host));
