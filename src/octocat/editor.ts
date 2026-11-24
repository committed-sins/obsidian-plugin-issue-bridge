import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField, getFrontMatterInfo } from 'obsidian';
import MarkdownIt from 'markdown-it';
import { createOctocat } from './render';
import { OCTOCAT } from './shortcode';

const markdown = new MarkdownIt();
const literalBlocks = new Set(['fence', 'code_block', 'html_block']);

// Keep offsets aligned with CodeMirror's normalized LF document.
export function literalLines(text: string): Set<number>
{
  const lines = new Set<number>();
  if (!text.includes(OCTOCAT)) return lines;
  const { contentStart } = getFrontMatterInfo(text);
  const frontmatterLines = text.slice(0, contentStart).split('\n').length - 1;
  for (let line = 1; line <= frontmatterLines; line++) lines.add(line);
  for (const token of markdown.parse(text.slice(contentStart), {})) {
    if (!token.map || !literalBlocks.has(token.type)) continue;
    for (let line = token.map[0]; line < token.map[1]; line++) lines.add(frontmatterLines + line + 1);
  }
  return lines;
}

export function shortcodeOffsets(line: string): number[]
{
  // Skip inline code, HTML/autolinks, and Markdown link destinations.
  const literals = /\x60+.*?\x60+|<[^>]*>|\]\((?:[^()]|\([^()]*\))*\)|\[\[[^\]]*\]\]/g;
  const ranges = [...line.matchAll(literals)];
  const offsets: number[] = [];
  for (let offset = line.indexOf(OCTOCAT); offset !== -1; offset = line.indexOf(OCTOCAT, offset + OCTOCAT.length)) {
    if (!ranges.some(match => offset >= match.index && offset < match.index + match[0].length)) offsets.push(offset);
  }
  return offsets;
}

class OctocatWidget extends WidgetType
{
  toDOM(view: EditorView): HTMLElement
  {
    return createOctocat(view.dom.ownerDocument);
  }
}

function decorations(view: EditorView, excluded: Set<number>): DecorationSet
{
  if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
  const widgets = [];
  const seen = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;
      if (excluded.has(line.number) || seen.has(line.number)) continue;
      seen.add(line.number);
      for (const offset of shortcodeOffsets(line.text)) {
        const start = line.from + offset;
        const end = start + OCTOCAT.length;
        if (view.state.selection.ranges.some(range => range.from <= end && range.to >= start)) continue;
        widgets.push(Decoration.replace({ widget: new OctocatWidget() }).range(start, end));
      }
    }
  }
  return Decoration.set(widgets, true);
}

export const octocatEditor = ViewPlugin.fromClass(class
{
  decorations: DecorationSet;
  private excluded: Set<number>;

  constructor(view: EditorView)
  {
    this.excluded = literalLines(view.state.doc.toString());
    this.decorations = decorations(view, this.excluded);
  }

  update(update: ViewUpdate): void
  {
    if (update.docChanged) this.excluded = literalLines(update.state.doc.toString());
    if (update.docChanged || update.viewportChanged || update.selectionSet || update.startState.field(editorLivePreviewField, false) !== update.state.field(editorLivePreviewField, false)) {
      this.decorations = decorations(update.view, this.excluded);
    }
  }
}, { decorations: value => value.decorations });
