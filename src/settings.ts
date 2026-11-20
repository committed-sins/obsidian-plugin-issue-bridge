import { App, PluginSettingTab, Setting, requireApiVersion, type SettingDefinitionRender } from 'obsidian';
import { isRecord } from './validation';
import type IssueBridge from './main';
import { ISSUE_BRIDGE_APP } from './github/app';
import { cleanSourceTags, EMPTY_SOURCE_TAGS, normalizeSourceTag, SOURCE_TAG_DEFINITIONS, type SourceTags } from './sync/sourceTags';
export interface Settings { clientId: string; autoSync: boolean; startupSync: boolean; intervalMinutes: number; notifyNew: boolean; excludedFolders: string; repositoryProperty: string; respectTasks: boolean; sourceTags: SourceTags }
export const DEFAULTS: Settings = { clientId: ISSUE_BRIDGE_APP.clientId, autoSync: true, startupSync: true, intervalMinutes: 5, notifyNew: true, excludedFolders: 'archives, templates, scripts, libraries, inbound', repositoryProperty: 'github_repo', respectTasks: true, sourceTags: { ...EMPTY_SOURCE_TAGS } };
export function cleanSettings(input: unknown): Settings
{
  const s = isRecord(input) ? input : {};
  return { clientId: typeof s.clientId === 'string' && s.clientId.trim() ? s.clientId.trim() : DEFAULTS.clientId,
    autoSync: typeof s.autoSync === 'boolean' ? s.autoSync : DEFAULTS.autoSync,
    startupSync: typeof s.startupSync === 'boolean' ? s.startupSync : DEFAULTS.startupSync,
    notifyNew: typeof s.notifyNew === 'boolean' ? s.notifyNew : DEFAULTS.notifyNew,
    repositoryProperty: typeof s.repositoryProperty === 'string' && s.repositoryProperty.trim() ? s.repositoryProperty.trim() : DEFAULTS.repositoryProperty,
    respectTasks: typeof s.respectTasks === 'boolean' ? s.respectTasks : DEFAULTS.respectTasks,
    sourceTags: cleanSourceTags(s.sourceTags),
    intervalMinutes: typeof s.intervalMinutes === 'number' && Number.isFinite(s.intervalMinutes) ? Math.max(1, Math.min(1440, Math.round(s.intervalMinutes))) : DEFAULTS.intervalMinutes,
    excludedFolders: typeof s.excludedFolders === 'string' ? s.excludedFolders : DEFAULTS.excludedFolders };
}
type SettingsRow = Pick<SettingDefinitionRender, 'name' | 'desc'> & { render: (setting: Setting) => void };

