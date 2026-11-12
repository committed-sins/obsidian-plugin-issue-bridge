import MarkdownIt from 'markdown-it';
export function previewPath(source: string): string {
  const lines = source.trim().split(/\r?\n/);
  const path = lines[0]?.trim();
  if (lines.length !== 1 || !path || path.length > 512 || !/\.md$/i.test(path)
    || path.startsWith('/') || /[\\:#?\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Use one relative Markdown file path, for example README.md or docs/overview.md.');
  }
  return path;
}
function remoteLink(value: string, sourceUrl: string): string | null {
  try {
    const url = new URL(value, sourceUrl);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export function previewHtml(markdown: string, sourceUrl: string): string {
  // Deliberately use a standalone Markdown parser, not Obsidian's renderer:
  // remote code fences must never invoke local executable plugin processors.
  const md = new MarkdownIt({ html: false, linkify: false });
  md.renderer.rules.link_open = (tokens, idx, options, env, renderer) => {
    const token = tokens[idx], href = remoteLink(String(token.attrGet('href') ?? ''), sourceUrl);
    token.attrSet('href', href ?? '#'); token.attrSet('target', '_blank'); token.attrSet('rel', 'noopener noreferrer');
    return renderer.renderToken(tokens, idx, options);
  };
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx], href = remoteLink(String(token.attrGet('src') ?? ''), sourceUrl);
    const label = md.utils.escapeHtml(token.content || 'Image');
    return href ? `<a href="${md.utils.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">[${label}]</a>` : `[${label}]`;
  };
  return md.render(markdown);
}
