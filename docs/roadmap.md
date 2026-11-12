# Roadmap

## Preview 0.1.0 implemented

- TypeScript plugin, manifest, build, settings page and guarded local deployment.
- Pinned MIT auth/UI reuse with original license and documented changes.
- Device authorization, token renewal and Obsidian SecretStorage credentials.
- Organization-owned GitHub App registration with its public client ID as the default, plus a repository installation link in settings. Initial app scope is Committed Sins only.
- Note mapping, duplicate detection, paginated assigned issues and guarded task blocks.
- Manual/interval/startup/resume checks, errors, rate-limit deferral and cancellation guards.
- Device-local notification baseline, notices and persistent unread list.
- Automated tests and deployment to `C:/Users/mj/Obsidian/Test`.

## Next

1. Complete the GitHub App's selected-repository installation/approval and validate real sign-in/renewal with Issues: read-only access.
2. Enable the plugin manually in the Test vault and run setup.md's live checks: note/editor safety, native/queried Tasks, close/reopen/unassign, duplicates, offline and new-assignment notifications.
3. Verify actual mobile networking, SecretStorage, startup/resume and OS backgrounding. Browser/host stubs do not cover those behaviors.
4. Refine settings UX based on feedback; check accessibility and large-vault performance.
5. Prepare CI, release artifacts and community-directory submission after acceptance. No public release or submission exists yet.

Future scope: bidirectional issue updates, other trackers, multiple accounts, multi-repository notes, deliberate duplicate mappings and custom task templates.
