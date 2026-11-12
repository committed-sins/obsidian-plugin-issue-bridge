# Roadmap

## Preview 0.1.0 implemented

- TypeScript plugin, manifest, build, settings page and guarded local deployment.
- Pinned MIT auth/UI reuse with original license and documented changes.
- Device authorization, token renewal and Obsidian SecretStorage credentials.
- Note mapping, duplicate detection, paginated assigned issues and guarded task blocks.
- Manual/interval/startup/resume checks, errors, rate-limit deferral and cancellation guards.
- Device-local notification baseline, notices and persistent unread list.
- Automated tests and deployment to `C:/Users/mj/Obsidian/Test`.

## Next

1. Complete the own GitHub App registration/installation and validate real sign-in/renewal with Issues: read-only access to selected repositories.
2. Enable the plugin manually in the Test vault and run setup.md's live checks: note/editor safety, native/queried Tasks, close/reopen/unassign, duplicates, offline and new-assignment notifications.
3. Verify actual mobile networking, SecretStorage, startup/resume and OS backgrounding. Browser/host stubs do not cover those behaviors.
4. Refine settings UX based on feedback; check accessibility and large-vault performance.
5. Prepare CI, release artifacts and community-directory submission after acceptance. No public release or submission exists yet.

Future scope: bidirectional issue updates, other trackers, multiple accounts, multi-repository notes, deliberate duplicate mappings and custom task templates.
