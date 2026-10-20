import { SEVERITY_ORDER, type Severity } from "../model/types.js";
import { escapeHtml as h, mdCell as m } from "./escape.js";
import type { ReportData, ReportFinding, SeverityCounts, TrendMonth } from "./types.js";

/** Same wording as the "History report" paragraph in docs/LIMITS.md (a test keeps the two identical). */
export const COVERAGE_TEXT =
  "This report flags known risky patterns in the files that configure AI coding agents (agent settings, MCP server definitions, instruction files and tasks), using fixed rules, offline. " +
  "It does not read your application source code, dependencies or build scripts, and it does not show that a repository is free of problems. " +
  "Each finding is dated to the first-parent commit at which it appeared; commits that arrived through a merge are attributed to the merge, a renamed file starts a new finding, and a shallow or truncated history only gives 'on or before' dates. " +
  "Monthly counts are computed by scanning the repository as it was at the end of each month with today's rules, so a rule added recently also counts findings from earlier months. " +
  "Suppressions and size limits are read from the current version of the repository's configuration unless --no-repo-config is used.";

export const DEMO_TEXT = "DEMO DATA (synthetic)";
const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
const SEV_DESC: Severity[] = [...SEVERITY_ORDER].reverse();

const day = (iso: string): string => iso.slice(0, 10);
const plural = (n: number, one: string, many = one + "s"): string => `${n} ${n === 1 ? one : many}`;

export function renderJson(d: ReportData): string {
  return JSON.stringify(d, null, 2) + "\n";
}

function origin(f: ReportFinding): string {
  const i = f.introducedIn;
  if (!i) return "n/a (no git history)";
  let s = (i.exact ? "" : "on or before ") + i.commit;
  if (i.subject) s += ` "${i.subject}"`;
  if (i.author) s += ` by ${i.author}`;
  return s;
}
const originDate = (f: ReportFinding): string => (f.introducedIn ? day(f.introducedIn.date) + (f.introducedIn.exact ? "" : " or earlier") : "n/a");
function resolvedAt(f: ReportFinding): string {
  const r = f.resolvedIn;
  if (!r) return "n/a";
  let s = `${r.commit} (${day(r.date)})`;
  if (r.subject) s += ` "${r.subject}"`;
  if (r.author) s += ` by ${r.author}`;
  return s;
}
const rule = (f: ReportFinding): string => `${f.ruleId}: ${f.title}`;
const where = (f: ReportFinding): string => `${f.file}:${f.range.startLine}`;

function summarySentence(d: ReportData): string {
  const repos = d.meta.repos.length;
  return `${plural(d.summary.open, "open finding")} across ${plural(repos, "repository", "repositories")}; ${d.summary.highCritical} high/critical; trend over the last ${plural(d.trend.windowMonths, "month")}.`;
}

const openFindings = (d: ReportData) => d.findings.filter((f) => f.status === "open");
const resolvedFindings = (d: ReportData) => d.findings.filter((f) => f.status === "resolved");
const trendRow = (t: TrendMonth, c: SeverityCounts = t.open) => [t.month, c.critical, c.high, c.medium, c.low, c.info, t.highCritical, t.introduced, t.resolved];

/* ---------------------------------- Markdown ---------------------------------- */

function mdTable(head: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map((r) => line(r.map(String)))].join("\n");
}

