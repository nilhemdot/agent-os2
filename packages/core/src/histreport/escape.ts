/**
 * The ONE place where dynamic strings are made safe for output. Every renderer passes every scanned or user-supplied string
 * (file paths, evidence, repo names, commit subjects, author names, rule text) through `text()` / `escapeHtml()` / `mdCell()`.
 */

/** Invisible, control, bidi, tag and variation-selector characters, and lone surrogates: never passed through raw. */
const INVISIBLE = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u00AD\\u034F\\u061C\\u115F\\u1160\\u17B4\\u17B5\\u180B-\\u180F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\u3164\\uFE00-\\uFE0F\\uFEFF\\uFFA0\\uFFF0-\\uFFFB\\u{E0000}-\\u{E01EF}]" +
    "|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]",
  "gu",
);

const hex = (cp: number): string => `<U+${cp.toString(16).toUpperCase().padStart(4, "0")}>`;

/** Replaces invisible/control characters with a visible `<U+XXXX>` marker. Line breaks and tabs become one space first. */
export function visible(s: string): string {
  return String(s).replace(/[\r\n\t]+/g, " ").replace(INVISIBLE, (m) => hex(m.codePointAt(0)!));
}

/** Truncates to `max` code points, saying how much was cut. */
export function clip(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join("") + ` ...[${cps.length - max} more characters]`;
}

export const MAX_FIELD = 400;

const SCHEMES = /\b(https?|ftps?|wss?|file|javascript|vbscript|data|blob|mailto|tel|about):/gi;

/** URL schemes in displayed text are defanged ("https://x" shows as "https[:]//x"): nothing in a report can become a link or a request. */
export function defang(s: string): string {
  return s.replace(SCHEMES, "$1[:]");
}

/** Safe plain text for display (not yet HTML- or Markdown-escaped). */
export function text(s: string, max = MAX_FIELD): string {
  return defang(visible(clip(String(s), max)));
}

const HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

/** HTML-escape for text and attribute values. The only function renderers use for dynamic HTML content. */
export function escapeHtml(s: string, max = MAX_FIELD): string {
  return text(s, max).replace(/[&<>"'`]/g, (c) => HTML[c]!);
}

/** Markdown table cell: safe text with pipes, backslashes, markup characters and HTML escaped. */
export function mdCell(s: string, max = MAX_FIELD): string {
  return text(s, max).replace(/[\\|`*_{}\[\]<>#!~&]/g, (c) => "\\" + c);
}
