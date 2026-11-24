import type { App } from 'obsidian';
import type { Http } from '../github/auth';
import { ApiError, GitHubClient } from '../github/client';
import type { Session } from '../github/session';
import type { LocalState } from '../localState';
import type { Settings } from '../settings';
import { recordAssignments } from './assignmentHistory';
import { duplicateRepos, type Mapping } from './repositoryMapping';
import { RepositoryNotes } from './repositoryNotes';
import { readTaskOptions } from './taskOptions';

export interface SyncContext
{
  app: App;
  settings: () => Settings;
  state: LocalState;
  session: Session;
  http: Http;
  active: () => boolean;
  revision: () => number;
  persist: () => void;
  backOffUntil: (time: number) => void;
}

export async function syncAssignedIssues(context: SyncContext, manual: boolean): Promise<string | undefined>
{
  const { app, state, session, http, active } = context;
  const settings = context.settings();
  const configuration = JSON.stringify(settings);
  const checkSettings = () =>
  {
    if (JSON.stringify(context.settings()) !== configuration) throw new Error('Settings changed during sync; retry.');
  };
  const options = await readTaskOptions(app.vault, settings);
  checkSettings();

  const notes = new RepositoryNotes(app, settings.repositoryProperty, settings.excludedFolders, context.revision, active);
  const warnings: string[] = [];
  const mappings: Mapping[] = [];
  for await (const mapping of notes.scan(path => warnings.push(`${path}: invalid frontmatter or repository property; skipped.`))) {
    mappings.push(mapping);
  }
  if (!active()) return;

  let updated = 0, added = 0, completed = 0;
  if (!mappings.length) {
    state.summary = warnings.length ? warnings.join('\n') : `No mapped notes. Add a GitHub repository URL to ${settings.repositoryProperty} to start importing.`;
  } else {
    const token = await session.token();
    const client = new GitHubClient(http, token, active);
    const login = await client.currentUser();
    const credential = session.read();
    if (!credential || login.toLowerCase() !== credential.login.toLowerCase()) throw new Error('Connected account changed. Disconnect and sign in again.');

    const duplicates = duplicateRepos(mappings);
    for (const mapping of mappings) {
      if (!active()) return;
      if (duplicates.has(mapping.repo)) {
        warnings.push(`${mapping.path}: duplicate repository mapping; skipped.`);
        continue;
      }
      try {
        const issues = await client.assignedIssues(mapping.repo, login);
        if (!active()) return;
        if (await notes.update(mapping, issues, options, checkSettings)) updated++;
        if (!active()) return;
        completed++;
        added += recordAssignments(state, login, mapping, issues.map(issue => issue.number));
        context.persist();
      } catch (error) {
        if (!active()) return;
        warnings.push(`${mapping.path}: ${error instanceof Error ? error.message : 'Sync failed; previous tasks retained.'}`);
        if (error instanceof ApiError && error.retryAt) {
          context.backOffUntil(error.retryAt);
          break;
        }
        if (error instanceof ApiError && error.status === 401) break;
      }
    }
    state.summary = `${completed}/${mappings.length} mapped note(s) checked; ${updated} updated; ${added} new assigned issue(s).${warnings.length ? '\n' + warnings.join('\n') : ''}`;
  }
  if (!warnings.length) state.lastSync = Date.now();
  if (added && context.settings().notifyNew) {
    return `${added} new assigned issue(s). Click the status bar or use “Show new assigned issues”.${warnings.length ? ' Some notes were skipped; see settings.' : ''}`;
  }
  if (warnings.length) return 'some notes were skipped. See settings for details.';
  return manual ? `${completed} mapped note(s) checked, ${updated} updated.` : undefined;
}
