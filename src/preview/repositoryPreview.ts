import { TFile, type Vault } from 'obsidian';
import { ApiError, GitHubClient } from '../github/client';
import type { Http } from '../github/auth';
import { readRepositoryMapping } from '../sync/repositoryMapping';
import { PreviewCache } from './cache';
import { previewPath } from './markdown';

export class RepositoryPreviewService
{
  private readonly cache = new PreviewCache();

  constructor(private readonly vault: Vault)
  {}

  clear(): void
  {
    this.cache.clear();
  }

  async load(note: string, path: string, force: boolean, property: string, http: Http, active: () => boolean, token: () => Promise<string | null>)
  {
    path = previewPath(path);
    const file = this.vault.getAbstractFileByPath(note);
    if (!(file instanceof TFile)) throw new Error(`Save this note and add its ${property} property first.`);
    const repo = readRepositoryMapping(await this.vault.read(file), property)?.repo;
    if (!repo) throw new Error(`Add a GitHub repository URL to this note’s ${property} property.`);
    if (!active()) throw new Error('Preview cancelled.');

    const result = await this.cache.get(`${repo}:${path}`, force, () => this.fetch(repo, path, http, active, token));
    const latest = await this.vault.read(file);
    if (!active() || readRepositoryMapping(latest, property)?.repo !== repo) throw new Error('Repository mapping or connection changed. Refresh the preview.');
    return result;
  }

  private async fetch(repo: string, path: string, http: Http, active: () => boolean, token: () => Promise<string | null>)
  {
    try { return await new GitHubClient(http, '', active).repositoryMarkdown(repo, path); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const accessToken = await token();
      if (!accessToken) throw new Error('File not found or repository is private. Check the path and sign in; private files also require Contents: read-only permission.');
      if (!active()) throw new Error('Preview cancelled.');
      try { return await new GitHubClient(http, accessToken, active).repositoryMarkdown(repo, path); }
      catch (error) {
        if (error instanceof ApiError && [403, 404].includes(error.status)) throw new Error('File unavailable. Check its path and app installation; private repository files also require Contents: read-only permission.');
        throw error;
      }
    }
  }
}
