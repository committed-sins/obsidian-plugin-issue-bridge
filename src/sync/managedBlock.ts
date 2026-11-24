import type { Issue } from '../github/client';
import { PLAIN_TASKS, renderTasks } from './taskMarkdown';

export const START = '<!-- issue-bridge:start -->';
export const END = '<!-- issue-bridge:end -->';

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
