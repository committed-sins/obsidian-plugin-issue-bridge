import { App, PluginSettingTab, Setting } from 'obsidian';
import type IssueBridge from './main';
export interface Settings { clientId: string; autoSync: boolean; startupSync: boolean; intervalMinutes: number; notifyNew: boolean; excludedFolders: string }
export const DEFAULTS: Settings = { clientId: '', autoSync: true, startupSync: true, intervalMinutes: 5, notifyNew: true, excludedFolders: 'archives, templates, scripts, libraries, inbound' };
export function cleanSettings(input: Partial<Settings> | null): Settings {
  const s = input ?? {};
  return { clientId: typeof s.clientId === 'string' ? s.clientId.trim() : '',
    autoSync: typeof s.autoSync === 'boolean' ? s.autoSync : DEFAULTS.autoSync,
    startupSync: typeof s.startupSync === 'boolean' ? s.startupSync : DEFAULTS.startupSync,
    notifyNew: typeof s.notifyNew === 'boolean' ? s.notifyNew : DEFAULTS.notifyNew,
    intervalMinutes: typeof s.intervalMinutes === 'number' && Number.isFinite(s.intervalMinutes) ? Math.max(1, Math.min(1440, Math.round(s.intervalMinutes))) : DEFAULTS.intervalMinutes,
    excludedFolders: typeof s.excludedFolders === 'string' ? s.excludedFolders : DEFAULTS.excludedFolders };
}
export class IssueBridgeSettings extends PluginSettingTab {
  constructor(app: App, private plugin: IssueBridge) { super(app, plugin); }
  display() {
    const p = this.plugin, el = this.containerEl;
    el.empty(); el.createEl('h2', { text: 'Issue Bridge' });
    el.createEl('p', { text: 'Assigned GitHub issues become native tasks in notes with a github_repo property. GitHub is authoritative: local changes inside the managed section are replaced on sync.' });
    el.createEl('p', { text: 'Private issue titles and links are saved in your notes and follow the vault’s sync and sharing settings.' });
    new Setting(el).setName('Connection').setDesc(p.connectionLabel())
      .addButton(b => b.setButtonText('Sign in').setDisabled(p.busy || p.signingIn).onClick(() => p.signIn(() => this.display())))
      .addButton(b => b.setButtonText('Disconnect').setDisabled(p.busy || p.signingIn).onClick(() => { p.disconnect(); this.display(); }));
    el.createEl('p', { text: 'Uses Obsidian SecretStorage for credentials. No token is written to plugin settings or a local.json file. Disconnect clears this vault’s stored credential; revoke app access on GitHub to invalidate the authorization itself.' });
    new Setting(el).setName('GitHub App client ID').setDesc('Your Issue Bridge GitHub App: enable Device Flow, grant Issues: read-only, and install it on the repositories to import. No client secret is needed. Sign out before changing this value.')
      .addText(t => t.setPlaceholder('Iv…').setValue(p.settings.clientId).setDisabled(p.hasCredential() || p.busy || p.signingIn)
        .onChange(async value => { p.settings.clientId = value.trim(); await p.saveSettings(); }));
    new Setting(el).setName('Check on startup and resume').setDesc('When connected, check mapped repositories after loading and when returning to Obsidian.')
      .addToggle(t => t.setValue(p.settings.startupSync).onChange(async value => { p.settings.startupSync = value; await p.saveSettings(); }));
    new Setting(el).setName('Automatic synchronization').setDesc('Runs only while Obsidian is open. Devices suspended by the OS cannot poll.')
      .addToggle(t => t.setValue(p.settings.autoSync).onChange(async value => { p.settings.autoSync = value; await p.saveSettings(); }));
    new Setting(el).setName('Check interval (minutes)').setDesc('1–1440 minutes. Default: 5. Rate limits can postpone a check.')
      .addText(t => t.setValue(String(p.settings.intervalMinutes)).onChange(async value => {
        const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 1440) return;
        p.settings.intervalMinutes = n; await p.saveSettings();
      }));
    new Setting(el).setName('Notify about new assigned issues').setDesc('One Obsidian notice per sync, plus an unread count in the status bar. First import establishes the baseline. Includes issues assigned to you after creation; this is not a push notification.')
      .addToggle(t => t.setValue(p.settings.notifyNew).onChange(async value => { p.settings.notifyNew = value; await p.saveSettings(); }));
    new Setting(el).setName('Excluded folders').setDesc('Comma-separated paths. Notes in these folders are not scanned or updated.')
      .addText(t => t.setValue(p.settings.excludedFolders).onChange(async value => { p.settings.excludedFolders = value; await p.saveSettings(); }));
    new Setting(el).setName('Synchronization').setDesc(p.statusText())
      .addButton(b => b.setButtonText('Sync now').setCta().setDisabled(p.busy || p.signingIn).onClick(async () => {
        b.setDisabled(true); await p.sync(true); this.display();
      }))
      .addButton(b => b.setButtonText('Show new issues').onClick(() => p.showNewIssues()));
    el.createEl('h3', { text: 'Link a note' });
    el.createEl('pre', { text: '---\ngithub_repo: https://github.com/owner/repository\n---' });
    el.createEl('p', { text: 'Use one active note per repository. First sync appends a GitHub Issues section. Closed assigned issues stay visible; issues no longer assigned disappear after a complete successful fetch. Removing or changing the mapping leaves the old generated section until you remove it or sync the new mapping.' });
  }
}
