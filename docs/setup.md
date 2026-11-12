# Test preview setup

Issue Bridge 0.1.1 is a development preview. Desktop/mobile runtime behavior and a real GitHub App login still require live validation. The test deployment target is `C:/Users/mj/Obsidian/Test`, selected in ignored `.env.local`.

## GitHub App

**Issue Bridge by Committed Sins** is registered under the Committed Sins organization:

- App ID: `5729750`
- Public client ID: `Iv23likf10MUO96onC3o` (bundled as the default, not a secret).
- Settings: https://github.com/organizations/committed-sins/settings/apps/issue-bridge-by-committed-sins
- Installation: https://github.com/apps/issue-bridge-by-committed-sins/installations/new
- Initial installation scope: **Only on this account**, Committed Sins. Broader installation availability needs a later explicit decision.

Registered configuration:

- Homepage: https://github.com/committed-sins/obsidian-plugin-issue-bridge
- Device Flow enabled.
- Repository permission **Issues: read-only**; metadata access is implicit. No Contents write permission is needed.
- Webhooks disabled for this polling preview.
- Installation on selected repositories is a separate step and requires the organization's approval. The signed-in user also needs repository access.

The app's public client ID is already the default in Issue Bridge settings. A custom GitHub App client ID can override it. GitHub Enterprise Sync's app is not used. No client secret or private key belongs in plugin settings or source code. App registration is separate from building/deploying the plugin. GitHub's registration page reports that a private key must be generated before installation; any such administration key belongs in the owner's credential management, not the plugin. The plugin itself uses only device-flow user credentials.

GitHub currently documents device-flow token renewal without a client secret for tokens created through that flow. The implementation retains rotated access/refresh tokens together in SecretStorage. References:

- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app

## Obsidian

1. Enable/reload **Issue Bridge** in the **Test** vault.
2. Open **Settings → Issue Bridge**, select **Choose repositories on GitHub** to complete the selected-repository installation/approval, then select **Sign in**. The client ID is prefilled.
3. Copy the displayed code and open GitHub in your system browser. Authorize the app. Closing the dialog cancels sign-in.
4. In a disposable test note, add:

   ```yaml
   ---
   github_repo: https://github.com/owner/repository
   ---
   ```

5. Select **Sync now**. The first successful sync appends a **GitHub Issues** section at the bottom of the note. Put the two managed marker lines elsewhere yourself if you want a different position.

Only github.com is supported in this preview. One note per normalized repository is allowed. URL casing, a trailing slash and `.git` suffix normalize to the same mapping. Notes in excluded folders do not participate.

The imported set consists of all issues assigned to the connected account, open and closed. Pull requests are excluded. Local changes inside the managed block, including checkboxes or extra Tasks metadata, are replaced by GitHub's state on the next sync. Other note content and YAML remain unchanged. Malformed markers, duplicate mappings and concurrent/unsaved edits cause a skip.

When removing a mapping, the old block stays as ordinary content and is no longer updated. Changing a mapping replaces its existing block with the new repository's issues on the next successful sync. Private issue titles and URLs become ordinary note content: the vault's backups, Git history, sync and sharing can copy them.

## Read-only README blocks

Add this to a saved note with `github_repo: https://github.com/owner/repository` in its frontmatter:

````markdown
```issue-bridge
README.md
```
````

In Reading view or rendered Live Preview, expand the file name to fetch and show the Markdown. **Refresh** fetches again; **View on GitHub** opens the source. The block does not modify its source, the note, or imported Tasks. It uses the repository's default branch. One relative Markdown file path per block is supported, including `docs/overview.md`; paths are case-sensitive.

Public files work anonymously. Private files require sign-in, repository access and a GitHub App installation with **Contents: read-only**. The current app still requests Issues/metadata only; this change does not broaden app permissions or install it on additional repositories. A 404 can mean a missing file or insufficient access.

Files must be valid UTF-8 Markdown and no larger than 200 KiB. Up to 32 entries are cached in memory for five minutes, shared across blocks for the same connection/repository/path. Nothing is persisted in note files or synced settings. Refresh errors keep the previous preview with a status message. Closing/reloading the plugin clears its cache; each rendered block owns its DOM lifetime.

Relative links resolve on GitHub. Images appear as clickable links rather than loading automatically. HTML is escaped, output is sanitized by Obsidian, and remote code fences never invoke local code-block processors such as DataviewJS. Task syntax is plain display text without interactive checkboxes. GitHub-specific HTML layouts, wikilinks and local plugin extensions are intentionally not interpreted.

Live check: reload Issue Bridge in the Test vault, add a disposable mapped note and the block above, then expand it in Reading view and Live Preview. Check formatting, relative links, collapse/expand, refresh, a nonexistent file and an offline refresh. Verify the code block and note text stay unchanged. Actual desktop/mobile rendering is not established by synthetic host tests.

## Finding new issues

- Default: check every five minutes while Obsidian is running; startup/resume checks are also enabled.
- **New** means newly present in your assigned issue set after the first successful import. It includes later assignments of existing issues and reassignments after a successful unassigned snapshot. Unassigned issues are outside the MVP's scope.
- One notice reports additions per sync when notifications are enabled. This is an Obsidian notice, not a background OS push notification.
- The status bar keeps an unread count. Click it, use **Issue Bridge: Show new assigned issues**, or select **Show new issues** in settings to see repository/issue links and the destination note. **Mark all as seen** clears this device's unread list.
- The first import establishes a device-local baseline and does not notify for every existing issue. Manual sync always reports its result.
- Closed Obsidian, a suspended mobile app, missing connectivity or rate limits postpone discovery. Issues assigned and unassigned entirely between checks cannot be detected.
- For immediate notifications while Obsidian is closed, configure GitHub's own notifications separately.

## Credentials and state

Access and refresh tokens live as one credential record in Obsidian SecretStorage, under a random ID whose reference is stored in vault-scoped device-local storage. No plaintext credential is written to plugin `data.json`, `local.json`, note files or logs. SecretStorage is an Obsidian facility; this is not a claim that every platform encrypts secrets at rest. It is not protection against other plugins or a compromised app/device.

Non-secret configuration is saved in plugin `data.json`; it can sync. Device-local baselines, unread issue references and last-check summaries use Obsidian's vault-specific local storage and do not sync with notes. Each device establishes its own baseline. Clearing local app state loses that baseline and may leave an unused SecretStorage entry; no device ID is embedded in notes.

Disconnect clears the stored credential for this vault/device and resets its notification baseline. It does not delete imported tasks or revoke the GitHub grant server-side. Revoke the app authorization in GitHub to invalidate it there.

## Build and deploy

```sh
npm ci
npm run check
npm run deploy
```

Set `OBSIDIAN_VAULT` or ignored `.env.local` before deployment. Only `main.js`, `manifest.json` and `styles.css` are copied into the target plugin directory. Deployment does not enable the plugin or alter notes, settings, activation lists or workspace state.

## Live acceptance checks

- Sign in, cancel sign-in, disconnect, reconnect, and test renewal of an expiring token. Confirm credentials do not appear in vault files.
- Import an assigned open and closed issue in a disposable note. Close/reopen, rename, assign/unassign and sync again; inspect native checkboxes and Obsidian Tasks queries.
- After establishing the baseline, assign another issue to yourself. Verify one notice, a persistent unread badge and working issue/note links. Acknowledge it.
- Duplicate the repository mapping and verify both notes are skipped. Try a malformed block and an unsaved editor change. Confirm user text is preserved.
- Go offline or remove app access and confirm previously imported tasks remain. Check startup/resume and interval behavior on desktop and an actual mobile device.
