import { Plugin, Notice, Modal, MarkdownView, TFile, getFrontMatterInfo, parseYaml, requestUrl } from 'obsidian';
import { Session } from './github/session';
import { GitHubClient, ApiError } from './github/client';
import type { Http } from './github/auth';
import { DeviceFlowModal } from './deviceFlowModal';
import { cleanSettings, DEFAULTS, IssueBridgeSettings, type Settings } from './settings';
import { duplicateRepos, newIssueNumbers, normalizeRepo, updateBlock, type Mapping } from './sync/core';
interface Unread { repo: string; number: number; path: string }
interface LocalState { secretId: string; snapshots: Record<string, number[]>; unread: Unread[]; lastSync: number; summary: string }
const LOCAL_KEY = 'issue-bridge-v1';
export default class IssueBridge extends Plugin {
  settings: Settings = { ...DEFAULTS };
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
  private http: Http = async request => {
    try { return await requestUrl({ ...request, throw: false }); }
    catch { throw new Error('GitHub could not be reached. Check your connection.'); }
  };
  async onload() {
    this.alive = true;
    this.settings = cleanSettings(await this.loadData());
    const stored = this.app.loadLocalStorage(LOCAL_KEY);
    this.local = stored && typeof stored.secretId === 'string' && /^issue-bridge-[a-f\d-]+$/.test(stored.secretId)
      ? { ...stored, snapshots: stored.snapshots ?? {}, unread: Array.isArray(stored.unread) ? stored.unread : [] }
      : { secretId: `issue-bridge-${crypto.randomUUID()}`, snapshots: {}, unread: [], lastSync: 0, summary: 'Not synchronized yet.' };
    this.persistLocal();
    if (!this.app.secretStorage) { new Notice('Issue Bridge requires Obsidian SecretStorage. Update Obsidian before signing in.'); return; }
    this.session = new Session(this.http, this.app.secretStorage, this.local.secretId, () => this.alive);
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
    this.registerDomEvent(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.settings.startupSync && this.hasCredential() && Date.now() - this.local.lastSync > 60_000) void this.sync(false);
    });
    this.schedule();
  }
  onunload() { this.alive = false; this.epoch++; if (this.timer) window.clearInterval(this.timer); this.modal?.close(); }
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
    this.epoch++; this.session.disconnect(); this.local.snapshots = {}; this.local.unread = []; this.retryAt = 0;
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
  showNewIssues() {
    const modal = new Modal(this.app);
    modal.titleEl.setText('Issue Bridge — new assigned issues');
    modal.contentEl.createEl('p', { text: this.statusText() });
    for (const item of this.local.unread) {
      const row = modal.contentEl.createEl('p');
      row.createEl('a', { text: `${item.repo} #${item.number}`, href: `https://github.com/${item.repo}/issues/${item.number}` }).setAttribute('target', '_blank');
      row.appendText(' · ');
      const note = row.createEl('a', { text: item.path, href: '#' });
      note.onclick = event => { event.preventDefault(); void this.app.workspace.openLinkText(item.path, '', false); modal.close(); };
    }
    if (!this.local.unread.length) modal.contentEl.createEl('p', { text: 'No new issues since the initial import or your last acknowledgment.' });
    const button = modal.contentEl.createEl('button', { text: 'Mark all as seen' });
    button.onclick = () => { this.local.unread = []; this.persistLocal(); this.updateStatus(); modal.close(); };
    modal.open();
  }
  private mapping(content: string): { repo: string; bodyOffset: number } | null {
    const info = getFrontMatterInfo(content);
    if (!info.exists) return null;
    const fm = parseYaml(info.frontmatter);
    if (!fm || typeof fm !== 'object' || !Object.prototype.hasOwnProperty.call(fm, 'github_repo')) return null;
    return { repo: normalizeRepo(fm.github_repo), bodyOffset: info.contentStart };
  }
  private excluded(path: string) {
    return this.settings.excludedFolders.split(',').map(x => x.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean).some(folder => path === folder || path.startsWith(folder + '/'));
  }
  private dirty(file: TFile, content: string) {
    return this.app.workspace.getLeavesOfType('markdown').some(leaf => {
      const view = leaf.view;
      return view instanceof MarkdownView && view.file === file && view.getViewData() !== content;
    });
  }
  async sync(manual: boolean) {
    if (!this.alive || this.busy || this.signingIn) { if (manual) new Notice('Issue Bridge is already busy.'); return; }
    if (!this.hasCredential()) { if (manual) new Notice('Sign in through Settings → Issue Bridge first.'); return; }
    if (Date.now() < this.retryAt) { if (manual) new Notice('GitHub rate limit: wait until the retry time shown in Issue Bridge settings.'); return; }
    this.busy = true; this.updateStatus();
    const epoch = this.epoch, active = () => this.alive && epoch === this.epoch;
    let updated = 0, added = 0, completed = 0;
    const warnings: string[] = [];
    try {
      const mappings: Mapping[] = [];
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (!active()) return;
        if (this.excluded(file.path)) continue;
        const content = await this.app.vault.read(file);
        try { const m = this.mapping(content); if (m) mappings.push({ path: file.path, content, ...m }); }
        catch { warnings.push(`${file.path}: invalid frontmatter or github_repo; skipped.`); }
      }
      const duplicates = duplicateRepos(mappings);
      if (!mappings.length) {
        this.local.summary = warnings.length ? warnings.join('\n') : 'No mapped notes. Add github_repo to a note to start importing.';
      } else {
        const token = await this.session.token();
        const client = new GitHubClient(this.http, token, active);
        const login = await client.currentUser();
        const credential = this.session.read();
        if (!credential || login.toLowerCase() !== credential.login.toLowerCase()) throw new Error('Connected account changed. Disconnect and sign in again.');
        for (const mapping of mappings) {
          if (!active()) return;
          if (duplicates.has(mapping.repo)) { warnings.push(`${mapping.path}: duplicate repository mapping; skipped.`); continue; }
          try {
            const issues = await client.assignedIssues(mapping.repo, login);
            if (!active()) return;
            const file = this.app.vault.getAbstractFileByPath(mapping.path);
            if (!(file instanceof TFile)) throw new Error('Note moved during sync; retry.');
            // Read mappings again after the network await. Do not rely on a
            // possibly stale metadata cache to detect a new duplicate mapping.
            const revision = this.vaultRevision;
            let owners = 0;
            for (const candidate of this.app.vault.getMarkdownFiles()) {
              if (this.excluded(candidate.path)) continue;
              const bytes = await this.app.vault.read(candidate);
              try { if (this.mapping(bytes)?.repo === mapping.repo) owners++; }
              catch { /* Invalid mappings are reported by the main scan. */ }
            }
            if (!active() || revision !== this.vaultRevision || owners !== 1) throw new Error('Notes or repository mappings changed during sync; retry.');
            const next = updateBlock(mapping.content, mapping.bodyOffset, mapping.repo, issues);
            let wrote = false;
            const check = (current: string) => {
              if (!active() || this.excluded(file.path)) throw new Error('Sync cancelled.');
              if (revision !== this.vaultRevision) throw new Error('Notes changed during sync; retry.');
              if (current !== mapping.content || this.dirty(file, current)) throw new Error('Note changed during sync; retry after saving.');
              const latest = this.mapping(current);
              if (!latest || latest.repo !== mapping.repo) throw new Error('Repository mapping changed during sync; retry.');
              return next;
            };
            if (next === mapping.content) {
              // Avoid calling Vault.process at all when no content changed.
              check(await this.app.vault.read(file));
            } else {
              await this.app.vault.process(file, check);
              wrote = true;
            }
            if (!active()) return;
            if (wrote) updated++;
            completed++;
            const key = `${login.toLowerCase()}:${mapping.repo}`;
            const numbers = issues.map(i => i.number);
            const fresh = newIssueNumbers(this.local.snapshots[key], numbers);
            for (const number of fresh) {
              if (!this.local.unread.some(i => i.repo === mapping.repo && i.number === number)) {
                this.local.unread.push({ repo: mapping.repo, number, path: mapping.path }); added++;
              }
            }
            this.local.snapshots[key] = numbers;
            this.persistLocal();
          } catch (error) {
            if (!active()) return;
            warnings.push(`${mapping.path}: ${error instanceof Error ? error.message : 'Sync failed; previous tasks retained.'}`);
            if (error instanceof ApiError && error.retryAt) { this.retryAt = error.retryAt; break; }
            if (error instanceof ApiError && error.status === 401) break;
          }
        }
        this.local.summary = `${completed}/${mappings.length} mapped note(s) checked; ${updated} updated; ${added} new assigned issue(s).${warnings.length ? '\n' + warnings.join('\n') : ''}`;
      }
      if (!warnings.length) this.local.lastSync = Date.now();
      if (active() && (manual || warnings.length || (added > 0 && this.settings.notifyNew))) {
        new Notice(added && this.settings.notifyNew ? `Issue Bridge: ${added} new assigned issue(s). Click the status bar or use “Show new assigned issues”.${warnings.length ? ' Some notes were skipped; see settings.' : ''}`
          : warnings.length ? 'Issue Bridge: some notes were skipped. See settings for details.' : `Issue Bridge: ${completed} mapped note(s) checked, ${updated} updated.`);
      }
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
