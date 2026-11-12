import type { RepositoryMarkdown } from '../github/client';
export class PreviewCache {
  private entries = new Map<string, { expires: number; value: Promise<RepositoryMarkdown> }>();
  constructor(private now = Date.now) {}
  clear() { this.entries.clear(); }
  get(key: string, force: boolean, fetch: () => Promise<RepositoryMarkdown>): Promise<RepositoryMarkdown> {
    const previous = this.entries.get(key);
    // In-flight requests are shared even for manual refresh; completed entries
    // live for five minutes and are never persisted in synced vault files.
    if (previous && (!previous.expires || (!force && previous.expires > this.now()))) return previous.value;
    const entry = { expires: 0, value: Promise.resolve().then(fetch) };
    this.entries.set(key, entry);
    while (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!);
    void entry.value.then(() => { entry.expires = this.now() + 300_000; }, () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.value;
  }
}
