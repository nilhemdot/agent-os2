import type { Finding, Range, Rule, Severity } from "../model/types.js";
import { LineIndex } from "../parsers/positions.js";
import { clip, defineRule, finding, INSTRUCTION_KINDS, type RuleMeta } from "./helpers.js";

/**
 * AG-024: content in instruction files that a reviewer will not read but a model can: large encoded blobs, data: URIs and text
 * hidden in HTML comments or markdown link titles. Heuristic; the thresholds below are deliberate and documented in docs/RULES.md.
 * All scans are linear (no nested quantifiers) and bounded by the caller's file size cap.
 */
export const M024: RuleMeta = { id: "AG-024", title: "Encoded or hidden content in an instruction file", category: "hidden-text", defaultSeverity: "medium", experimental: true, references: ["https://genai.owasp.org/llmrisk/llm01-prompt-injection/"] };

const B64_MIN = 200;       // characters of base64 alphabet in one run (about 150 bytes)
const HEX_MIN = 128;       // hex digits (64 bytes)
const WRAP_LINE_MIN = 40;  // a wrapped blob has long all-alphabet lines
const COMMENT_MIN = 40;    // an HTML comment shorter than this is a note, not a payload
const TITLE_MIN = 60;

const B64_RE = /[A-Za-z0-9+/]{80,}={0,2}/g;
const HEX_RE = /(?<![0-9A-Za-z])[0-9a-fA-F]{80,}(?![0-9A-Za-z])/g;
const DATA_URI_RE = /\bdata:([a-z]+\/[a-z0-9.+-]+)?(;[a-z0-9=.-]+)*,/gi;
const DIRECTIVE = /\b(?:ignore (?:all |any |the )?(?:previous|prior|above|earlier)|disregard|do not (?:tell|mention|reveal|show|inform)|don't (?:tell|mention|reveal|show)|without (?:telling|asking|informing)|you (?:must|should|will|are to)|always (?:run|execute|include|add|send|call)|system prompt|instructions? (?:above|below)|secretly|silently|quietly|exfiltrat\w*|curl\b|wget\b|\.env\b|api[_ -]?key|password|credentials?|private key|ssh|base64|execute|run the following|<\s*\/?\s*(?:system|instructions?)\s*>)/i;

function decodeRun(kind: "base64" | "hex", run: string): string | undefined {
  try { return printableText(kind === "base64" ? Buffer.from(run, "base64") : Buffer.from(run.length % 2 ? run.slice(0, -1) : run, "hex")); } catch { return undefined; }
}
const decodesToDirective = (kind: "base64" | "hex", run: string): boolean => { const d = decodeRun(kind, run); return d !== undefined && DIRECTIVE.test(d); };

function printableText(b: Buffer): string | undefined {
  if (b.length < 24) return undefined;
  const s = b.toString("utf8");
  if (s.includes("�")) return undefined;
  let ok = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c > 160) ok++; }
  return ok / s.length >= 0.9 ? s : undefined;
}

const finish = (out: Finding[], range: Range, sev: Severity, conf: Finding["confidence"], title: string, why: string, evidence: string, fix: string, path: string, file: Parameters<typeof finding>[1]) =>
  out.push(finding(M024, file, undefined, { severity: sev, confidence: conf, range, jsonPath: [path], title, whyItMatters: why, evidence, fix }));