export function renderMarkdown(d: ReportData): string {
  const out: string[] = [];
  out.push(`# ${m(d.meta.tool.name)} report`);
  if (d.meta.demo) out.push(`> **${DEMO_TEXT}**`);
  out.push(`Scan date: ${m(day(d.meta.generatedAt))}`);
  out.push("## Summary", m(summarySentence(d)));
  for (const r of d.meta.repos) for (const n of r.notes) out.push(`- ${m(r.name)}: ${m(n)}`);
  out.push("## Trend");
  out.push(d.trend.months.length
    ? mdTable(["Month", "Critical", "High", "Medium", "Low", "Info", "High+critical", "Introduced", "Resolved"], d.trend.months.map((t) => trendRow(t).map((c) => (typeof c === "string" ? m(c) : c))))
    : "No monthly history is available.");
  out.push(m(d.trend.method, 2000));
  out.push("## Counts by severity");
  out.push(mdTable(["Severity", "Open"], SEV_DESC.map((s) => [SEV_LABEL[s], d.summary.bySeverity[s]])));
  if (d.meta.repos.length > 1) {
    out.push(mdTable(["Repository", "Open", "Critical", "High", "Medium", "Low", "Info", "Resolved"],
      d.summary.perRepo.map((r) => [m(r.repo), r.open, r.bySeverity.critical, r.bySeverity.high, r.bySeverity.medium, r.bySeverity.low, r.bySeverity.info, r.resolved])));
  }
  out.push("## Findings");
  const open = openFindings(d);
  if (!open.length) out.push("No open findings.");
  for (const s of SEV_DESC) {
    const fs = open.filter((f) => f.severity === s);
    if (!fs.length) continue;
    out.push(`### ${SEV_LABEL[s]}`);
    out.push(mdTable(["Repo", "Rule", "File:line", "Commit", "Date", "Fix"], fs.map((f) => [m(f.repo), m(rule(f)), m(where(f)), m(origin(f)), m(originDate(f)), m(f.fix)])));
  }
  out.push("## Resolved this period");
  const res = resolvedFindings(d);
  out.push(res.length
    ? mdTable(["Repo", "Rule", "Severity", "File:line", "Introduced", "Resolved"], res.map((f) => [m(f.repo), m(rule(f)), SEV_LABEL[f.severity], m(where(f)), m(origin(f)), m(resolvedAt(f))]))
    : "None.");
  out.push("## What this report does and does not cover", m(COVERAGE_TEXT, 4000));
  out.push("## Run details");
  out.push(`- Tool: ${m(d.meta.tool.name)} ${m(d.meta.tool.version)}`, `- Generated: ${m(d.meta.generatedAt)}`);
  for (const r of d.meta.repos) out.push(`- ${m(r.name)}: ${r.git ? `commits examined ${r.commitsExamined}, range ${m(r.firstCommit ?? "n/a")}..${m(r.headCommit ?? "n/a")}` : "no git history"}`);
  if (d.meta.demo) out.push(`- ${DEMO_TEXT}`);
  return out.join("\n\n") + "\n";
}

/* ------------------------------------ HTML ------------------------------------ */

const CSS = `
:root{color-scheme:light}
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:0 auto;padding:24px;max-width:1000px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}h3{font-size:15px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:6px 0 12px}
th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
th{background:#eee}
#demo-banner{border:3px solid #000;padding:8px 12px;font-weight:700;font-size:18px;margin:0 0 16px;text-align:center}
.muted{color:#444}.note{font-size:12px}svg{max-width:100%;height:auto;border:1px solid #bbb;margin:6px 0}
@media print{
  @page{margin:14mm}
  body{padding:0;max-width:none;font-size:11pt}
  #findings,#resolved,#coverage{break-before:page}
  tr,svg,h2,h3{break-inside:avoid}h2,h3{break-after:avoid}
  thead{display:table-header-group}
}`;

