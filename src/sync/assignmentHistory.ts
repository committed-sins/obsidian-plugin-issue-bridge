import type { LocalState } from '../localState';
import type { Mapping } from './repositoryMapping';

export function newIssueNumbers(previous: number[] | undefined, current: number[]): number[]
{
  return previous ? current.filter(id => !previous.includes(id)) : [];
}

export function recordAssignments(state: LocalState, login: string, mapping: Mapping, numbers: number[]): number
{
  const key = `${login.toLowerCase()}:${mapping.repo}`;
  const fresh = newIssueNumbers(state.snapshots[key], numbers);
  let added = 0;
  for (const number of fresh) {
    if (state.unread.some(item => item.repo === mapping.repo && item.number === number)) continue;
    state.unread.push({ repo: mapping.repo, number, path: mapping.path });
    added++;
  }
  state.snapshots[key] = numbers;
  return added;
}
