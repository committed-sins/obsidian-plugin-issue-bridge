import { MarkdownView, TFile, type App } from 'obsidian';
import type { Issue } from '../github/client';
import { readRepositoryMapping, type Mapping } from './repositoryMapping';
import { taskIds, type TaskOptions } from './taskMarkdown';
import { updateBlock } from './managedBlock';

export class RepositoryNotes
{
  private readonly excludedFolders: string[];
  private readonly usedIds = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly property: string,
    excludedFolders: string,
    private readonly revision: () => number,
    private readonly active: () => boolean
  )
  {
    this.excludedFolders = excludedFolders.split(',').map(folder => folder.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
  }

  private excluded(path: string): boolean
  {
    return this.excludedFolders.some(folder => path === folder || path.startsWith(folder + '/'));
  }

  async *scan(onInvalid?: (path: string) => void): AsyncIterable<Mapping>
  {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.active()) break;
      if (this.excluded(file.path)) continue;
      const content = await this.app.vault.read(file);
      for (const id of taskIds(content)) this.usedIds.add(id);
      try {
        const mapping = readRepositoryMapping(content, this.property);
        if (mapping) yield { path: file.path, content, ...mapping };
      } catch { onInvalid?.(file.path); }
    }
  }

  async update(mapping: Mapping, issues: Issue[], options: TaskOptions, checkSettings: () => void): Promise<boolean>
  {
    const file = this.app.vault.getAbstractFileByPath(mapping.path);
    if (!(file instanceof TFile)) throw new Error('Note moved during sync; retry.');

    // Re-read after the GitHub request to detect new duplicate mappings and IDs.
    const revision = this.revision();
    let owners = 0;
    for await (const candidate of this.scan()) {
      if (candidate.repo === mapping.repo) owners++;
    }
    if (!this.active() || revision !== this.revision() || owners !== 1) throw new Error('Notes or repository mappings changed during sync; retry.');

    const next = updateBlock(mapping.content, mapping.bodyOffset, mapping.repo, issues, { ...options, usedIds: this.usedIds });
    const check = (current: string): string =>
    {
      if (!this.active() || this.excluded(file.path)) throw new Error('Sync cancelled.');
      checkSettings();
      if (revision !== this.revision()) throw new Error('Notes changed during sync; retry.');
      if (current !== mapping.content || this.dirty(file, current)) throw new Error('Note changed during sync; retry after saving.');
      return next;
    };
    if (next === mapping.content) {
      check(await this.app.vault.read(file));
      return false;
    }
    await this.app.vault.process(file, check);
    return true;
  }

  private dirty(file: TFile, content: string): boolean
  {
    return this.app.workspace.getLeavesOfType('markdown').some(leaf =>
    {
      const view = leaf.view;
      return view instanceof MarkdownView && view.file === file && view.getViewData() !== content;
    });
  }
}