function table(head: string[], rows: string[][], rowAttrs?: (i: number) => string): string {
  const th = head.map((c) => `<th scope="col">${c}</th>`).join("");
  const body = rows.map((r, i) => `<tr${rowAttrs ? rowAttrs(i) : ""}>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Draw every k-th month label, always including the latest, so neighbouring labels are at least `minPx` apart. */
const labelEvery = (stepPx: number, minPx = 38): number => Math.max(1, Math.ceil(minPx / Math.max(stepPx, 1)));

function barChart(months: TrendMonth[]): string {
  const W = 640, H = 220, L = 40, B = 30, T = 18, R = 10;
  const max = Math.max(1, ...months.map((t) => t.highCritical));
  const n = months.length;
  const bw = (W - L - R) / n;
  const k = labelEvery(bw);
  const bars = months.map((t, i) => {
    const bh = ((H - T - B) * t.highCritical) / max;
    const x = L + i * bw + bw * 0.15;
    const y = H - B - bh;
    const cx = (x + bw * 0.35).toFixed(1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" fill="#333"/>` +
      (bw >= String(t.highCritical).length * 7 + 4 ?`<text x="${cx}" y="${(y - 3).toFixed(1)}" font-size="11" text-anchor="middle">${t.highCritical}</text>` : "") +
      ((n - 1 - i) % k === 0 ? `<text x="${cx}" y="${H - 12}" font-size="10" text-anchor="middle">${h(t.month.slice(2))}</text>` : "");
  }).join("");
  return `<svg role="img" aria-label="High and critical open findings at the end of each month" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#000"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#000"/>` +
    `<text x="${L - 4}" y="${T + 4}" font-size="10" text-anchor="end">${max}</text><text x="${L - 4}" y="${H - B}" font-size="10" text-anchor="end">0</text>${bars}</svg>`;
}

const DASH: Record<Severity, string> = { critical: "", high: "6 3", medium: "2 3", low: "8 3 2 3", info: "1 4" };

