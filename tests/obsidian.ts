// Minimal synthetic host for runtime tests; not a simulation of real Obsidian persistence.
export class TFile { constructor(public path = '') {} }
export class MarkdownView { constructor(public file: TFile, private text: string) {} getViewData() { return this.text; } }
export class Notice { static messages: string[] = []; constructor(message: string) { Notice.messages.push(message); } }
export class Plugin { constructor(public app: any, public manifest: any) {} }
export class Modal { constructor(public app: any) {} }
export class PluginSettingTab { constructor(public app: any, public plugin: any) {} }
export class Setting {}
export class App {}
export function requestUrl(): never { throw new Error('Unexpected real transport in test.'); }
export function getFrontMatterInfo(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  return { exists: !!match, frontmatter: match?.[1] ?? '', contentStart: match?.[0].length ?? 0 };
}
export function parseYaml(content: string) {
  const match = /^github_repo:\s*(.+)$/m.exec(content);
  return match ? { github_repo: match[1].trim().replace(/^['"]|['"]$/g, '') } : {};
}
