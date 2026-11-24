import type { Vault } from 'obsidian';
import type { Settings } from '../settings';
import { isRecord } from '../validation';
import type { TaskOptions } from './taskMarkdown';

export async function readTaskOptions(vault: Vault, settings: Settings): Promise<TaskOptions>
{
  const result: TaskOptions = { respectTasks: settings.respectTasks, format: 'emoji', sourceTag: settings.sourceTags.githubIssues };
  if (!result.respectTasks) return result;
  const adapter = vault.adapter;
  const path = `${vault.configDir}/plugins/obsidian-tasks-plugin/data.json`;
  if (!adapter || !await adapter.exists(path)) return result;
  // Read saved public configuration only; no dependency on Tasks internals.
  const config: unknown = JSON.parse(await adapter.read(path));
  if (!isRecord(config)) throw new Error('Invalid Tasks configuration; previous tasks retained.');
  if (config.taskFormat === 'dataview') result.format = 'dataview';
  else if (config.taskFormat && config.taskFormat !== 'tasksPluginEmoji') throw new Error('Unsupported Tasks format; previous tasks retained.');
  if (typeof config.globalFilter === 'string' && config.globalFilter.trim()) {
    if (/[\r\n<>]/.test(config.globalFilter)) throw new Error('Unsupported Tasks global filter; previous tasks retained.');
    result.globalFilter = config.globalFilter.trim();
  }
  return result;
}