export class IssueBridgeSettings extends PluginSettingTab
{
  constructor(app: App, private plugin: IssueBridge)
  {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionRender[]
  {
    return this.rows();
  }

  // Only used by Obsidian versions before the declarative API (1.13).
  display(): void
  {
    this.renderLegacy();
  }

  private renderLegacy(): void
  {
    this.containerEl.empty();
    for (const definition of this.rows()) {
      const row = new Setting(this.containerEl).setName(definition.name);
      if (definition.desc) row.setDesc(definition.desc);
      definition.render(row);
    }
  }

  private refresh(): void
  {
    if (requireApiVersion('1.13.0')) this.update();
    else this.renderLegacy();
  }

  private rows(): SettingsRow[]
  {
    const p = this.plugin;
    return [
      {
        name: 'Issue Bridge',
        desc: 'Assigned GitHub issues become native tasks in mapped notes. GitHub controls titles and completion; local planning metadata is preserved.',
        render: row =>
        {
          row.setHeading();
        }
      },
      {
        name: 'Repository property',
        desc: 'Frontmatter property containing a repository URL or URL list, for example urls. The first valid GitHub repository URL is used. Also applies to README blocks.',
        render: row =>
        {
          row.addText(t => t.setPlaceholder('github_repo').setValue(p.settings.repositoryProperty).onChange(async value =>
          {
            p.settings.repositoryProperty = value.trim() || DEFAULTS.repositoryProperty;
            await p.saveSettings();
          }));
        }
      },
      {
        name: 'Respect Obsidian Tasks',
        desc: 'Add the GitHub issue creation date and a stable task ID. Uses the saved Tasks emoji or Dataview format and global filter; defaults to emoji without Tasks. Local dates, priorities and IDs are retained even when disabled.',
        render: row =>
        {
          row.addToggle(t => t.setValue(p.settings.respectTasks).onChange(async value =>
          {
            p.settings.respectTasks = value; await p.saveSettings();
          }));
        }
      },
      {
        name: 'Source tags',
        desc: 'Optional tags appended to imported tasks, configured separately for each source.',
        render: row =>
        {
          row.setHeading();
        }
      },
      ...SOURCE_TAG_DEFINITIONS.map(source =>
      {
        const desc = 'One optional tag, with or without #. Leave empty to stop adding it. Existing tags remain when changing or clearing this field. Also works with Respect Obsidian Tasks disabled.';
        return {
          name: `${source.name} tag`, desc,
          render: (row: Setting) =>
          {
            row.addText(text => text.setPlaceholder(source.placeholder).setValue(p.settings.sourceTags[source.id]).onChange(async value =>
            {
              let tag: string;
              try { tag = normalizeSourceTag(value); }
              catch (error) {
                row.setDesc(error instanceof Error ? error.message : 'Use one valid tag.');
                return;
              }
              row.setDesc(desc);
              p.settings.sourceTags = { ...p.settings.sourceTags, [source.id]: tag };
              await p.saveSettings();
            }));
          }
        };
      }),
      {
        name: 'Repository access',
        desc: 'Install Issue Bridge by Committed Sins on selected repositories before syncing. The app is limited to the Committed Sins organization and requests Issues: read-only. Private issue titles and links are saved in your notes and follow the vault’s sync and sharing settings.',
        render: row =>
        {
          row.addButton(b => b.setButtonText('Choose repositories on GitHub').onClick(() =>
          {
            window.open(ISSUE_BRIDGE_APP.installUrl, '_blank', 'noopener,noreferrer');
          }));
        }
      },
      {
        name: 'Connection', desc: p.connectionLabel(),
        render: row =>
        {
          row.addButton(b => b.setButtonText('Sign in').setDisabled(p.busy || p.signingIn).onClick(() => p.signIn(() => this.refresh())))
            .addButton(b => b.setButtonText('Disconnect').setDisabled(p.busy || p.signingIn).onClick(() =>
            {
              p.disconnect(); this.refresh();
            }));
        }
      },
      {
        name: 'GitHub App client ID',
        desc: 'Defaults to Issue Bridge by Committed Sins. Override only for your own GitHub App with Device Flow and Issues: read-only. Sign out before changing it. Credentials use Obsidian SecretStorage, not plugin settings. Disconnect clears this vault’s credential; revoke authorization on GitHub to invalidate it.',
        render: row =>
        {
          row.addText(t => t.setPlaceholder('Iv…').setValue(p.settings.clientId).setDisabled(p.hasCredential() || p.busy || p.signingIn).onChange(async value =>
          {
            p.settings.clientId = value.trim(); await p.saveSettings();
          }));
        }
      },
      {
        name: 'Check on startup and resume',
        desc: 'When connected, check mapped repositories after loading and when returning to Obsidian.',
        render: row =>
        {
          row.addToggle(t => t.setValue(p.settings.startupSync).onChange(async value =>
          {
            p.settings.startupSync = value; await p.saveSettings();
          }));
        }
      },
      {
        name: 'Automatic synchronization',
        desc: 'Runs only while Obsidian is open. Devices suspended by the OS cannot poll.',
        render: row =>
        {
          row.addToggle(t => t.setValue(p.settings.autoSync).onChange(async value =>
          {
            p.settings.autoSync = value; await p.saveSettings();
          }));
        }
      },
      {
        name: 'Check interval (minutes)',
        desc: '1–1440 minutes. Default: 5. Rate limits can postpone a check.',
        render: row =>
        {
          row.addText(t => t.setValue(String(p.settings.intervalMinutes)).onChange(async value =>
          {
            const n = Number(value);
            if (!Number.isInteger(n) || n < 1 || n > 1440) return;
            p.settings.intervalMinutes = n; await p.saveSettings();
          }));
        }
      },
      {
        name: 'Notify about new assigned issues',
        desc: 'One Obsidian notice per sync, plus an unread count in the status bar. First import establishes the baseline. Includes issues assigned to you after creation; this is not a push notification.',
        render: row =>
        {
          row.addToggle(t => t.setValue(p.settings.notifyNew).onChange(async value =>
          {
            p.settings.notifyNew = value; await p.saveSettings();
          }));
        }
      },
      {
        name: 'Excluded folders',
        desc: 'Comma-separated paths. Notes in these folders are not scanned or updated.',
        render: row =>
        {
          row.addText(t => t.setValue(p.settings.excludedFolders).onChange(async value =>
          {
            p.settings.excludedFolders = value; await p.saveSettings();
          }));
        }
      },
      {
        name: 'Synchronization', desc: p.statusText(),
        render: row =>
        {
          row.addButton(b => b.setButtonText('Sync now').setCta().setDisabled(p.busy || p.signingIn).onClick(async () =>
          {
            b.setDisabled(true); await p.sync(true); this.refresh();
          }))
            .addButton(b => b.setButtonText('Show new issues').onClick(() => p.showNewIssues(() => this.refresh())));
        }
      },
      {
        name: 'Link a note',
        desc: `Set ${p.settings.repositoryProperty}: https://github.com/owner/repository in frontmatter. Use one active note per repository. First sync appends a GitHub Issues section. Closed assigned issues stay visible; issues no longer assigned disappear after a complete successful fetch. Changing the mapping leaves the old generated section until you remove it or sync the new mapping.`,
        render: row =>
        {
          row.setHeading();
        }
      }
    ];
  }
}
