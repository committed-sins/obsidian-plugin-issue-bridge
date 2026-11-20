import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { MarkdownRenderChild, type Plugin } from 'obsidian';

const ISSUE_URL = /^https:\/\/github\.com\/[a-z\d-]+\/[a-z\d_.-]+\/issues\/\d+$/i;

export function taskIconOffset(line: string): number | null
{
  const prefix = /^(\s*- \[[^\]]\] )/.exec(line);
  if (!prefix || !/\[#\d+(?: [^\n]*)?\]\(https:\/\/github\.com\/[a-z\d-]+\/[a-z\d_.-]+\/issues\/\d+\)/i.test(line.slice(prefix[1].length))) return null;
  return prefix[1].length;
}

export function decorateIssueLinks(root: HTMLElement): void
{
  const decorated = new Set<HTMLElement>();
  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (!ISSUE_URL.test(link.getAttribute('href') ?? '') || !/^#\d+(?:\s|$)/.test(link.textContent ?? '')) continue;
    const item = link.closest<HTMLElement>('li.task-list-item');
    if (!item || !root.contains(item) || decorated.has(item)) continue;
    decorated.add(item);
    const description = link.closest<HTMLElement>('.task-description, .tasks-list-text');
    const target = description && item.contains(description) ? description : item;
    // Tasks may wrap or clone previously decorated markup. Reuse one icon
    // belonging to this task, regardless of wrappers; leave subtasks alone.
    const existing = Array.from(item.querySelectorAll<HTMLElement>('.issue-bridge-github-icon'))
      .filter(icon => icon.closest('li.task-list-item') === item);
    const icon = existing[0] ?? root.ownerDocument.adoptNode(createSpan({ cls: 'issue-bridge-github-icon', attr: { role: 'img', 'aria-label': 'GitHub' } }));
    for (const duplicate of existing.slice(1)) duplicate.remove();
    if (target !== item) {
      if (target.firstChild !== icon) target.prepend(icon);
    }
    else {
      const checkbox = item.querySelector('input[type="checkbox"]');
      let anchor: Node | null = checkbox?.closest('li') === item ? checkbox : null;
      while (anchor?.parentNode && anchor.parentNode !== item) anchor = anchor.parentNode;
      const before = anchor ? anchor.nextSibling : item.firstChild;
      if (before !== icon) item.insertBefore(icon, before);
    }
  }
}

export class TaskIcons extends MarkdownRenderChild
{
  private observer?: MutationObserver;
  constructor(containerEl: HTMLElement, private disposed?: () => void)
  {
    super(containerEl);
  }
  onload(): void
  {
    decorateIssueLinks(this.containerEl);
    this.observer = new window.MutationObserver(() => decorateIssueLinks(this.containerEl));
    this.observer.observe(this.containerEl, { childList: true, subtree: true });
  }
  onunload(): void
  {
    this.observer?.disconnect();
    this.disposed?.();
  }
}

export function registerTaskIcons(plugin: Plugin): void
{
  const active = new Set<TaskIcons>();
  plugin.register(() =>
  {
    for (const child of active) child.unload();
    active.clear();
  });
  plugin.registerMarkdownPostProcessor((el, ctx) =>
  {
    const child = new TaskIcons(el, () =>
    {
      active.delete(child);
    });
    active.add(child);
    ctx.addChild(child);
  });
}

class GitHubIcon extends WidgetType
{
  eq(): boolean
  {
    return true;
  }
  toDOM(view: EditorView): HTMLElement
  {
    const icon = view.dom.ownerDocument.adoptNode(createSpan({ cls: 'issue-bridge-github-icon' }));
    icon.setAttribute('aria-label', 'GitHub');
    icon.setAttribute('role', 'img');
    return icon;
  }
}

// Decorations leave Markdown and the Tasks description untouched.
function icons(view: EditorView): DecorationSet
{
  const widgets = [];
  const seen = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const offset = taskIconOffset(line.text);
      if (offset !== null && !seen.has(line.from)) widgets.push(Decoration.widget({ widget: new GitHubIcon(), side: 1 }).range(line.from + offset));
      seen.add(line.from);
      pos = line.to + 1;
    }
  }
  return Decoration.set(widgets, true);
}

export const sourceIcons = ViewPlugin.fromClass(class
{
  decorations: DecorationSet;
  constructor(view: EditorView)
  {
    this.decorations = icons(view);
  }
  update(update: ViewUpdate): void
  {
    if (update.docChanged || update.viewportChanged) this.decorations = icons(update.view);
  }
}, { decorations: value => value.decorations });
