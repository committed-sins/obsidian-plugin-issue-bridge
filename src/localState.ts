import { isIssueNumber, isRecord } from './validation';

export interface Unread { repo: string; number: number; path: string }
export interface LocalState { secretId: string; snapshots: Record<string, number[]>; unread: Unread[]; lastSync: number; summary: string }

export function readLocalState(value: unknown): LocalState
{
  if (!isRecord(value) || typeof value.secretId !== 'string' || !/^issue-bridge-[a-f\d-]+$/.test(value.secretId)) {
    return { secretId: `issue-bridge-${crypto.randomUUID()}`, snapshots: {}, unread: [], lastSync: 0, summary: 'Not synchronized yet.' };
  }
  const snapshots: Record<string, number[]> = {};
  if (isRecord(value.snapshots)) {
    for (const [key, raw] of Object.entries(value.snapshots)) {
      if (!Array.isArray(raw)) continue;
      const numbers: unknown[] = raw;
      if (numbers.every(isIssueNumber)) Object.defineProperty(snapshots, key, { value: numbers, enumerable: true, writable: true, configurable: true });
    }
  }
  const unread: Unread[] = [];
  if (Array.isArray(value.unread)) {
    const items: unknown[] = value.unread;
    for (const item of items) {
      if (isRecord(item) && typeof item.repo === 'string' && /^[a-z\d-]+\/[a-z\d_.-]+$/i.test(item.repo)
        && isIssueNumber(item.number) && typeof item.path === 'string' && item.path) {
        unread.push({ repo: item.repo, number: item.number, path: item.path });
      }
    }
  }
  return {
    secretId: value.secretId, snapshots, unread,
    lastSync: typeof value.lastSync === 'number' && Number.isFinite(value.lastSync) && value.lastSync >= 0 ? value.lastSync : 0,
    summary: typeof value.summary === 'string' ? value.summary : 'Not synchronized yet.'
  };
}
