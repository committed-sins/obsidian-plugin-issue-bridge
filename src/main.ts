import { Plugin, Notice, requestUrl } from 'obsidian';
import { Session } from './github/session';
import { GitHubClient, ApiError } from './github/client';
import type { Http } from './github/auth';
import { DeviceFlowModal } from './deviceFlowModal';
import { cleanSettings, DEFAULTS, IssueBridgeSettings, type Settings } from './settings';
import { syncAssignedIssues } from './sync/issueSync';
import { registerRepositoryPreview } from './preview/block';
import { RepositoryPreviewService } from './preview/repositoryPreview';
import { octocatEditor } from './octocat/editor';
import { registerOctocatRenderer } from './octocat/render';
import { readLocalState, type LocalState } from './localState';
import { showUnreadIssues } from './ui/unreadIssues';
const LOCAL_KEY = 'issue-bridge-v1';
export default class IssueBridge extends Plugin
{
  settings: Settings = { ...DEFAULTS, sourceTags: { ...DEFAULTS.sourceTags } };
  busy = false;
  signingIn = false;
  private alive = false;
  private epoch = 0;
  private timer?: number;
  private modal?: DeviceFlowModal;
  private session!: Session;
  private local!: LocalState;
  private statusEl?: HTMLElement;
  private retryAt = 0;
  private vaultRevision = 0;
  private readonly previews = new RepositoryPreviewService(this.app.vault);
  private http: Http = async request =>
  {
    try {
      const response = await requestUrl({ ...request, throw: false });
      const json: unknown = response.json;
      return { status: response.status, json, headers: response.headers };
    }
    catch { throw new Error('GitHub could not be reached. Check your connection.'); }
  };
  async onload()
  {
    this.alive = true;
    this.settings = cleanSettings(await this.loadData());
    this.local = readLocalState(this.app.loadLocalStorage(LOCAL_KEY));
    this.persistLocal();
    this.registerEditorExtension(octocatEditor);
    registerOctocatRenderer(this);
    if (!this.app.secretStorage) { new Notice('Issue Bridge requires Obsidian SecretStorage. Update Obsidian before signing in.'); return; }
    this.session = new Session(this.http, this.app.secretStorage, this.local.secretId, () => this.alive);
    registerRepositoryPreview(this, (note, path, force) => this.repositoryPreview(note, path, force));
    this.addSettingTab(new IssueBridgeSettings(this.app, this));
    const changed = () => { this.vaultRevision++; };
    this.registerEvent(this.app.vault.on('modify', changed));
    this.registerEvent(this.app.vault.on('create', changed));
    this.registerEvent(this.app.vault.on('delete', changed));
    this.registerEvent(this.app.vault.on('rename', changed));
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('mod-clickable');
    this.statusEl.setAttribute('aria-label', 'Issue Bridge: show newly assigned issues');
    this.registerDomEvent(this.statusEl, 'click', () => this.showNewIssues());
    this.updateStatus();
    this.addRibbonIcon('git-pull-request', 'Issue Bridge: sync assigned issues', () => { void this.sync(true); });
    this.addCommand({ id: 'sync-now', name: 'Sync assigned issues', callback: () => this.sync(true) });
    this.addCommand({ id: 'show-new-issues', name: 'Show new assigned issues', callback: () => this.showNewIssues() });
    this.app.workspace.onLayoutReady(() => {
      if (!this.alive) return;
      if (this.settings.startupSync && this.hasCredential()) void this.sync(false);
    });
    const doc = activeDocument;
    this.registerDomEvent(doc, 'visibilitychange', () =>
    {
      if (doc.visibilityState === 'visible' && this.settings.startupSync && this.hasCredential() && Date.now() - this.local.lastSync > 60_000) void this.sync(false);
    });
    this.schedule();
  }
  onunload() { this.alive = false; this.epoch++; this.previews.clear(); if (this.timer) window.clearInterval(this.timer); this.modal?.close(); }
  private repositoryPreview(note: string, path: string, force: boolean)
  {
    const epoch = this.epoch;
    const property = this.settings.repositoryProperty;
    const active = () => this.alive && this.epoch === epoch && this.settings.repositoryProperty === property;
    return this.previews.load(note, path, force, property, this.http, active, () => this.hasCredential() ? this.session.token() : Promise.resolve(null));
  }

