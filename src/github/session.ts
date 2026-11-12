import { refreshAccessToken, validateToken, type Http, type TokenResponse } from './auth';
export interface Credential { clientId: string; login: string; accessToken: string; expiresAt: number; refreshToken?: string; refreshExpiresAt: number }
export interface SecretStore { getSecret(id: string): string | null; setSecret(id: string, value: string): void }
export class Session {
  private refresh?: Promise<string>;
  private generation = 0;
  constructor(private http: Http, private store: SecretStore, private id: string, private active: () => boolean) {}
  read(): Credential | null {
    const raw = this.store.getSecret(this.id);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Credential;
      if (!/^Iv[a-zA-Z\d]+$/.test(value.clientId) || typeof value.login !== 'string' || !/^[a-z\d-]+$/i.test(value.login)
        || typeof value.accessToken !== 'string' || !value.accessToken || !Number.isFinite(value.expiresAt) || !Number.isFinite(value.refreshExpiresAt)
        || (value.refreshToken !== undefined && typeof value.refreshToken !== 'string')) throw new Error();
      return value;
    } catch { throw new Error('Stored sign-in is invalid. Disconnect and sign in again.'); }
  }
  save(clientId: string, login: string, token: TokenResponse) {
    if (!this.active()) throw new Error('Plugin is no longer active.');
    validateToken(token);
    const value: Credential = { clientId, login, accessToken: token.access_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : 0,
      refreshToken: token.refresh_token,
      refreshExpiresAt: token.refresh_token_expires_in ? Date.now() + token.refresh_token_expires_in * 1000 : 0 };
    this.store.setSecret(this.id, JSON.stringify(value));
    this.generation++;
  }
  disconnect() { this.generation++; this.store.setSecret(this.id, ''); }
  async token(): Promise<string> {
    if (!this.active()) throw new Error('Sync cancelled.');
    const current = this.read();
    if (!current) throw new Error('Sign in to GitHub in Issue Bridge settings.');
    if (!current.expiresAt || current.expiresAt > Date.now() + 300_000) return current.accessToken;
    if (!current.refreshToken || (current.refreshExpiresAt && current.refreshExpiresAt <= Date.now())) throw new Error('GitHub sign-in expired. Sign in again.');
    if (!this.refresh) {
      const generation = this.generation;
      this.refresh = (async () => {
        let next: TokenResponse;
        try { next = await refreshAccessToken(this.http, current.clientId, current.refreshToken!); }
        catch { throw new Error('GitHub token renewal failed. Retry or sign in again.'); }
        if (!this.active() || generation !== this.generation) throw new Error('Sign-in changed during renewal.');
        if (!next.refresh_token) throw new Error('GitHub did not return a rotated refresh token. Sign in again.');
        this.save(current.clientId, current.login, next);
        return next.access_token;
      })().finally(() => { this.refresh = undefined; });
    }
    return this.refresh;
  }
}
