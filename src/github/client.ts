import type { Http } from './auth';
export interface Issue { number: number; title: string; state: 'open' | 'closed' }
export class ApiError extends Error {
  constructor(public status: number, public retryAt = 0) { super(`GitHub request failed (HTTP ${status}). ${status === 401 ? 'Sign in again.' : status === 403 || status === 404 ? 'Check app installation and Issues: read access.' : 'Previous tasks were retained.'}`); }
}
export class GitHubClient {
  constructor(private http: Http, private token: string, private active: () => boolean = () => true) {}
  private async get(path: string): Promise<unknown> {
    if (!this.active()) throw new Error('Sync cancelled.');
    let response;
    try { response = await this.http({ url: `https://api.github.com${path}`, method: 'GET', headers: {
      Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache'
    } }); } catch { throw new Error('GitHub could not be reached. Previous tasks were retained.'); }
    if (!this.active()) throw new Error('Sync cancelled.');
    if (response.status !== 200) {
      const h = Object.fromEntries(Object.entries(response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      const rateLimited = response.status === 429 || (response.status === 403 && (h['x-ratelimit-remaining'] === '0' || !!h['retry-after']));
      const retryAt = rateLimited ? Math.max(Date.now() + 60_000, Number(h['x-ratelimit-reset'] ?? 0) * 1000, Date.now() + Number(h['retry-after'] ?? 60) * 1000) : 0;
      throw new ApiError(response.status, Number.isFinite(retryAt) ? retryAt : Date.now() + 3_600_000);
    }
    return response.json;
  }
  async currentUser(): Promise<string> {
    const user = await this.get('/user') as { login?: unknown };
    if (!user || typeof user.login !== 'string' || !/^[a-z\d-]+$/i.test(user.login)) throw new Error('GitHub returned an invalid account.');
    return user.login;
  }
  async assignedIssues(repo: string, login: string): Promise<Issue[]> {
    const issues = new Map<number, Issue>();
    for (let page = 1; page <= 1000; page++) {
      const json = await this.get(`/repos/${repo}/issues?state=all&assignee=${encodeURIComponent(login)}&sort=created&direction=asc&per_page=100&page=${page}`);
      if (!Array.isArray(json) || json.length > 100) throw new Error('GitHub returned an invalid issue page. Previous tasks were retained.');
      for (const item of json) {
        if (!item || typeof item !== 'object') throw new Error('GitHub returned an invalid issue.');
        if ('pull_request' in item) continue;
        if (!Number.isSafeInteger(item.number) || item.number <= 0 || typeof item.title !== 'string' || !['open', 'closed'].includes(item.state)
          || !Array.isArray(item.assignees) || !item.assignees.some((a: { login?: string }) => typeof a?.login === 'string' && a.login.toLowerCase() === login.toLowerCase())) throw new Error('GitHub returned inconsistent issue data. Previous tasks were retained.');
        if (issues.has(item.number)) throw new Error('Issue pages changed during sync. Retry to get a complete snapshot.');
        issues.set(item.number, { number: item.number, title: item.title, state: item.state });
      }
      if (json.length < 100) return [...issues.values()].sort((a, b) => a.number - b.number);
    }
    throw new Error('Issue pagination exceeded its safety limit. Previous tasks were retained.');
  }
}
