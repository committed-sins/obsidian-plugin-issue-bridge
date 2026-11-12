# Test preview setup

Issue Bridge 0.1.0 is an initial development preview. Desktop/mobile runtime behavior and a real GitHub App login still require live validation. The test deployment target is `C:/Users/mj/Obsidian/Test`, selected in ignored `.env.local`.

## GitHub App

Register an app owned by Committed Sins, for example **Issue Bridge**, with:

- Homepage: https://github.com/committed-sins/obsidian-plugin-issue-bridge
- Device Flow enabled.
- Repository permission **Issues: read-only**; metadata access is implicit. No Contents write permission is needed.
- Webhooks disabled for this polling preview.
- Install the app on each repository you want to import, including organization repositories. A user needs access to those repositories too.

Copy the app's **client ID**, starting with `Iv`, into Issue Bridge settings. This preview has no built-in registered app ID and does not use GitHub Enterprise Sync's app. No client secret or private key belongs in plugin settings or source code. Registration is not performed by building or deploying the plugin.

GitHub currently documents device-flow token renewal without a client secret for tokens created through that flow. The implementation retains rotated access/refresh tokens together in SecretStorage. References:

- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app

## Obsidian

1. Enable/reload **Issue Bridge** in the **Test** vault.
2. Open **Settings → Issue Bridge**, enter the client ID and select **Sign in**.
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
