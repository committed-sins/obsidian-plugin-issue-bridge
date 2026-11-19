import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';

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
      const task = /^(\s*- \[[^\]]\] )\[#\d+ .+\]\(https:\/\/github\.com\/[a-z\d-]+\/[a-z\d_.-]+\/issues\/\d+\)/i.exec(line.text);
      if (task && !seen.has(line.from)) widgets.push(Decoration.widget({ widget: new GitHubIcon(), side: 1 }).range(line.from + task[1].length));
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
