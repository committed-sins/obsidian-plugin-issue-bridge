/* UI adapted from wandermyz/obsidian-github-sync (MIT), commit
 * 04063b3a6213f4b8915e0955119b93d2089414e0; copyright (c) 2026 wandermyz.
 * Changes: own auth adapter, awaited persistence, cancellation and validated URL.
 */
import { App, Modal, Notice, Setting } from 'obsidian';
import { pollForToken, requestDeviceCode, type Http, type TokenResponse } from './github/auth';
export class DeviceFlowModal extends Modal {
  private abort = new AbortController();
  private status?: HTMLElement;
  constructor(app: App, private http: Http, private clientId: string,
    private onSuccess: (token: TokenResponse, signal: AbortSignal) => Promise<void>, private onDone: () => void) { super(app); }
  onOpen() {
    this.titleEl.setText('Sign in to GitHub');
    this.status = this.contentEl.createEl('p', { text: 'Requesting a device code…' });
    void this.start();
  }
  onClose() { this.abort.abort(); this.contentEl.empty(); this.onDone(); }
  private async start() {
    try {
      const device = await requestDeviceCode(this.http, this.clientId);
      if (this.abort.signal.aborted) return;
      this.contentEl.empty();
      this.contentEl.createEl('p', { text: 'Copy the code and authorize Issue Bridge in your browser.' });
      this.contentEl.createDiv({ text: device.user_code, cls: 'issue-bridge-device-code' });
      new Setting(this.contentEl).addButton(b => b.setButtonText('Copy code').onClick(async () => {
        try { await navigator.clipboard.writeText(device.user_code); new Notice('Code copied.'); }
        catch { new Notice('Copy the displayed code manually.'); }
      })).addButton(b => b.setButtonText('Open GitHub').setCta().onClick(() => window.open(device.verification_uri, '_blank', 'noopener,noreferrer')));
      this.status = this.contentEl.createEl('p', { text: 'Waiting for authorization… Close this dialog to cancel.' });
      const token = await pollForToken(this.http, this.clientId, device, this.abort.signal);
      if (this.abort.signal.aborted) return;
      await this.onSuccess(token, this.abort.signal);
      if (this.abort.signal.aborted) return;
      new Notice('Issue Bridge connected to GitHub.');
      this.close();
    } catch (error) {
      if (!this.abort.signal.aborted) this.status?.setText(error instanceof Error ? error.message : 'Sign-in failed.');
    }
  }
}
