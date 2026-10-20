import { readFile } from 'node:fs/promises';

// Emits GitHub workflow-command annotations (shown on the PR's "Files changed" tab and in the run summary) for introduced or worsened findings.
// This works on any repository, including private ones without code scanning. Every value comes from the repository under review, so it is
// escaped with GitHub's documented rules: a newline can never start a new workflow command.
const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const MAX = 10; // GitHub limits the number of annotations per step

export const escapeData = (v) => String(v ?? '').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
export const escapeProp = (v) => escapeData(v).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function annotations(report) {
  const findings = (report.findings ?? []).filter((f) => f.introducedByChange === true)
    .sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
  return findings.slice(0, MAX).map((f) => {
    const level = f.severity === 'critical' || f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'notice';
    const line = Number(f.range?.startLine ?? 0) + 1;
    return `::${level} file=${escapeProp(f.file)},line=${line},title=${escapeProp(`Tripwire ${f.ruleId} (${f.severity})`)}::${escapeData(String(f.title ?? '').slice(0, 300))}`;
  });
}

if (process.argv[1]?.endsWith('annotate.mjs')) {
  readFile(process.argv[2], 'utf8').then((t) => { for (const l of annotations(JSON.parse(t))) console.log(l); })
    .catch((e) => { console.error(e.message); process.exitCode = 1; });
}
