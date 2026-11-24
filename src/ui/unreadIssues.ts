import { Modal, type App } from 'obsidian';
import type { Unread } from '../localState';

export function showUnreadIssues(app: App, unread: Unread[], status: string, onSeen: () => void): void
{
  const modal = new Modal(app);
  modal.titleEl.setText('Issue Bridge — new assigned issues');
  modal.contentEl.createEl('p', { text: status });
  for (const item of unread) {
    const row = modal.contentEl.createEl('p');
    row.createEl('a', { text: `${item.repo} #${item.number}`, href: `https://github.com/${item.repo}/issues/${item.number}` }).setAttribute('target', '_blank');
    row.appendText(' · ');
    const note = row.createEl('a', { text: item.path, href: '#' });
    note.onclick = event =>
    {
      event.preventDefault();
      void app.workspace.openLinkText(item.path, '', false);
      modal.close();
    };
  }
  if (!unread.length) modal.contentEl.createEl('p', { text: 'No new issues since the initial import or your last acknowledgment.' });
  const button = modal.contentEl.createEl('button', { text: 'Mark all as seen' });
  button.onclick = () =>
  {
    modal.close();
    onSeen();
  };
  modal.open();
}
