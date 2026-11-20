# Changelog

## 0.1.7 — 2026-11-20

- Add an optional tag per source under Source tags, initially GitHub Issues. Default: empty; applies independently of Tasks integration.
- Validate and normalize a single tag, append without case-insensitive duplicates, and preserve existing tags when the configured tag changes or is cleared.
- Add settings, normalization, renderer and full-sync regression coverage. Typecheck, official lint, build and 62 tests pass; no new live UI verification.

## 0.1.6 — 2026-11-20

- Reuse one Octocat per rendered task even when Tasks wraps or clones decorated markup; remove existing duplicates and retain separate icons for subtasks.
- Keep icon placement stable across overlapping processors and asynchronous re-rendering without modifying Markdown, links or task metadata.
- Add wrapper, duplicate-repair, nested-task and observer regression coverage. Typecheck, official lint, build and 56 tests pass; no new live UI verification.

## 0.1.5 — 2026-11-19

- Generate six-character base-36 task IDs with collision checks against IDs in non-excluded notes and newly generated IDs in the sync batch. Keep all existing IDs and dependency references.
- Render plain issue titles followed by a number-only link and Tasks metadata; migrate old imported lines while retaining local planning.
- Place the Octocat before the title in editor, Reading view and asynchronously rendered Tasks results without storing icon markup in notes.
- Add deterministic ID-collision, migration, title-format and DOM lifecycle tests. Typecheck, official lint, build and 53 tests pass; no new live UI verification.

## 0.1.4 — 2026-11-19

- Address the Obsidian Plugin Review: use native settings headings, searchable declarative settings on 1.13+, and a shared legacy renderer for the existing 1.11.4 minimum.
- Remove regex lookbehind, unnecessary escapes and control-character regexes. Retain exact note boundaries and path validation.
- Use window timers and Obsidian icon helpers; create editor icons in the editor's owning document.
- Validate unknown GitHub, YAML, JSON and stored-state values before accessing them; retain valid credential references and synchronization state.
- Add the official Obsidian ESLint configuration to local and CI checks, rejecting warnings. Typecheck, lint, build and 46 tests pass. No new live desktop or iOS verification.

## 0.1.3 — 2026-11-14

- Configurable repository property accepting a scalar URL or mixed URL list; select the first valid GitHub repository for issue sync and README previews.
- Local GitHub Octocat icon in editor decorations and rendered task links.
- Tasks integration enabled by default: stable IDs, issue creation dates, saved emoji/Dataview format and global filter. Preserve local planning metadata across issue updates and when disabled.
- Generate and verify build-provenance attestations for all four release artifacts; shorten README.
- Automated coverage added; no new live UI verification.

## 0.1.2 — 2026-11-14

First public release, following desktop acceptance in the separate Test vault.

- Fixed issue-title escaping so ordinary punctuation and Unicode stay readable in Live Preview while Tasks metadata stays neutralized.
- Refresh settings after acknowledging newly assigned issues.
- Verified real GitHub device login, import, close/reopen, unassign, Tasks queries, periodic/startup sync and connection persistence across plugin reload; repository README rendering and unavailable-file feedback also checked live.
- Added pinned CI/release workflows and release artifact checksums. Type/build checks and all 36 tests pass.
- Mobile, live expired-token renewal and private README access remain unverified. The default app is still limited to Committed Sins installations.

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