  private persistLocal() { this.app.saveLocalStorage(LOCAL_KEY, this.local); }
  async saveSettings() { await this.saveData(this.settings); this.schedule(); }
  private schedule() {
    if (this.timer) window.clearInterval(this.timer);
    if (this.alive && this.settings.autoSync) this.timer = window.setInterval(() => {
      if (this.hasCredential() && !this.signingIn) void this.sync(false);
    }, this.settings.intervalMinutes * 60_000);
  }
  hasCredential() { try { return !!this.session?.read(); } catch { return false; } }
  connectionLabel() {
    try { const c = this.session?.read(); return c ? `Connected as ${c.login}.` : 'Not connected. Install Issue Bridge on selected repositories, then sign in.'; }
    catch { return 'Stored sign-in is invalid. Disconnect, then sign in again.'; }
  }
  signIn(refresh: () => void) {
    if (this.busy || this.signingIn) return;
    const clientId = this.settings.clientId;
    if (!/^Iv[a-zA-Z\d]+$/.test(clientId)) { new Notice('Enter your GitHub App client ID (Iv…) in Issue Bridge settings.'); return; }
    this.signingIn = true;
    const epoch = ++this.epoch;
    this.previews.clear();
    this.modal = new DeviceFlowModal(this.app, this.http, clientId, async (token, signal) => {
      const active = () => this.alive && epoch === this.epoch && !signal.aborted;
      const login = await new GitHubClient(this.http, token.access_token, active).currentUser();
      if (!active()) throw new Error('Sign-in cancelled.');
      const old = this.session.read();
      this.session.save(clientId, login, token);
      if (old && old.login.toLowerCase() !== login.toLowerCase()) { this.local.snapshots = {}; this.local.unread = []; }
      this.retryAt = 0;
      this.persistLocal(); this.updateStatus();
    }, () => { this.signingIn = false; this.modal = undefined; refresh(); });
    this.modal.open(); refresh();
  }
  disconnect() {
    if (this.busy || this.signingIn) return;
    this.epoch++; this.previews.clear(); this.session.disconnect(); this.local.snapshots = {}; this.local.unread = []; this.retryAt = 0;
    this.persistLocal(); this.updateStatus();
    new Notice('Issue Bridge disconnected on this device. Existing note content was retained.');
  }
  statusText() {
    return `${this.busy ? 'Synchronizing…\n' : ''}${this.local.summary}\nLast complete check: ${this.local.lastSync ? new Date(this.local.lastSync).toLocaleString() : 'never'}.${this.retryAt > Date.now() ? ` Retry after ${new Date(this.retryAt).toLocaleTimeString()}.` : ''}\n${this.local.unread.length} new assigned issue(s) not yet acknowledged.`;
  }
  private updateStatus() {
    this.statusEl?.setText(this.busy ? 'Issue Bridge: syncing…' : `Issue Bridge${this.local.unread.length ? `: ${this.local.unread.length} new` : ''}`);
    this.statusEl?.setAttribute('title', this.statusText());
  }
  showNewIssues(onSeen?: () => void): void
  {
    showUnreadIssues(this.app, this.local.unread, this.statusText(), () =>
    {
      this.local.unread = [];
      this.persistLocal();
      this.updateStatus();
      onSeen?.();
    });
  }

  async sync(manual: boolean)
  {
    if (!this.alive || this.busy || this.signingIn) { if (manual) new Notice('Issue Bridge is already busy.'); return; }
    if (!this.hasCredential()) { if (manual) new Notice('Sign in through Settings → Issue Bridge first.'); return; }
    if (Date.now() < this.retryAt) { if (manual) new Notice('GitHub rate limit: wait until the retry time shown in Issue Bridge settings.'); return; }
    this.busy = true; this.updateStatus();
    const epoch = this.epoch, active = () => this.alive && epoch === this.epoch;
    try {
      const notice = await syncAssignedIssues({
        app: this.app,
        settings: () => this.settings,
        state: this.local,
        session: this.session,
        http: this.http,
        active,
        revision: () => this.vaultRevision,
        persist: () => this.persistLocal(),
        backOffUntil: time =>
        {
          this.retryAt = time;
        }
      }, manual);
      if (active() && notice) new Notice(`Issue Bridge: ${notice}`);
    } catch (error) {
      if (!active()) return;
      if (error instanceof ApiError && error.retryAt) this.retryAt = error.retryAt;
      this.local.summary = error instanceof Error ? error.message : 'Synchronization failed. Previous tasks retained.';
      new Notice(`Issue Bridge: ${this.local.summary}`);
    } finally {
      this.busy = false;
      if (this.alive) { this.persistLocal(); this.updateStatus(); }
    }
  }
}
