import type { Issue } from '../github/client';
import { appendSourceTag, normalizeSourceTag } from './sourceTags';
export const START = '<!-- issue-bridge:start -->';
export const END = '<!-- issue-bridge:end -->';
export function normalizeRepo(value: unknown): string
{
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
// A URL list may also contain websites, documentation or account links.
export function repositoryFromProperty(value: unknown): string | null
{
  for (const candidate of Array.isArray(value) ? value : [value]) {
    try { return normalizeRepo(candidate); }
    catch { /* Only complete GitHub repository URLs are mappings. */ }
  }
  return null;
}

export interface TaskOptions { respectTasks: boolean; format: 'emoji' | 'dataview'; globalFilter?: string; usedIds?: Set<string>; sourceTag?: string }
const PLAIN_TASKS: TaskOptions = { respectTasks: false, format: 'emoji' };
const ID_PATTERN = /(?:🆔\uFE0F?\s*([a-z\d_-]+)|[[(]\s*id::\s*([a-z\d_-]+)\s*[\])])/i;

export function taskIds(content: string): string[]
{
  return [...content.matchAll(new RegExp(ID_PATTERN.source, 'gi'))].map(match => match[1] ?? match[2]);
}

export function createTaskId(usedIds: Set<string>, random: () => number = Math.random): string
{
  // Match Tasks' six-character base-36 format, retrying collisions.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const id = random().toString(36).slice(2, 8);
    if (!/^[a-z\d]{6}$/.test(id) || usedIds.has(id)) continue;
    usedIds.add(id);
    return id;
  }
  throw new Error('Could not generate a unique task ID; previous tasks retained.');
}

function taskMetadata(issue: Issue, previous: string, options: TaskOptions): string
{
  if (!options.respectTasks) return previous;
  const datePattern = /(?:➕\uFE0F?\s*(\d{4}-\d{2}-\d{2})|[[(]\s*created::\s*(\d{4}-\d{2}-\d{2})\s*[\])])/;
  const previousId = ID_PATTERN.exec(previous), previousDate = datePattern.exec(previous);
  const id = previousId?.[1] ?? previousId?.[2] ?? createTaskId(options.usedIds ?? new Set());
  const date = previousDate?.[1] ?? previousDate?.[2] ?? issue.createdAt.slice(0, 10);
  let suffix = previous.replace(ID_PATTERN, '').replace(datePattern, '').trimEnd();
  // Remove only our two fields. Scheduling, dependencies and other local text survive.
  suffix = suffix.trim() ? ` ${suffix.trim()}` : '';
  const filter = options.globalFilter?.trim();
  if (filter && !suffix.includes(filter)) suffix += ` ${filter}`;
  return suffix + (options.format === 'dataview' ? ` [id:: ${id}] [created:: ${date}]` : ` 🆔 ${id} ➕ ${date}`);
}
// Ordinary Markdown escaping remains readable in Live Preview. Only symbols
// interpreted as Tasks metadata (and Dataview field separators) need entities.
export function safeTitle(title: string): string
{
  const metadata = new Set([...'📅⏳🛫➕✅❌🔁🔺⏫🔼🔽⏬🆔⛔🏁']);
  return [...title.replace(/[\s\u200b\u202a-\u202e\u2066-\u2069]+/gu, ' ').trim()].map(c =>
  {
    if (metadata.has(c)) return `&#${c.codePointAt(0)};`;
    return '\\`*_{}[]()<>#!|&'.includes(c) ? `\\${c}` : c;
  }).join('').replace(/::/g, '&#58;&#58;');
}
export function renderTasks(repo: string, issues: Issue[], eol = '\n', options = PLAIN_TASKS, previous = ''): string
{
  const sourceTag = normalizeSourceTag(options.sourceTag ?? '');
  const usedIds = options.usedIds ?? new Set<string>();
  for (const id of taskIds(previous)) usedIds.add(id);
  const metadataOptions = { ...options, usedIds };
  const suffixes = new Map<number, string>();
  for (const line of previous.split(/\r?\n/)) {
    const match = /^- \[[^\]]\] .*?\]\(https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)\)(.*)$/.exec(line);
    if (match?.[1] === repo) {
      const number = Number(match[2]);
      if (suffixes.has(number)) throw new Error('Duplicate imported issue lines; resolve them before syncing.');
      suffixes.set(number, match[3]);
    }
  }
  return [...issues].sort((a, b) => a.number - b.number).map(issue =>
  {
    const suffix = appendSourceTag(taskMetadata(issue, suffixes.get(issue.number) ?? '', metadataOptions), sourceTag);
    return `- [${issue.state === 'closed' ? 'x' : ' '}] ${safeTitle(issue.title)} [#${issue.number}](https://github.com/${repo}/issues/${issue.number})${suffix}`;
  }).join(eol);
}
export function updateBlock(content: string, bodyOffset: number, repo: string, issues: Issue[], options = PLAIN_TASKS): string
{
  const prefix = content.slice(0, bodyOffset), body = content.slice(bodyOffset);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const matches: { kind: 'start' | 'end'; start: number; end: number }[] = [];
  let offset = 0, fence = '', fenceLength = 0;
  for (const line of body.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
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
  if (!matches.length) {
    if (fence) throw new Error('Close the unfinished code block before inserting the issue section.');
    const tasks = renderTasks(repo, issues, eol, options);
    return content + (content.endsWith(eol + eol) ? '' : content.endsWith(eol) ? eol : eol + eol)
      + `## GitHub Issues${eol}${eol}${START}${eol}${tasks}${tasks ? eol : ''}${END}${eol}`;
  }
  if (matches.length !== 2 || matches[0].kind !== 'start' || matches[1].kind !== 'end') throw new Error('Expected exactly one complete managed marker pair.');
  const tasks = renderTasks(repo, issues, eol, options, body.slice(matches[0].end, matches[1].start));
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
