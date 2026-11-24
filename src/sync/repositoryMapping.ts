import { getFrontMatterInfo, parseYaml } from 'obsidian';
import { isRecord } from '../validation';

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

export function readRepositoryMapping(content: string, property: string): { repo: string; bodyOffset: number } | null
{
  const info = getFrontMatterInfo(content);
  if (!info.exists) return null;
  const fm: unknown = parseYaml(info.frontmatter);
  if (!isRecord(fm) || !Object.prototype.hasOwnProperty.call(fm, property)) return null;
  const repo = repositoryFromProperty(fm[property]);
  return repo ? { repo, bodyOffset: info.contentStart } : null;
}

export interface Mapping { path: string; repo: string; content: string; bodyOffset: number }
export function duplicateRepos(mappings: Mapping[]): Set<string>
{
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { repo } of mappings) {
    if (seen.has(repo)) duplicates.add(repo);
    seen.add(repo);
  }
  return duplicates;
}
