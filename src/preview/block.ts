import { MarkdownRenderChild, sanitizeHTMLToDom, type Plugin } from 'obsidian';
import type { RepositoryMarkdown } from '../github/client';
import { previewHtml, previewPath } from './markdown';
export function registerRepositoryPreview(plugin: Plugin, read: (note: string, path: string, force: boolean) => Promise<RepositoryMarkdown>) {
  plugin.registerMarkdownCodeBlockProcessor('issue-bridge', (source, el, ctx) => {
    let path: string;
    try { path = previewPath(source); }
    catch (error) { el.createEl('p', { text: (error as Error).message, cls: 'mod-error' }); return; }
    const child = new RepositoryPreview(el, path, () => read(ctx.sourcePath, path, false), () => read(ctx.sourcePath, path, true));
    ctx.addChild(child);
  });
}
export class RepositoryPreview extends MarkdownRenderChild {
  private active = false;
  private loaded = false;
  private loading = false;
  constructor(el: HTMLElement, private path: string, private initial: () => Promise<RepositoryMarkdown>, private refresh: () => Promise<RepositoryMarkdown>) { super(el); }
  onload() {
    this.active = true;
    const root = this.containerEl.createEl('details', { cls: 'issue-bridge-preview' });
    root.createEl('summary', { text: this.path });
    const tools = root.createDiv({ cls: 'issue-bridge-preview-tools' });
    const button = tools.createEl('button', { text: 'Refresh' });
    const source = tools.createEl('a', { text: 'View on GitHub' });
    source.hidden = true; source.target = '_blank'; source.rel = 'noopener noreferrer';
    const status = root.createEl('p', { text: 'Expand to load the repository file.', cls: 'issue-bridge-preview-status' });
    const body = root.createDiv({ cls: 'issue-bridge-preview-body' });
    const load = async (force: boolean) => {
      if (this.loading || !this.active) return;
      this.loading = true; button.disabled = true; status.setText('Loading…');
      try {
        const file = await (force ? this.refresh() : this.initial());
        if (!this.active) return;
        const html = previewHtml(file.markdown, file.url);
        body.empty(); body.appendChild(sanitizeHTMLToDom(html));
        source.href = file.url; source.hidden = false; this.loaded = true;
        status.setText('Read-only · loaded from the repository’s default branch.');
      } catch (error) {
        if (this.active) status.setText(`${error instanceof Error ? error.message : 'Could not load the repository file.'}${this.loaded ? ' Previous preview retained.' : ''}`);
      } finally { this.loading = false; if (this.active) button.disabled = false; }
    };
    this.registerDomEvent(root, 'toggle', () => { if (root.open && !this.loaded) void load(false); });
    this.registerDomEvent(button, 'click', () => { void load(true); });
  }
  onunload() { this.active = false; }
}