/** One line per severity, distinguished by dash pattern; the legend sits in its own column to the right of the plot, never over the data. */
function lineChart(months: TrendMonth[]): string {
  const W = 640, H = 240, L = 40, B = 30, T = 18, R = 120;
  const n = months.length;
  const max = Math.max(1, ...months.flatMap((t) => SEV_DESC.map((s) => t.open[s])));
  const step = n > 1 ? (W - L - R - 10) / (n - 1) : 0;
  const xy = (i: number, v: number) => [L + 5 + i * step, H - B - ((H - T - B) * v) / max] as const;
  const lines = SEV_DESC.map((s) => {
    const pts = months.map((t, i) => xy(i, t.open[s]).map((v) => v.toFixed(1)).join(",")).join(" ");
    const dots = n <= 12 ? months.map((t, i) => { const [cx, cy] = xy(i, t.open[s]); return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="#000"/>`; }).join("") : "";
    return `<polyline points="${pts}" fill="none" stroke="#000" stroke-width="1.6" stroke-dasharray="${DASH[s]}"/>${dots}`;
  }).join("");
  const legend = SEV_DESC.map((s, i) => {
    const y = T + 8 + i * 20;
    return `<line x1="${W - R + 14}" y1="${y}" x2="${W - R + 46}" y2="${y}" stroke="#000" stroke-width="1.6" stroke-dasharray="${DASH[s]}"/><text x="${W - R + 52}" y="${y + 4}" font-size="11">${SEV_LABEL[s]}</text>`;
  }).join("");
  const k = labelEvery(step || 1000);
  const xl = months.map((t, i) => ((n - 1 - i) % k === 0 ? `<text x="${xy(i, 0)[0].toFixed(1)}" y="${H - 12}" font-size="10" text-anchor="middle">${h(t.month.slice(2))}</text>` : "")).join("");
  return `<svg role="img" aria-label="Open findings by severity at the end of each month" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#000"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#000"/>` +
    `<text x="${L - 4}" y="${T + 4}" font-size="10" text-anchor="end">${max}</text><text x="${L - 4}" y="${H - B}" font-size="10" text-anchor="end">0</text>${lines}${legend}${xl}</svg>`;
}

export function renderHtml(d: ReportData): string {
  const name = h(d.meta.tool.name);
  const o: string[] = [];
  o.push("<!doctype html>", '<html lang="en"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${name} report</title><style>${CSS}</style></head><body>`);
  if (d.meta.demo) o.push(`<div id="demo-banner">${DEMO_TEXT}</div>`);
  o.push(`<header id="title"><h1>${name} report</h1><p class="muted">Scan date: ${h(day(d.meta.generatedAt))}</p></header>`);
  o.push(`<section id="summary"><h2>Summary</h2><p>${h(summarySentence(d))}</p>`);
  const notes = d.meta.repos.flatMap((r) => r.notes.map((n) => `<li>${h(r.name)}: ${h(n)}</li>`));
  if (notes.length) o.push(`<ul class="note">${notes.join("")}</ul>`);
  o.push("</section>");

  o.push('<section id="trend"><h2>Trend</h2>');
  if (d.trend.months.length) {
    o.push("<h3>High and critical findings open at the end of each month</h3>", barChart(d.trend.months));
    o.push("<h3>Open findings by severity</h3>", lineChart(d.trend.months));
    o.push(table(["Month", "Critical", "High", "Medium", "Low", "Info", "High+critical", "Introduced", "Resolved"],
      d.trend.months.map((t) => trendRow(t).map((c) => h(String(c))))));
  } else o.push("<p>No monthly history is available.</p>");
  o.push(`<p class="note">${h(d.trend.method, 2000)}</p></section>`);

  o.push('<section id="severity-counts"><h2>Counts by severity</h2>');
  o.push(table(["Severity", "Open findings"], SEV_DESC.map((s) => [SEV_LABEL[s], String(d.summary.bySeverity[s])])));
  if (d.meta.repos.length > 1) {
    o.push(table(["Repository", "Open", "Critical", "High", "Medium", "Low", "Info", "Resolved"],
      d.summary.perRepo.map((r) => [h(r.repo), String(r.open), String(r.bySeverity.critical), String(r.bySeverity.high), String(r.bySeverity.medium), String(r.bySeverity.low), String(r.bySeverity.info), String(r.resolved)])));
  }
  o.push("</section>");

  o.push('<section id="findings"><h2>Findings</h2>');
  const open = openFindings(d);
  if (!open.length) o.push("<p>No open findings.</p>");
  for (const s of SEV_DESC) {
    const fs = open.filter((f) => f.severity === s);
    if (!fs.length) continue;
    o.push(`<h3 data-severity="${s}">${SEV_LABEL[s]} (${fs.length})</h3>`);
    o.push(table(["Repo", "Rule", "File:line", "Commit", "Date", "Fix"],
      fs.map((f) => [h(f.repo), h(rule(f)), h(where(f)), h(origin(f)), h(originDate(f)), h(f.fix, 300)]), () => ` class="finding" data-severity="${s}"`));
  }
  o.push("</section>");

  o.push('<section id="resolved"><h2>Resolved this period</h2>');
  const res = resolvedFindings(d);
  o.push(res.length
    ? table(["Repo", "Rule", "Severity", "File:line", "Introduced", "Resolved"], res.map((f) => [h(f.repo), h(rule(f)), SEV_LABEL[f.severity], h(where(f)), h(origin(f)), h(resolvedAt(f))]))
    : "<p>None.</p>");
  o.push("</section>");

  o.push(`<section id="coverage"><h2>What this report does and does not cover</h2><p>${h(COVERAGE_TEXT, 4000)}</p></section>`);

  o.push('<footer id="footer"><h2>Run details</h2><ul class="note">');
  o.push(`<li>Tool: ${name} ${h(d.meta.tool.version)}</li><li>Generated: ${h(d.meta.generatedAt)}</li>`);
  for (const r of d.meta.repos) o.push(`<li>${h(r.name)}: ${r.git ? `commits examined ${r.commitsExamined}, range ${h(r.firstCommit ?? "n/a")}..${h(r.headCommit ?? "n/a")}` : "no git history"}</li>`);
  if (d.meta.demo) o.push(`<li><strong>${DEMO_TEXT}</strong></li>`);
  o.push("</ul></footer></body></html>");
  return o.join("\n") + "\n";
}
