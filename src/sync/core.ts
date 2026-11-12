import type { Issue } from '../github/client';
export const START = '<!-- issue-bridge:start -->';
export const END = '<!-- issue-bridge:end -->';
export function normalizeRepo(value: unknown): string {
  if (typeof value !== 'string') throw new Error('github_repo must be a single https://github.com/owner/repository URL.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Invalid github_repo URL.'); }
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) throw new Error('github_repo must be a github.com HTTPS repository URL.');
  const match = /^\/([a-z\d-]+)\/([a-z\d_.-]+)\/?$/i.exec(url.pathname);
  if (!match) throw new Error('github_repo must identify one repository, without a subpath.');
  const name = match[2].replace(/\.git$/i, '');
  if (!name || name === '.' || name === '..') throw new Error('Invalid repository name.');
  return `${match[1]}/${name}`.toLowerCase();
}
// Entity-encode punctuation and Unicode metadata symbols to prevent title content
// from becoming Tasks dates, priorities, HTML, links, extra tasks or marker lines.
export function safeTitle(title: string): string {
  return [...title.replace(/\s+/gu, ' ').trim()].map(c => /[a-z\d ]/i.test(c) ? c : `&#${c.codePointAt(0)};`).join('');
}
export function renderTasks(repo: string, issues: Issue[], eol = '\n'): string {
  return [...issues].sort((a, b) => a.number - b.number).map(issue => `- [${issue.state === 'closed' ? 'x' : ' '}] [#${issue.number} ${safeTitle(issue.title)}](https://github.com/${repo}/issues/${issue.number})`).join(eol);
}
export function updateBlock(content: string, bodyOffset: number, repo: string, issues: Issue[]): string {
  const prefix = content.slice(0, bodyOffset), body = content.slice(bodyOffset);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const matches: { kind: 'start' | 'end'; start: number; end: number }[] = [];
  let offset = 0, fence = '', fenceLength = 0;
  for (const line of body.split(/(?<=\n)/)) {
    const text = line.replace(/\r?\n$/, '');
    const boundary = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (boundary) {
      if (!fence) { fence = boundary[1][0]; fenceLength = boundary[1].length; }
      else if (boundary[1][0] === fence && boundary[1].length >= fenceLength && !boundary[2].trim()) fence = '';
    }
    if (text.includes('issue-bridge:start') || text.includes('issue-bridge:end')) {
      if (fence || (text !== START && text !== END)) throw new Error('Managed markers must appear alone, outside code blocks.');
      matches.push({ kind: text === START ? 'start' : 'end', start: offset, end: offset + text.length });
    }
    offset += line.length;
  }
  const tasks = renderTasks(repo, issues, eol);
  if (!matches.length) {
    if (fence) throw new Error('Close the unfinished code block before inserting the issue section.');
    return content + (content.endsWith(eol + eol) ? '' : content.endsWith(eol) ? eol : eol + eol)
      + `## GitHub Issues${eol}${eol}${START}${eol}${tasks}${tasks ? eol : ''}${END}${eol}`;
  }
  if (matches.length !== 2 || matches[0].kind !== 'start' || matches[1].kind !== 'end') throw new Error('Expected exactly one complete managed marker pair.');
  return prefix + body.slice(0, matches[0].end) + eol + tasks + (tasks ? eol : '') + body.slice(matches[1].start);
}
export function newIssueNumbers(previous: number[] | undefined, current: number[]): number[] {
  return previous ? current.filter(id => !previous.includes(id)) : [];
}
export interface Mapping { path: string; repo: string; content: string; bodyOffset: number }
export function duplicateRepos(mappings: Mapping[]): Set<string> {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const { repo } of mappings) { if (seen.has(repo)) duplicates.add(repo); seen.add(repo); }
  return duplicates;
}
