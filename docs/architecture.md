# Architecture

## Data flow

Explicit `github_repo` property → normalized unique repository mapping → authenticated GitHub assigned-issue fetch → complete paginated result → escaped native tasks → guarded managed-block update.

GitHub is authoritative for the managed tasks in v0.1. Obsidian owns surrounding text and frontmatter. No repository file sync, Git commits or remote issue writes are performed by the plugin.

## Source layout

```text
src/
  main.ts                 Lifecycle, scan/write orchestration, scheduler, unread list
  settings.ts             Validated configuration and settings UI
  deviceFlowModal.ts      Cancellable browser-based sign-in
  github/
    auth.ts               Device-code/poll/refresh requests; injected transport
    session.ts            Credential validation, renewal and SecretStorage adapter
    client.ts             GitHub REST reads, issues, pagination, errors/backoff
  sync/
    core.ts               URL normalization, marker validation, escaping, rendering
tests/
  core.test.ts            Transformation, provider, auth and synthetic-host tests
  obsidian.ts             Minimal synthetic host, not real Obsidian persistence
  deploy.test.mjs         Temporary-vault deployment checks
vendor/github-enterprise-sync/
                          Original pinned auth/UI references and MIT license
```

Authentication and sign-in UI are adapted from wandermyz/obsidian-github-sync at commit `04063b3a6213f4b8915e0955119b93d2089414e0`. See THIRD_PARTY_NOTICES.md. Reference files are not compiled. The original MIT text is included in the built main.js banner as well as the repository.

## Sync boundary

1. Read note frontmatter from file content, excluding configured folders. Normalize supported github.com URLs and identify duplicate mappings.
2. Verify the connected GitHub login. Fetch every issue page with `state=all` and the account's assignee filter, excluding pull requests. Invalid or failed pages fail the whole repository result.
3. Render stable issue-number ordering, open/closed checkboxes and canonical issue links. Entity-encode title punctuation/metadata symbols to avoid injected Markdown, Tasks metadata and markers.
4. Re-read mappings after network requests. Skip new duplicates or intervening vault changes. Validate markers, file content, mapping and open editor buffers again in the write callback.
5. Use `Vault.process` for guarded changed-content writes. Avoid invoking it for identical content. Existing YAML and text outside the marker pair remain byte-for-byte unchanged.
6. Advance the device-local assigned-issue baseline only after a successful note update/check. Different repositories may succeed independently; errors are reported per note.

Only one synchronization job runs at a time; overlapping triggers are skipped. Unload invalidates in-flight results, timers and sign-in. Requests already sent cannot be aborted by Obsidian's HTTP adapter, but their results cannot start subsequent writes. A file write already handed to Obsidian can still finish. Later OS/filesystem failures are outside a synthetic test's guarantees.

## Product choices

- First insertion appends `## GitHub Issues`. Exactly one marker pair is required thereafter. Marker text inside fenced code or malformed lines is rejected.
- One repository per note and one active note per normalized repository. Casing, trailing slash and `.git` suffix normalize to the same mapping.
- Removing a mapping stops future writes and leaves its block. Changing the mapping replaces the existing block on the next successful sync.
- Closed assigned issues remain checked tasks; no synthetic completion date is added. Local checkbox edits and Tasks-added metadata inside the block are replaced on sync.
- Default five-minute polling plus startup/resume checks. Rate-limit responses defer retries. No webhook server or OS push service.
- First import establishes the notification baseline. Later additions to the assigned set remain unread until acknowledged; notes update independently of the notice toggle.

## Authentication and state

GitHub.com only. The registered organization-owned **Issue Bridge by Committed Sins** client ID is the default, with a custom-ID override. Its initial installation scope is Committed Sins only. Device Flow is enabled, Issues is read-only, and installations on selected repositories require separate approval. No upstream app identity or client secret. GitHub documents renewal without a client secret for device-flow-issued tokens; setup.md links the sources. Real sign-in/renewal remain pending live testing.

One SecretStorage record holds the app ID, account, access/refresh tokens and expiries. Renewal is serialized; rotated credentials are saved together. Disconnect/sign-in/unload guards prevent stale renewal from restoring cleared credentials. The random reference is vault/device-local. The preview never falls back to plaintext vault files. SecretStorage's platform protections belong to Obsidian; no universal encryption-at-rest guarantee is asserted.

Plugin data.json contains non-secret settings. Vault-scoped local storage contains non-secret issue-number baselines, unread repository/issue/note references and check summaries. Each device has independent notification state. Imported private issue content follows the vault's sync, Git history and sharing rules.

## Validation limits

Tests use synthetic responses and a minimal host stub. They establish behavior under those fixtures, not actual desktop/mobile editor persistence, background lifecycle, SecretStorage protection or real GitHub access. Run setup.md's live checks before broader deployment or release.
