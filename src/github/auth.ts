/* Adapted from wandermyz/obsidian-github-sync, commit 04063b3a6213f4b8915e0955119b93d2089414e0.
 * Copyright (c) 2026 wandermyz. MIT; see vendor/github-enterprise-sync/LICENSE.
 * Changes: injected transport, github.com-only, validated responses, redacted errors,
 * no upstream app identity, bounded/cancellable polling and cleaned abort listeners.
 */
export type Http = (request: { url: string; method: string; body?: string; headers: Record<string, string> }) => Promise<{ status: number; json: unknown; headers?: Record<string, string> }>;
export interface TokenResponse { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number }
export interface DeviceCode { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }
const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function validateToken(value: unknown): TokenResponse {
  const json = object(value);
  if (typeof json.access_token !== 'string' || !json.access_token || /\s/.test(json.access_token)) throw new Error('GitHub returned no valid access token. Sign in again.');
  for (const key of ['expires_in', 'refresh_token_expires_in']) {
    if (json[key] !== undefined && (typeof json[key] !== 'number' || !Number.isFinite(json[key]) || Number(json[key]) <= 0)) throw new Error('GitHub returned invalid token expiry.');
  }
  if (json.refresh_token !== undefined && (typeof json.refresh_token !== 'string' || !json.refresh_token)) throw new Error('GitHub returned an invalid refresh token.');
  return json as unknown as TokenResponse;
}
async function oauth(http: Http, path: string, body: unknown) {
  const response = await http({ url: `https://github.com/login/${path}`, method: 'POST', headers, body: JSON.stringify(body) });
  if (response.status !== 200) throw new Error(`GitHub authorization failed (HTTP ${response.status}).`);
  return object(response.json);
}
export async function requestDeviceCode(http: Http, clientId: string): Promise<DeviceCode> {
  const json = await oauth(http, 'device/code', { client_id: clientId });
  if (json.error) throw new Error('GitHub rejected device sign-in. Check the client ID and enable Device Flow in your GitHub App.');
  if (typeof json.device_code !== 'string' || !json.device_code || typeof json.user_code !== 'string' || !json.user_code || json.verification_uri !== 'https://github.com/login/device'
    || typeof json.expires_in !== 'number' || json.expires_in <= 0 || json.expires_in > 3600
    || typeof json.interval !== 'number' || json.interval <= 0 || json.interval > 300) throw new Error('GitHub returned an invalid device code.');
  return json as unknown as DeviceCode;
}
export async function refreshAccessToken(http: Http, clientId: string, refreshToken: string): Promise<TokenResponse> {
  return validateToken(await oauth(http, 'oauth/access_token', { client_id: clientId, refresh_token: refreshToken, grant_type: 'refresh_token' }));
}
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Sign-in cancelled.')); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Sign-in cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function pollForToken(http: Http, clientId: string, device: DeviceCode, signal: AbortSignal,
  wait = pause, now = Date.now): Promise<TokenResponse> {
  let interval = Math.max(device.interval, 5) * 1000;
  const deadline = now() + device.expires_in * 1000;
  while (now() < deadline) {
    await wait(Math.min(interval, deadline - now()), signal);
    if (signal.aborted) throw new Error('Sign-in cancelled.');
    if (now() >= deadline) break;
    const json = await oauth(http, 'oauth/access_token', { client_id: clientId, device_code: device.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    if (signal.aborted) throw new Error('Sign-in cancelled.');
    if (json.access_token) return validateToken(json);
    if (json.error === 'authorization_pending') continue;
    if (json.error === 'slow_down') { interval += 5000; continue; }
    throw new Error(json.error === 'access_denied' ? 'Authorization was denied in the browser.' : 'Device authorization failed or expired. Start sign-in again.');
  }
  throw new Error('The device code expired. Start sign-in again.');
}
