# Desktop acceptance — 2026-11-14

Environment: Windows, Obsidian 1.15.1, `C:/Users/mj/Obsidian/Test`. Began with preview 0.1.1; redeployed/reloaded 0.1.2 during validation to fix title readability. Plugin activation was scoped to Test; no deployment to Continuum was performed.

## Observed live

- User completed the actual GitHub App device authorization; settings showed the connected account.
- A separate acceptance note mapped `committed-sins/obsidian-plugin-issue-bridge`. Assigned test issue #1 imported as a native task, leaving the manual local task and sentinel paragraph intact.
- Closing #1 checked its imported task. Reopening restored unchecked state.
- Creating assigned issue #2 after the initial baseline imported it and produced one unread new-issue entry. The status persisted across plugin reload. Acknowledgment reset the status-bar count to zero.
- Removing #2's assignment removed its imported task after a successful check. The original local task stayed intact. The Tasks plugin's query showed imported open/closed states and decoded issue labels correctly.
- Default periodic synchronization and the post-reload startup check fetched real GitHub changes. Reloading from 0.1.1 to 0.1.2 preserved the connection and device-local notification state.
- The `issue-bridge` README.md block expanded and loaded formatted Markdown from GitHub in Live Preview. Reading view displayed the collapsed controls and a helpful unavailable-file error for a missing Markdown path.
- Entity-encoded punctuation was visibly noisy in Live Preview in 0.1.1. Version 0.1.2 uses Markdown escapes for normal punctuation/Unicode and retains encoded Tasks metadata symbols. A regression test covers that boundary.

The two synthetic GitHub issues were closed after the acceptance run. The separate acceptance note remains in the Test vault for repeat checks. No third-party plugin settings or user notes were intentionally modified; Revision Marks, already active in Test, added its own timestamp/revision properties to the fixture.

## Automated evidence

`npm run check` passes typechecking, the browser-compatible build, and 36 tests. Tests cover pagination/partial failures, rate limits, title escaping, note/block preservation, no-op writes, duplicates, concurrent/unsaved edits, cancellation, renewal/token rotation, disconnect/unload races, safe repository Markdown, memory-cache behavior and artifact-only deployment. Fixtures contain synthetic data, not real credentials.

## Not established by this run

Actual Android/iOS behavior, expired-token renewal, private repository Markdown access, prolonged offline operation, large-vault performance and every editor concurrency combination. Synthetic checks do not replace those live observations. The app remains restricted to Committed Sins installations; permission to install elsewhere has not been enabled.
