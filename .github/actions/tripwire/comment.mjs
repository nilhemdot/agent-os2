import { readFile } from 'node:fs/promises';

const marker = '<!-- tripwire-pr-findings -->';
const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const escape = value => String(value ?? '').replace(/[\\`*_{}\[\]()#+.!|<>@~]/g, '\\$&').replace(/[\r\n\t]+/g, ' ').slice(0, 220);

export function render(report) {
  const findings = (report.findings ?? []).filter(f => f.introducedByChange === true)
    .sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
  const rows = findings.slice(0, 50).map(f => `- **${escape(f.severity)}** ${escape(f.ruleId)}: ${escape(f.title)} — ${escape(f.file)}:${Number(f.range?.startLine ?? 0) + 1}`);
  const more = findings.length > 50 ? `\n${findings.length - 50} further findings are in SARIF.` : '';
  return `${marker}\n### Tripwire PR findings\n${rows.length ? rows.join('\n') : 'No introduced or worsened findings.'}${more}\n\nOnly introduced or worsened findings are listed. Review the SARIF for details.`;
}

async function main() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  const number = Number(process.env.PR_NUMBER);
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !number || !token) throw new Error('Missing PR comment context');
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const body = render(report);
  const api = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) throw new Error(`GitHub comment API returned ${response.status}`);
    return response.json();
  }
  let previous;
  for (let page = 1; page <= 20 && !previous; page++) {
    const comments = await request(`${api}?per_page=100&page=${page}`);
    previous = comments.find(c => c.body?.startsWith(marker) && c.user?.type === 'Bot');
    if (comments.length < 100) break;
  }
  await request(previous ? `${api}/${previous.id}` : api, { method: previous ? 'PATCH' : 'POST', body: JSON.stringify({ body }) });
}

if (process.argv[1]?.endsWith('comment.mjs')) main().catch(error => { console.error(error.message); process.exitCode = 1; });
