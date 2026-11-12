# Changelog

## 0.1.1 — 2026-11-12

- Added collapsible read-only `issue-bridge` Markdown blocks for README.md and other relative Markdown paths in the note's `github_repo` repository.
- Fetch on first expansion, refresh on request, link to the source and preserve the displayed preview on refresh errors.
- Support anonymous public files and authenticated private files when Contents: read-only is granted separately. No GitHub App permission change is performed.
- Render Markdown with a standalone parser and sanitized DOM, without executing local plugin processors, loading images or exposing interactive task checkboxes.
- Added bounded memory-only caching, UTF-8/file-size validation, mapping/session change guards and focused provider/rendering/lifecycle tests. All 35 tests pass; live UI verification remains pending.

## 0.1.0 — 2026-11-12

Initial development preview, deployed to the Test vault; no public release.

- Added settings, GitHub App device sign-in, token renewal and SecretStorage credentials.
- Adapted auth/UI from pinned MIT-licensed GitHub Enterprise Sync code, preserving attribution and bundled license.
- Added assigned open/closed issue imports as native tasks in mapped notes, with guarded block updates and complete-page error handling.
- Added interval/startup/resume checks, manual sync, new-assignment notices and a device-local unread list.
- Added automated provider, transformation, auth, orchestration and deployment checks.

Registered the organization-owned **Issue Bridge by Committed Sins** app and bundled its public client ID as the default, with a selected-repository installation link in settings. Its initial installation scope is Committed Sins only. Repository installation/approval, real sign-in and live desktop/mobile validation remain pending.