export const ag024 = defineRule(M024, INSTRUCTION_KINDS, (file) => {
  const out: Finding[] = [];
  const text = file.text;
  const idx = new LineIndex(text);
  const claimed: [number, number][] = [];
  const overlaps = (a: number, b: number) => claimed.some(([x, y]) => a < y && b > x);
  const claim = (a: number, b: number) => claimed.push([a, b]);

  // ---- data: URIs (before blobs, so their payloads are reported once)
  DATA_URI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATA_URI_RE.exec(text))) {
    const start = m.index; let end = start + m[0].length;
    while (end < text.length && /[A-Za-z0-9+/=%_.~-]/.test(text[end]!) && end - start < 200_000) end++;
    const payload = end - (start + m[0].length);
    if (payload < 100) continue;
    const mime = (m[1] ?? "text/plain").toLowerCase();
    claim(start, end);
    const image = mime.startsWith("image/");
    const sev: Severity = image ? "low" : mime === "text/plain" || mime.startsWith("text/") || mime.startsWith("application/") ? "high" : "medium";
    finish(out, idx.range(start, Math.min(end, start + 80)), sev, image ? "medium" : "high",
      image ? `Embedded ${mime} data: URI` : `Embedded ${mime} data: URI (${payload} characters)`,
      image ? "An embedded image is invisible in a diff and models that read images can follow text drawn in it." : "Embedded data is not human-readable in review but is passed to the model as part of the file.",
      clip(text.slice(start, end), 120), "Remove the embedded data or reference a reviewed file instead.", `data-uri:${mime}:${text.slice(start + m[0].length, start + m[0].length + 24)}`, file);
  }

  // ---- long encoded runs on one line
  for (const [re, kind, min] of [[HEX_RE, "hex", HEX_MIN], [B64_RE, "base64", B64_MIN]] as const) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const a = m.index, b = a + m[0].length;
      if (overlaps(a, b)) continue;
      // a path-like or URL-like run (many slashes in a row of words) is not a blob; pure base64 has few "/" relative to length
      if (kind === "base64" && (m[0].match(/\//g)?.length ?? 0) > m[0].length / 8 && !/[+=]/.test(m[0])) continue;
      // runs between 80 characters and the blob threshold are only reported when they decode to an instruction
      if (m[0].length < min && !decodesToDirective(kind, m[0])) continue;
      claim(a, b);
      report(out, file, idx, kind, text.slice(a, b), a, b);
    }
  }

  // ---- encoded blobs wrapped over many lines (MIME-style 64/76 columns)
  const lines = text.split(/\r?\n/);
  const starts: number[] = []; let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + (text[off + l.length] === "\r" ? 2 : 1); }
  let i = 0;
  while (i < lines.length) {
    const kindOf = (l: string): "base64" | "hex" | undefined => {
      const t = l.trim();
      if (t.length < WRAP_LINE_MIN) return undefined;
      if (/^[0-9a-fA-F]+$/.test(t)) return "hex";
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return "base64";
      return undefined;
    };
    const k = kindOf(lines[i]!);
    if (!k) { i++; continue; }
    let j = i; let total = 0; const parts: string[] = [];
    while (j < lines.length && kindOf(lines[j]!) === k) { total += lines[j]!.trim().length; parts.push(lines[j]!.trim()); j++; }
    // allow one shorter final line (the tail of a wrapped blob)
    if (j < lines.length && /^[A-Za-z0-9+/=]+$/.test(lines[j]!.trim()) && lines[j]!.trim().length > 0 && lines[j]!.trim().length < WRAP_LINE_MIN) { parts.push(lines[j]!.trim()); total += lines[j]!.trim().length; j++; }
    const a = starts[i]!; const b = (starts[j - 1] ?? a) + lines[j - 1]!.length;
    if (j - i >= 2 && total >= (k === "base64" ? B64_MIN : HEX_MIN) && !overlaps(a, b)) { claim(a, b); report(out, file, idx, k, parts.join(""), a, b); }
    i = Math.max(j, i + 1);
  }

  // ---- HTML comments
  const lower = text.toLowerCase();
  let pos = 0;
  while (pos < lower.length) {
    const s = lower.indexOf("<!--", pos);
    if (s < 0) break;
    let e = lower.indexOf("-->", s + 4);
    const unterminated = e < 0;
    if (unterminated) e = Math.min(lower.length, s + 4 + 4000);
    const body = text.slice(s + 4, e);
    pos = e + 3;
    if (body.trim().length < COMMENT_MIN) continue;
    const directive = DIRECTIVE.test(body);
    if (!directive && body.trim().length < 400) continue; // long plain comments are common (license headers, TODO blocks)
    const sev: Severity = directive ? "high" : "low";
    finish(out, idx.range(s, Math.min(e + 3, s + 4 + 200)), sev, directive ? "medium" : "low",
      directive ? "HTML comment contains instructions aimed at an agent" : "Very long HTML comment",
      "HTML comments are not rendered in a Markdown preview or on GitHub, but the model reads them as part of the file.",
      clip(body.trim(), 200), "Delete the comment, or move legitimate notes out of the instruction file.", `comment:${body.trim().slice(0, 48)}`, file);
  }

  // ---- markdown link/image titles
  const TITLE_RE = /\]\(\s*[^\s)]{0,2000}\s+"([^"\n]{1,2000})"\s*\)/g;
  TITLE_RE.lastIndex = 0;
  while ((m = TITLE_RE.exec(text))) {
    const title = m[1]!;
    const directive = DIRECTIVE.test(title);
    if (title.length < TITLE_MIN && !directive) continue;
    if (title.length < 20) continue;
    finish(out, idx.range(m.index, m.index + m[0].length), directive ? "high" : "medium", directive ? "medium" : "low",
      directive ? "Link title contains instructions aimed at an agent" : "Unusually long link title",
      "Link titles show only as a tooltip, but the model reads them as part of the file.",
      clip(title, 200), "Shorten or remove the title.", `link-title:${title.slice(0, 48)}`, file);
  }
  return out;
});

function report(out: Finding[], file: Parameters<typeof finding>[1], idx: LineIndex, kind: "base64" | "hex", run: string, a: number, b: number): void {
  let decoded: string | undefined;
  try {
    const bytes = kind === "base64" ? Buffer.from(run, "base64") : Buffer.from(run.length % 2 ? run.slice(0, -1) : run, "hex");
    decoded = printableText(bytes);
  } catch { /* not decodable */ }
  const readable = decoded !== undefined;
  const directive = readable && DIRECTIVE.test(decoded!);
  const sev: Severity = directive ? "high" : "medium";
  out.push(finding(M024, file, undefined, {
    severity: sev, confidence: directive ? "high" : readable ? "medium" : "low", range: idx.range(a, Math.min(b, a + 120)), jsonPath: [`${kind}-blob`],
    subject: run.slice(0, 24),
    title: directive ? `Encoded ${kind} blob decodes to an instruction` : readable ? `Encoded ${kind} blob decodes to readable text` : `Large ${kind} blob (${run.length} characters)`,
    whyItMatters: "Encoded content cannot be reviewed by reading the file, but a model can decode it and may follow what it says. Legitimate instruction files rarely contain long encoded runs.",
    evidence: readable ? `decoded: "${clip(decoded!.replace(/\s+/g, " "), 160)}"  | raw: ${run.slice(0, 40)}…` : `${run.slice(0, 60)}… (${run.length} chars)`,
    fix: "Remove the blob, or replace it with a reviewed file or plain text.",
  }));
}

export const blobRules: Rule[] = [ag024];
