import { MarkdownRenderChild, type Plugin } from 'obsidian';
import { OCTOCAT } from './shortcode';

const ICON_CLASS = 'issue-bridge-github-icon';
const LITERAL_CONTENT = 'pre, code, script, style, textarea, svg, math, .metadata-container';

export function createOctocat(doc: Document): HTMLElement
{
  return doc.adoptNode(createSpan({ cls: ICON_CLASS, attr: { role: 'img', 'aria-label': 'GitHub Octocat' } }));
}

export function renderOctocats(root: HTMLElement): void
{
  if (root.closest(LITERAL_CONTENT)) return;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  const matches: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3 && (node.nodeValue ?? '').includes(OCTOCAT) && !node.parentElement?.closest(LITERAL_CONTENT)) {
      matches.push(node as Text);
    }
  }
  for (const node of matches) {
    const parts = node.data.split(OCTOCAT);
    const fragment = doc.createDocumentFragment();
    for (const [index, part] of parts.entries()) {
      if (index) fragment.append(createOctocat(doc));
      if (part) fragment.append(doc.createTextNode(part));
    }
    node.replaceWith(fragment);
  }
}

export class OctocatRenderChild extends MarkdownRenderChild
{
  private observer?: MutationObserver;

  constructor(containerEl: HTMLElement, private readonly dispose?: () => void)
  {
    super(containerEl);
  }

  onload(): void
  {
    renderOctocats(this.containerEl);
    // Query plugins may render their results after the Markdown processor runs.
    this.observer = new window.MutationObserver(() => renderOctocats(this.containerEl));
    this.observer.observe(this.containerEl, { childList: true, characterData: true, subtree: true });
  }

  onunload(): void
  {
    this.observer?.disconnect();
    for (const icon of Array.from(this.containerEl.querySelectorAll(`.${ICON_CLASS}`))) {
      icon.replaceWith(this.containerEl.ownerDocument.createTextNode(OCTOCAT));
    }
    this.dispose?.();
  }
}

export function registerOctocatRenderer(plugin: Plugin): void
{
  const children = new Set<OctocatRenderChild>();
  plugin.register(() =>
  {
    for (const child of children) child.unload();
    children.clear();
  });
  plugin.registerMarkdownPostProcessor((el, ctx) =>
  {
    const child = new OctocatRenderChild(el, () =>
    {
      children.delete(child);
    });
    children.add(child);
    ctx.addChild(child);
  });
}
