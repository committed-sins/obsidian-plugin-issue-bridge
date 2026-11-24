import type { Issue } from '../github/client';
import { OCTOCAT } from '../octocat/shortcode';
import { appendSourceTag, normalizeSourceTag } from './sourceTags';

export interface TaskOptions { respectTasks: boolean; format: 'emoji' | 'dataview'; globalFilter?: string; usedIds?: Set<string>; sourceTag?: string }
export const PLAIN_TASKS: TaskOptions = { respectTasks: false, format: 'emoji' };
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
    return `- [${issue.state === 'closed' ? 'x' : ' '}] ${OCTOCAT} ${safeTitle(issue.title)} [#${issue.number}](https://github.com/${repo}/issues/${issue.number})${suffix}`;
  }).join(eol);
}
