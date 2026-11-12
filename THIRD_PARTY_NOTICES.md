# Third-party code

## GitHub Enterprise Sync

- Upstream: https://github.com/wandermyz/obsidian-github-sync
- Commit: `04063b3a6213f4b8915e0955119b93d2089414e0`
- Copyright (c) 2026 wandermyz
- License: MIT; full original text in [vendor/github-enterprise-sync/LICENSE](vendor/github-enterprise-sync/LICENSE).
- Original reference files: `vendor/github-enterprise-sync/auth.ts` and `deviceFlowModal.ts`. They are retained for comparison and are not bundled or executed.
- Adapted implementations: `src/github/auth.ts` and `src/deviceFlowModal.ts`.

Issue Bridge reuses the device-code request/poll/slow-down pattern, refresh-token exchange and browser-based sign-in UI structure. Changes include injectable HTTP transport, stricter validation, cancellation guards, redacted errors, its own GitHub App client ID, awaiting successful credential persistence and Obsidian SecretStorage instead of plaintext local.json storage. Host handling is restricted to github.com for this initial preview. No default upstream app identity, credentials or file-sync implementation is used.

The issue client, repository-note mapping, managed task sections, scheduler, notifications and settings are Issue Bridge implementation. OAuth requests and issue synchronization are independent of upstream's repository-file sync.

Original source/license references are pinned to the commit above. Importing future upstream changes requires an explicit comparison and validation, rather than replacing the adapted files wholesale.
