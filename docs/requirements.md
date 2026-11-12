# MVP requirements

These requirements capture the Issue Bridge concept. They describe intended behavior, not implemented capabilities.

## Repository mapping

- Read one explicit GitHub repository URL from `github_repo`; do not infer mappings from arbitrary links in note text.
- Normalize equivalent supported URL spellings before detecting duplicates. Define supported URL forms before implementation; reject ambiguous input.
- Permit one active note for each repository in a vault. If multiple notes map to the same repository, warn and skip every affected note.
- Preserve all frontmatter, unrelated note content and existing links.

## Issues and tasks

- Fetch all issues assigned to the authenticated account in the mapped repository, across open and closed states and every result page. Exclude pull requests.
- Render native Markdown tasks with issue number, escaped title and canonical URL. Use unchecked for open and checked for closed issues.
- Keep closed assigned issues visible. Reopening changes the task back to unchecked.
- After a complete successful fetch, remove tasks for issues no longer assigned to the account. A failed or partial fetch must never be interpreted as an empty result.
- Treat GitHub as authoritative in v0.1: local edits inside the managed block are replaced on the next successful synchronization. Explain this behavior in settings and documentation.
- Ensure titles containing Markdown syntax, newlines, task metadata or managed-marker text cannot create extra tasks, metadata or section boundaries.
- Use deterministic ordering and rendering. A repeated sync with identical inputs must not write the file again.

## Managed section and safe updates

- Own only the content between one `<!-- issue-bridge:start -->` and `<!-- issue-bridge:end -->` pair.
- Specify first-sync section insertion before implementing it. Preserve existing headings and content outside the block.
- Skip files with malformed, nested or multiple marker pairs and report an actionable warning.
- Detect changes between reading and writing. Re-read and safely merge or defer rather than overwrite concurrent edits.
- Allow manual synchronization and a configurable interval. Prevent overlapping runs and stop timers/work on unload.
- On offline, authentication, authorization, rate-limit, pagination or unexpected-response errors, retain the last successful block and report the error without exposing credentials.
- Removing a mapping must stop synchronization; automatic deletion of previously generated content requires an explicit policy.

## Authentication and platforms

- Target a GitHub App with user access tokens and one account per installation.
- Validate the supported desktop/mobile authorization flow, renewal requirements, app permissions and access to private organization repositories before selecting an implementation.
- Store access and refresh tokens in device-local secure storage, outside plaintext synced vault files. Do not embed a confidential client secret in a distributed plugin.
- Document required services, if any, and their operational/privacy implications before introducing one.
- Provide disconnect/revocation behavior and redact secrets from errors and logs.
- Keep repository mappings separate from credentials. Imported private issue titles and links are ordinary vault content and follow the vault's sharing/sync settings; explain this during setup.

## Acceptance checks for implementation

- Assigned open/closed issues import; title changes, close, reopen and unassign update correctly.
- Multiple API pages are complete; pull requests are excluded; failures on a later page retain existing tasks.
- Identical results cause no write; successful empty results clear only the managed block.
- Duplicate repository mappings and invalid markers never modify affected notes.
- Concurrent note edits and changes to mappings during a run do not lose user content.
- Synthetic hostile titles cannot inject Markdown tasks, Tasks dates or marker delimiters.
- Tokens are absent from note files, synced settings, committed fixtures and logs.
- Test native checkboxes and Obsidian Tasks queries in a disposable vault on desktop and mobile. Static tests alone do not establish live behavior.

## Deferred

Bidirectional sync, multiple GitHub accounts, multiple repositories per note, intentional duplicate mappings, other issue trackers, pull requests, GitHub Projects, label/milestone mapping and custom task templates.
