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

Desktop acceptance completed on 2026-11-14; see validation-2026-11-14.md. Version 0.1.2 is the first public GitHub release. Real sign-in, import/state updates, notifications, plugin-reload persistence and README rendering have live evidence. Community-directory submission, mobile checks, expired-token renewal and private README access remain follow-up work.

Preview 0.1.1 also implements collapsible read-only repository Markdown blocks, with anonymous public reads, manual refresh, safe rendering and memory-only caching. Reading view and Live Preview passed desktop checks; mobile rendering still requires live checks. Private README access needs a separately approved Contents: read-only permission change.

1. Finish live validation of expired-token renewal. The selected-repository installation and real device sign-in are working for the desktop test.
2. Extend desktop acceptance with live duplicate-mapping and offline scenarios; note/editor safety, native/queried Tasks, close/reopen/unassign and new-assignment notifications passed.
3. Verify actual mobile networking, SecretStorage, startup/resume and OS backgrounding. Browser/host stubs do not cover those behaviors.
4. Refine settings UX based on feedback; check accessibility and large-vault performance.
5. Prepare community-directory submission. CI and the public GitHub release 0.1.2 are complete; no community-directory submission exists yet.

Future scope: bidirectional issue updates, other trackers, multiple accounts, multi-repository notes, deliberate duplicate mappings and custom task templates.
