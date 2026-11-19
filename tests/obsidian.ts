// Minimal synthetic host for runtime tests; not a simulation of real Obsidian persistence.
export class TFile { constructor(public path = '') {} }
export class MarkdownView { constructor(public file: TFile, private text: string) {} getViewData() { return this.text; } }
export class Notice { static messages: string[] = []; constructor(message: string) { Notice.messages.push(message); } }
export class Plugin { constructor(public app: any, public manifest: any) {} }
export class Modal { constructor(public app: any) {} }
export const settingsHost = { modern: true };
export function requireApiVersion(_version: string)
{
  return settingsHost.modern;
}
export class PluginSettingTab
{
  containerEl = { rows: [] as Setting[], empty: () =>
  { this.containerEl.rows = []; } };
  updates = 0;
  constructor(public app: any, public plugin: any)
  {}
  update()
  {
    this.updates++;
  }
}
export class SettingControl
{
  text = ''; value: unknown; disabled = false;
  change?: (value: any) => unknown;
  click?: () => unknown;
  setValue(value: unknown)
  { this.value = value; return this; }
  setPlaceholder(_value: string)
  { return this; }
  setDisabled(value: boolean)
  { this.disabled = value; return this; }
  setButtonText(value: string)
  { this.text = value; return this; }
  setCta()
  { return this; }
  onChange(callback: (value: any) => unknown)
  { this.change = callback; return this; }
  onClick(callback: () => unknown)
  { this.click = callback; return this; }
}
export class Setting
{
  name = ''; desc: unknown; heading = false;
  controls: SettingControl[] = [];
  constructor(container: { rows: Setting[] })
  { container.rows.push(this); }
  setName(value: string)
  { this.name = value; return this; }
  setDesc(value: unknown)
  { this.desc = value; return this; }
  setHeading()
  { this.heading = true; return this; }
  addText(callback: (control: SettingControl) => unknown)
  { return this.addControl(callback); }
  addToggle(callback: (control: SettingControl) => unknown)
  { return this.addControl(callback); }
  addButton(callback: (control: SettingControl) => unknown)
  { return this.addControl(callback); }
  private addControl(callback: (control: SettingControl) => unknown)
  {
    const control = new SettingControl(); this.controls.push(control); callback(control); return this;
  }
}
export class App {}
export class MarkdownRenderChild {
  constructor(public containerEl: HTMLElement) {}
  unload(): void
  {
    this.onunload();
  }
  onunload(): void
  {
    // Synthetic Component lifecycle hook.
  }
  registerDomEvent(el: HTMLElement, name: string, handler: EventListener) { el.addEventListener(name, handler); }
}
export function sanitizeHTMLToDom(html: string) { return { html }; }
export function requestUrl(): never { throw new Error('Unexpected real transport in test.'); }
export function getFrontMatterInfo(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  return { exists: !!match, frontmatter: match?.[1] ?? '', contentStart: match?.[0].length ?? 0 };
}
export function parseYaml(content: string) {
  if (content.trim().startsWith('{')) return JSON.parse(content);
  const match = /^github_repo:\s*(.+)$/m.exec(content);
  return match ? { github_repo: match[1].trim().replace(/^['"]|['"]$/g, '') } : {};
}
